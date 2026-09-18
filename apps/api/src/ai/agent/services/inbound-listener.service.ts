import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Subscription } from 'rxjs';
import { In, IsNull, MoreThanOrEqual, Repository } from 'typeorm';
import { RealtimeService } from '../../../realtime/realtime.service.js';
import { TelegramChatEntity } from '../../../telegram/entities/telegram-chat.entity.js';
import { TelegramMessageEntity } from '../../../telegram/entities/telegram-message.entity.js';
import { TelegramEventsService } from '../../../telegram/services/telegram-events.service.js';
import type {
  TelegramLiveEvent,
  TelegramMessageEvent,
  TelegramReadEvent,
  TelegramTypingEvent,
} from '../../../telegram/services/telegram-events.service.js';
import { AiConfig } from '../../ai.config.js';
import { AiChatStateEntity } from '../../entities/ai-chat-state.entity.js';
import { AiDraftEntity } from '../../entities/ai-draft.entity.js';
import { AiJobWorker } from '../../jobs/ai-job-worker.service.js';
import { AiJobsService } from '../../jobs/ai-jobs.service.js';
import { AiSettingsService } from '../../settings/ai-settings.service.js';
import { OPEN_DRAFT_STATUSES, glueFinalText, shouldGlue } from '../drafts/draft-decision.js';
import { reengageAfterRead } from '../funnel/touch-planner.js';
import { inboundRunAt, typingRunAt } from '../lib/debounce.js';
import { defaultRng } from '../lib/random.js';
import { OutboundService } from '../outbound/outbound.service.js';
import { ChatStateService } from './chat-state.service.js';
import { LearningService } from './learning.service.js';

/** Сколько ждать, прежде чем считать исходящее без ai_turn_id сообщением менеджера. */
const ECHO_GRACE_MS = 4_000;

/**
 * Реакция ИИ-агента на живые события Telegram (разделы 5.3, 5.5, 5.6 ТЗ):
 * входящее → дебаунс и job `inbound`; «печатает» → продление; прочтение →
 * перенос reengage; исходящее от человека → чат уходит менеджеру.
 */
