import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { TelegramChatEntity } from '../../telegram/entities/telegram-chat.entity.js';
import type { AiPausedReason } from '../../telegram/entities/telegram-chat.entity.js';
import { TelegramOutboundService } from '../../telegram/services/telegram-outbound.service.js';
import { AiConfig } from '../ai.config.js';
import type { AiAgentSettingsEntity } from '../entities/ai-agent-settings.entity.js';
import type { AlertType } from '../entities/alert.entity.js';
import type { GuardResult } from '../lib/decision-guard.js';
import { AiJobsService } from './ai-jobs.service.js';
import { AlertsService } from './alerts.service.js';

export interface HandoffInput {
  chat: TelegramChatEntity;
  settings: AiAgentSettingsEntity;
  guard: GuardResult;
  runId: string | null;
  lastClientText: string;
  confidence: number;
  reason: string;
}

/** Не чаще одного Telegram-уведомления на чат за это время. */
const NOTIFY_COOLDOWN_MS = 10 * 60_000;
/** Ошибки провайдера — один алерт на аккаунт за это время. */
const ERROR_ALERT_COOLDOWN_MS = 15 * 60_000;

/**
 * Передача клиента менеджеру: алерт, пометка чата, пауза ИИ, уведомление
 * в Telegram. Вызывается после каждого запуска ИИ по чату.
 */
@Injectable()
export class HandoffService {
  private readonly logger = new Logger(HandoffService.name);
  private readonly notifiedAt = new Map<string, number>();
  private readonly errorAlertAt = new Map<string, number>();

  constructor(
    private readonly config: AiConfig,
    private readonly alerts: AlertsService,
    private readonly outbound: TelegramOutboundService,
    private readonly jobs: AiJobsService,
    private readonly realtime: RealtimeService,
    @InjectRepository(TelegramChatEntity)
    private readonly chats: Repository<TelegramChatEntity>,
  ) {}

  /** Возвращает true, если чат передан человеку (ИИ поставлен на паузу или помечен). */
  async evaluate(input: HandoffInput): Promise<boolean> {
    const { chat, settings, guard } = input;
    if (guard.readyToPay) {
      await this.raise(chat, settings, 'ready_to_pay', input, settings.pauseOnHandoff ? 'handoff' : null);
      return true;
    }
    if (guard.needsHuman) {
      await this.raise(chat, settings, 'needs_human', input, 'needs_human');
      return true;
    }
    return false;
  }

  /** Ошибка ИИ уровня аккаунта (ключ, провайдер, предохранитель). */
  async raiseAiError(accountId: string, chatId: string | null, error: string): Promise<void> {
    const last = this.errorAlertAt.get(accountId) ?? 0;
    if (Date.now() - last < ERROR_ALERT_COOLDOWN_MS) return;
    this.errorAlertAt.set(accountId, Date.now());
    await this.alerts.create({ accountId, chatId, type: 'ai_error', payload: { error } });
  }

  /** Пауза ИИ в чате по внутренней причине (лимит, ошибка). */
  async pause(chat: TelegramChatEntity, reason: AiPausedReason): Promise<void> {
    await this.chats.update(chat.id, {
      aiPausedReason: reason,
      aiPausedAt: new Date(),
      aiFollowupNextAt: null,
    });
    await this.jobs.cancelForChat(chat.id);
    await this.realtime.publishForAccount(chat.accountId, { type: 'chat.updated', accountId: chat.accountId, chatId: chat.id });
  }

  // --- внутреннее -----------------------------------------------------------

  private async raise(
    chat: TelegramChatEntity,
    settings: AiAgentSettingsEntity,
    type: AlertType,
    input: HandoffInput,
    pauseReason: AiPausedReason | null,
  ): Promise<void> {
    const { alert, created } = await this.alerts.create({
      accountId: chat.accountId,
      chatId: chat.id,
      type,
      payload: {
        reason: input.reason || input.guard.notes.join(', '),
        stage: input.guard.stage,
        confidence: input.confidence,
        lastClientText: input.lastClientText.slice(0, 300),
        aiRunId: input.runId ?? undefined,
      },
    });

    await this.chats.update(chat.id, {
      needsAttention: true,
      attentionReason: type,
      attentionAt: alert.createdAt,
      ...(pauseReason ? { aiPausedReason: pauseReason, aiPausedAt: new Date(), aiFollowupNextAt: null } : {}),
    });
    if (pauseReason) await this.jobs.cancel('followup', chat.accountId, chat.id);
    await this.realtime.publishForAccount(chat.accountId, { type: 'chat.updated', accountId: chat.accountId, chatId: chat.id });

    if (created && settings.notifyTelegram) await this.notify(chat, settings, type, input);
    this.logger.log(`Чат ${chat.id}: ${type}${pauseReason ? `, ИИ на паузе (${pauseReason})` : ''}`);
  }

  private async notify(
    chat: TelegramChatEntity,
    settings: AiAgentSettingsEntity,
    type: AlertType,
    input: HandoffInput,
  ): Promise<void> {
    const last = this.notifiedAt.get(chat.id) ?? 0;
    if (Date.now() - last < NOTIFY_COOLDOWN_MS) return;
    this.notifiedAt.set(chat.id, Date.now());

    const title = type === 'ready_to_pay' ? '🔔 Готов к оплате' : '🙋 Нужен менеджер';
    const who = [chat.peerName, chat.peerUsername ? `@${chat.peerUsername}` : null].filter(Boolean).join(' ');
    const quote = input.lastClientText.replace(/\s+/g, ' ').trim().slice(0, 200);
    const link = `${this.config.webUrl}/accounts/${chat.accountId}/chats/${chat.id}`;
    const text = [`${title}: ${who}`, quote ? `«${quote}»` : null, `Открыть: ${link}`].filter(Boolean).join('\n');

    try {
      await this.outbound.sendToPeer(chat.accountId, settings.handoffPeer ?? 'me', text);
    } catch (error) {
      this.logger.warn(`Чат ${chat.id}: уведомление в Telegram не ушло — ${error instanceof Error ? error.message : error}`);
    }
  }
}
