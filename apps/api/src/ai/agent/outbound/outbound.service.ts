import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { RealtimeService } from '../../../realtime/realtime.service.js';
import { TelegramChatEntity } from '../../../telegram/entities/telegram-chat.entity.js';
import { TelegramMessageEntity } from '../../../telegram/entities/telegram-message.entity.js';
import { TelegramIngestService } from '../../../telegram/services/telegram-ingest.service.js';
import { TelegramOutboundService } from '../../../telegram/services/telegram-outbound.service.js';
import { AiConfig } from '../../ai.config.js';
import type { TurnMessage } from '../../entities/ai-turn.entity.js';
import type { ComposedMessage } from '../agent.types.js';
import { defaultRng } from '../lib/random.js';
import type { Rng } from '../lib/random.js';
import { betweenMessagesMs, readingPauseMs, typingMs } from './timing.js';

export interface SendTurnParams {
  accountId: string;
  chat: TelegramChatEntity;
  turnId: string;
  messages: ComposedMessage[];
  /** С какого сообщения продолжать (после сбоя посередине). */
  startIndex?: number;
  /** Уже отправленные сообщения (при продолжении). */
  alreadySent?: TurnMessage[];
  /** Для паузы «на чтение»: сколько символов прислал клиент; null — касание. */
  inboundChars: number | null;
  markRead: boolean;
  /** Граница обработанных входящих: всё, что новее, — «клиент написал во время отправки». */
  lastHandledMessageId: number;
  /** Продлить блокировку job'а и сохранить прогресс. */
  onProgress?: (sent: TurnMessage[]) => Promise<void>;
  rng?: Rng;
}

export interface SendTurnResult {
  sent: TurnMessage[];
  /** Часть сообщений отменена: клиент написал во время отправки. */
  interrupted: boolean;
}

/** Отправка оборвалась на полпути: что успели, и почему. */
export class OutboundInterruptedError extends Error {
  constructor(
    readonly sent: TurnMessage[],
    readonly nextIndex: number,
    readonly cause: unknown,
  ) {
    super(`Отправка прервана после ${sent.length} сообщений: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'OutboundInterruptedError';
  }
}

const RECENT_TTL_MS = 60_000;

/**
 * Отправка хода по-человечески (раздел 7 ТЗ): пауза «на чтение»,
 * «печатает» по длине текста, пауза между сообщениями, проверка новых
 * входящих. Диагностика доотправляется целиком.
 */
@Injectable()
export class OutboundService {
  private readonly logger = new Logger(OutboundService.name);
  /** Только что отправленные нами id — чтобы слушатель отличил эхо бота от ответа менеджера. */
  private readonly recentlySent = new Map<string, number>();

  constructor(
    @InjectRepository(TelegramMessageEntity)
    private readonly messages: Repository<TelegramMessageEntity>,
    private readonly telegram: TelegramOutboundService,
    private readonly ingest: TelegramIngestService,
    private readonly realtime: RealtimeService,
    private readonly config: AiConfig,
  ) {}

  isOnline(accountId: string): boolean {
    return this.telegram.isOnline(accountId);
  }

  /** Сообщение с этим id отправил бот (эхо из Telegram — не менеджер). */
  wasSentByUs(chatId: string, telegramMessageId: number): boolean {
    this.pruneRecent();
    return this.recentlySent.has(`${chatId}:${telegramMessageId}`);
  }

  async sendTurn(params: SendTurnParams): Promise<SendTurnResult> {
    const rng = params.rng ?? defaultRng;
    const sent: TurnMessage[] = [...(params.alreadySent ?? [])];
    const start = params.startIndex ?? 0;
    const { chat, accountId } = params;

    try {
      if (start === 0 && params.inboundChars !== null) {
        if (params.markRead) await this.telegram.markRead(accountId, chat);
        await this.pause(readingPauseMs(params.inboundChars, rng));
      }

      for (let index = start; index < params.messages.length; index += 1) {
        const message = params.messages[index];
        await this.telegram.setTyping(accountId, chat, true);
        await this.pause(typingMs(message.text.length, rng));

        const result = await this.telegram.sendText(accountId, chat, message.text);
        this.remember(chat.id, result.id);
        const row = await this.ingest.storeOwnOutgoing(chat, result, params.turnId);
        sent.push({ text: message.text, blockId: message.blockId, telegramMessageId: row.telegramMessageId, sentAt: row.sentAt.toISOString() });
        await this.realtime.publishForAccount(accountId, { type: 'message.created', accountId, chatId: chat.id });
        if (params.onProgress) await params.onProgress(sent);

        const isLast = index === params.messages.length - 1;
        if (isLast) break;

        await this.pause(betweenMessagesMs(rng));
        // Клиент написал, пока мы отправляли: остаток отменяем — кроме диагностики, она уходит целиком.
        const next = params.messages[index + 1];
        if (next.blockKind !== 'diagnostics' && (await this.hasNewInbound(chat.id, params.lastHandledMessageId))) {
          await this.telegram.setTyping(accountId, chat, false);
          this.logger.log(`Чат ${chat.id}: клиент написал во время отправки — остаток хода отменён`);
          return { sent, interrupted: true };
        }
      }
      return { sent, interrupted: false };
    } catch (error) {
      await this.telegram.setTyping(accountId, chat, false).catch(() => undefined);
      throw new OutboundInterruptedError(sent, sent.length, error);
    }
  }

  async hasNewInbound(chatId: string, lastHandledMessageId: number): Promise<boolean> {
    const count = await this.messages.count({
      where: { chatId, direction: 'in', telegramMessageId: MoreThan(lastHandledMessageId) },
    });
    return count > 0;
  }

  // --- внутреннее -----------------------------------------------------------

  private pause(ms: number): Promise<void> {
    if (!this.config.humanDelays) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private remember(chatId: string, telegramMessageId: number): void {
    this.pruneRecent();
    this.recentlySent.set(`${chatId}:${telegramMessageId}`, Date.now());
  }

  private pruneRecent(): void {
    const cutoff = Date.now() - RECENT_TTL_MS;
    for (const [key, at] of this.recentlySent) if (at < cutoff) this.recentlySent.delete(key);
  }
}