@Injectable()
export class InboundListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InboundListenerService.name);
  private subscription: Subscription | null = null;

  constructor(
    @InjectRepository(TelegramChatEntity)
    private readonly chats: Repository<TelegramChatEntity>,
    @InjectRepository(TelegramMessageEntity)
    private readonly messages: Repository<TelegramMessageEntity>,
    @InjectRepository(AiDraftEntity)
    private readonly drafts: Repository<AiDraftEntity>,
    private readonly events: TelegramEventsService,
    private readonly settings: AiSettingsService,
    private readonly chatState: ChatStateService,
    private readonly learning: LearningService,
    private readonly jobs: AiJobsService,
    private readonly worker: AiJobWorker,
    private readonly outbound: OutboundService,
    private readonly realtime: RealtimeService,
    private readonly config: AiConfig,
  ) {}

  onModuleInit(): void {
    if (!this.config.enabled) return;
    this.subscription = this.events.events.subscribe((event) => {
      void this.handle(event).catch((error) => {
        this.logger.error(`Событие ${event.kind} не обработано: ${error instanceof Error ? error.message : error}`);
      });
    });
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }

  async handle(event: TelegramLiveEvent): Promise<void> {
    switch (event.kind) {
      case 'message':
        return event.direction === 'in' ? this.onInbound(event) : this.onOutgoing(event);
      case 'typing':
        return this.onTyping(event);
      case 'read':
        return this.onRead(event);
      case 'account-live':
        return this.jobs.wakeAccount(event.accountId);
      default:
        return undefined;
    }
  }

  // --- входящее -------------------------------------------------------------

  private async onInbound(event: TelegramMessageEvent): Promise<void> {
    const settings = await this.settings.get(event.accountId);
    if (!settings.enabled) return;
    const chat = event.chat;
    const state = await this.chatState.ensureForInbound(chat, settings);
    const now = new Date();

    // Клиент ответил на ход бота — засчитываем это примерам и блокам того хода.
    await this.learning.markReplied(chat.id, now).catch((error) => {
      this.logger.warn(`Чат ${chat.id}: счётчик ответов не обновлён — ${error instanceof Error ? error.message : error}`);
      return [];
    });

    // Клиент ответил — запланированное касание больше не нужно.
    if (state.nextTouchKind) {
      await this.jobs.cancel('touch', chat.accountId, chat.id);
      await this.chatState.patch(chat.id, { nextTouchKind: null, nextTouchAt: null });
    }
    if (state.mode === 'off') return;

    // В режиме `manager` ход тоже ставится в очередь — но готовит не ответ, а черновик.
    const existing = await this.jobs.findForChat(chat.id, 'inbound');
    const batchStartedAt = existing?.status === 'queued' && typeof existing.payload.batchStartedAt === 'string' ? new Date(existing.payload.batchStartedAt) : now;
    const maxSec = state.stage === 'greeting' ? settings.timings.greetingDebounceMaxSec : settings.timings.debounceMaxSec;
    const runAt = inboundRunAt({ now, batchStartedAt, debounceSec: settings.timings.debounceSec, maxSec });
    await this.jobs.enqueue({
      type: 'inbound',
      accountId: chat.accountId,
      chatId: chat.id,
      runAt,
      payload: { batchStartedAt: batchStartedAt.toISOString() },
    });
    await this.chatState.patch(chat.id, { lastClientMessageAt: now });
    this.logger.debug(`Чат ${chat.id}: входящее, ход через ${Math.round((runAt.getTime() - now.getTime()) / 1000)} с`);
  }

  private async onTyping(event: TelegramTypingEvent): Promise<void> {
    const chat = await this.chats.findOne({ where: { accountId: event.accountId, peerId: event.peerId } });
    if (!chat) return;
    const job = await this.jobs.findForChat(chat.id, 'inbound');
    if (!job || job.status !== 'queued') return;
    const settings = await this.settings.get(event.accountId);
    const state = await this.chatState.find(chat.id);
    const batchStartedAt = typeof job.payload.batchStartedAt === 'string' ? new Date(job.payload.batchStartedAt) : job.createdAt;
    const maxSec = state?.stage === 'greeting' ? settings.timings.greetingDebounceMaxSec : settings.timings.debounceMaxSec;
    const next = typingRunAt({ now: new Date(), currentRunAt: job.runAt, batchStartedAt, maxSec });
    if (!next) return;
    await this.jobs.enqueue({ type: 'inbound', accountId: chat.accountId, chatId: chat.id, runAt: next, payload: {} });
  }

  // --- прочтение -------------------------------------------------------------

  private async onRead(event: TelegramReadEvent): Promise<void> {
    const state = await this.chatState.find(event.chat.id);
    if (!state || !state.diagnosticsSentAt || state.diagnosticsReadAt) return;
    // Диагностика считается прочитанной, когда прочитаны все наши сообщения с момента её отправки.
    const unread = await this.messages.count({
      where: { chatId: event.chat.id, direction: 'out', sentAt: MoreThanOrEqual(state.diagnosticsSentAt), readAt: IsNull() },
    });
    if (unread > 0) return;
    const settings = await this.settings.get(event.accountId);
    const readAt = new Date();
    const patch: Partial<AiChatStateEntity> = { diagnosticsReadAt: readAt };
    if (state.nextTouchKind === 'reengage' && (state.mode === 'auto' || state.mode === 'supervised')) {
      const at = reengageAfterRead(readAt, settings.timings, defaultRng);
      if (!state.nextTouchAt || at < state.nextTouchAt) {
        patch.nextTouchAt = at;
        await this.jobs.enqueue({ type: 'touch', accountId: state.accountId, chatId: state.chatId, runAt: at, payload: { kind: 'reengage' } });
        await this.chatState.recordEvent(state.accountId, state.chatId, 'touch_scheduled', { kind: 'reengage', at: at.toISOString(), reason: 'read' });
      }
    }
    await this.chatState.patch(state.chatId, patch);
    await this.chatState.recordEvent(state.accountId, state.chatId, 'read', { maxId: event.maxId });
  }

  // --- исходящее от человека ------------------------------------------------------

  private async onOutgoing(event: TelegramMessageEvent): Promise<void> {
    const chat = event.chat;
    const telegramMessageId = event.message.id;
    if (this.outbound.wasSentByUs(chat.id, telegramMessageId)) return;
    const state = await this.chatState.find(chat.id);
    if (!state) return;

    // Эхо бота могло прийти раньше, чем мы записали ai_turn_id, — даём шанс.
    await sleep(ECHO_GRACE_MS);
    const row = await this.messages.findOne({ where: { chatId: chat.id, telegramMessageId } });
    if (!row || row.aiTurnId || this.outbound.wasSentByUs(chat.id, telegramMessageId)) return;

    const now = new Date();
    await this.chatState.patch(chat.id, { lastManagerMessageAt: now });
    await this.applyManagerReply(chat.id, row.id, row.text, now);

    if (state.mode === 'auto' || state.mode === 'supervised') {
      await this.jobs.cancelForChat(chat.id);
      await this.chatState.setMode(state, 'manager', 'manager_wrote', null);
      await this.chatState.recordEvent(chat.accountId, chat.id, 'manager_took_over', { telegramMessageId });
      this.logger.log(`Чат ${chat.id}: менеджер написал сам — бот отступает`);
    }
  }

  /**
   * Ответ менеджера из Telegram при висящем черновике: черновик «заменён», его
   * текст — финальный (раздел 9.1 ТЗ). Несколько сообщений подряд в течение трёх
   * минут — один ответ, чтобы обучающая тройка не рвалась на куски.
   */
  private async applyManagerReply(chatId: string, messageId: string, text: string, now: Date): Promise<void> {
    const open = await this.drafts.findOne({
      where: { chatId, status: In(OPEN_DRAFT_STATUSES) },
      order: { createdAt: 'DESC' },
    });
    if (open) {
      open.status = 'replaced';
      open.finalText = text;
      open.sentMessageIds = [messageId];
      open.decidedAt = now;
      open.decisionSource = 'telegram';
      await this.drafts.save(open);
      await this.publishDraft(open);
      return;
    }
    const recent = await this.drafts.findOne({
      where: { chatId, status: 'replaced', decisionSource: 'telegram' },
      order: { decidedAt: 'DESC' },
    });
    if (!recent || !shouldGlue(recent.decidedAt, now)) return;
    recent.finalText = glueFinalText(recent.finalText, text);
    recent.sentMessageIds = [...recent.sentMessageIds, messageId];
    recent.decidedAt = now;
    await this.drafts.save(recent);
    await this.publishDraft(recent);
  }

  private async publishDraft(draft: AiDraftEntity): Promise<void> {
    await this.realtime.publishForAccount(draft.accountId, {
      type: 'draft.updated',
      accountId: draft.accountId,
      chatId: draft.chatId,
      draftId: draft.id,
      status: draft.status,
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
