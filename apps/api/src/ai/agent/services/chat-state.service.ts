import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { RealtimeService } from '../../../realtime/realtime.service.js';
import { TelegramChatEntity } from '../../../telegram/entities/telegram-chat.entity.js';
import { TelegramMessageEntity } from '../../../telegram/entities/telegram-message.entity.js';
import type { AiEventKind, ChatMode, FunnelStage } from '../../domain/types.js';
import { AiAccountSettingsEntity } from '../../entities/ai-account-settings.entity.js';
import { AiChatStateEntity } from '../../entities/ai-chat-state.entity.js';
import { AiEventEntity } from '../../entities/ai-event.entity.js';
import { AiJobsService } from '../../jobs/ai-jobs.service.js';
import { emptyCard } from '../card/client-card.js';

/** Состояние изменилось под нами (ход и таймер наперегонки) — ход повторяется заново. */
export class StaleStateError extends Error {
  constructor(chatId: string) {
    super(`Состояние чата ${chatId} изменилось во время хода`);
    this.name = 'StaleStateError';
  }
}

/**
 * Состояние воронки чата: создание при первом входящем, режимы, события,
 * оптимистичная блокировка через `version`.
 */
@Injectable()
export class ChatStateService {
  private readonly logger = new Logger(ChatStateService.name);

  constructor(
    @InjectRepository(AiChatStateEntity)
    private readonly states: Repository<AiChatStateEntity>,
    @InjectRepository(AiEventEntity)
    private readonly events: Repository<AiEventEntity>,
    @InjectRepository(TelegramMessageEntity)
    private readonly messages: Repository<TelegramMessageEntity>,
    private readonly jobs: AiJobsService,
    private readonly realtime: RealtimeService,
  ) {}

  find(chatId: string): Promise<AiChatStateEntity | null> {
    return this.states.findOne({ where: { chatId } });
  }

  findMany(chatIds: string[]): Promise<AiChatStateEntity[]> {
    if (chatIds.length === 0) return Promise.resolve([]);
    return this.states.find({ where: { chatId: In(chatIds) } });
  }

  listForAccount(accountId: string): Promise<AiChatStateEntity[]> {
    return this.states.find({ where: { accountId } });
  }

  /**
   * Состояние для чата, в который пришло входящее. Новый входящий диалог
   * (первое сообщение — от клиента, наших ещё не было) → режим по умолчанию
   * аккаунта; чат с историей → manager (черновики) или off.
   */
  async ensureForInbound(chat: TelegramChatEntity, settings: AiAccountSettingsEntity): Promise<AiChatStateEntity> {
    const existing = await this.find(chat.id);
    if (existing) return existing;

    const ourMessages = await this.messages.count({ where: { chatId: chat.id, direction: 'out' } });
    const isLead = chat.firstMessageDirection !== 'out' && ourMessages === 0;
    const mode: ChatMode = isLead ? settings.defaultChatMode : settings.assistantForExistingChats ? 'manager' : 'off';
    // Пол и язык не угадываем: их заполнит модель на первом же ходе, увидев
    // имя клиента и его сообщения. Имя в Telegram уходит ей в промпт.
    const language = settings.persona.language || 'ru';

    try {
      const created = await this.states.save(
        this.states.create({
          chatId: chat.id,
          accountId: chat.accountId,
          mode,
          stage: 'greeting',
          stageEnteredAt: new Date(),
          funnelStartedAt: isLead ? new Date() : null,
          language,
          card: emptyCard(language),
          // Всё, что было до включения бота, ходом не считается.
          lastHandledMessageId: isLead ? 0 : chat.lastTelegramMessageId,
        }),
      );
      await this.recordEvent(chat.accountId, chat.id, 'mode_changed', { from: null, to: mode, reason: isLead ? 'new_lead' : 'existing_chat' });
      await this.publishFunnel(created);
      return created;
    } catch (error) {
      const winner = await this.find(chat.id);
      if (winner) return winner;
      throw error;
    }
  }

  /** Обновление с проверкой версии: если состояние изменилось — StaleStateError. */
  async apply(state: AiChatStateEntity, patch: Partial<AiChatStateEntity>): Promise<AiChatStateEntity> {
    const nextVersion = state.version + 1;
    const result = await this.states.update({ id: state.id, version: state.version }, { ...patch, version: nextVersion });
    if (!result.affected) throw new StaleStateError(state.chatId);
    Object.assign(state, patch, { version: nextVersion });
    return state;
  }

  /** Обновление без проверки версии — для событий, где гонка не страшна (прочтение, отметка менеджера). */
  async patch(chatId: string, patch: Partial<AiChatStateEntity>): Promise<void> {
    await this.states.update({ chatId }, patch);
  }

  async setMode(
    state: AiChatStateEntity,
    mode: ChatMode,
    reason: string,
    byUserId: string | null,
    extra: Partial<AiChatStateEntity> = {},
  ): Promise<AiChatStateEntity> {
    const from = state.mode;
    const patch: Partial<AiChatStateEntity> = { mode, ...extra };
    if (mode === 'manager' || mode === 'off') {
      patch.nextTouchKind = null;
      patch.nextTouchAt = null;
      await this.jobs.cancel('touch', state.accountId, state.chatId);
    }
    if (mode === 'auto' || mode === 'supervised') {
      patch.handoffReason = null;
      patch.handoffAt = null;
    }
    await this.apply(state, patch);
    await this.recordEvent(state.accountId, state.chatId, 'mode_changed', { from, to: mode, reason, byUserId });
    if (mode === 'manager' || mode === 'off') {
      await this.recordEvent(state.accountId, state.chatId, 'touch_cancelled', { reason });
    }
    await this.publishFunnel(state);
    return state;
  }

  async setStage(state: AiChatStateEntity, stage: FunnelStage, reason: string): Promise<void> {
    if (state.stage === stage) return;
    const from = state.stage;
    await this.apply(state, { stage, stageEnteredAt: new Date() });
    await this.recordEvent(state.accountId, state.chatId, 'stage_changed', { from, to: stage, reason });
  }

  async recordEvent(accountId: string, chatId: string | null, kind: AiEventKind, payload: Record<string, unknown>): Promise<void> {
    try {
      await this.events.save(this.events.create({ accountId, chatId, kind, payload }));
    } catch (error) {
      this.logger.warn(`Событие ${kind} не записано: ${error instanceof Error ? error.message : error}`);
    }
  }

  async publishFunnel(state: AiChatStateEntity): Promise<void> {
    await this.realtime.publishForAccount(state.accountId, {
      type: 'funnel.updated',
      accountId: state.accountId,
      chatId: state.chatId,
      stage: state.stage,
      mode: state.mode,
      nextTouchAt: state.nextTouchAt?.toISOString() ?? null,
    });
  }
}
