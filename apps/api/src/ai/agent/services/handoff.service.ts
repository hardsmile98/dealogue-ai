import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { RealtimeService } from '../../../realtime/realtime.service.js';
import type { TelegramChatEntity } from '../../../telegram/entities/telegram-chat.entity.js';
import type { DraftKind, DraftStatus, HandoffReason } from '../../domain/types.js';
import { AiDraftEntity } from '../../entities/ai-draft.entity.js';
import { AiTurnEntity } from '../../entities/ai-turn.entity.js';
import type { AiChatStateEntity } from '../../entities/ai-chat-state.entity.js';
import type { AlertType } from '../../entities/alert.entity.js';
import { AiJobsService } from '../../jobs/ai-jobs.service.js';
import { AlertsService } from '../../alerts/alerts.service.js';
import type { ComposedMessage, HistoryMessage } from '../agent.types.js';
import { PROMPT_VERSION } from '../composer/prompt-builder.js';
import { OPEN_DRAFT_STATUSES } from '../drafts/draft-decision.js';
import { toTurnMessage } from '../lib/turn-message.js';
import { ChatStateService } from './chat-state.service.js';

/** По какому поводу заведён алерт — от причины передачи. */
const ALERT_TYPES: Partial<Record<HandoffReason, AlertType>> = {
  minor: 'minor',
  media: 'media',
  stale_lead: 'stale_lead',
  provider_error: 'ai_error',
};

/**
 * Передача чата менеджеру (раздел 8 ТЗ) и черновик, который он увидит.
 * Один вход для всех поводов: бот переводит чат в режим `manager`, пишет
 * событие, создаёт черновик, заводит алерт и просит уведомить в Telegram.
 */
@Injectable()
export class HandoffService {
  private readonly logger = new Logger(HandoffService.name);

  constructor(
    @InjectRepository(AiDraftEntity)
    private readonly drafts: Repository<AiDraftEntity>,
    @InjectRepository(AiTurnEntity)
    private readonly turns: Repository<AiTurnEntity>,
    private readonly chatState: ChatStateService,
    private readonly alerts: AlertsService,
    private readonly jobs: AiJobsService,
    private readonly realtime: RealtimeService,
  ) {}

  async handoff(
    state: AiChatStateEntity,
    chat: TelegramChatEntity,
    reason: HandoffReason,
    detail: string,
    batch: HistoryMessage[],
    draftMessages: ComposedMessage[],
    turnId: string | null,
    rationale: string | null,
  ): Promise<AiDraftEntity> {
    await this.chatState.setMode(state, 'manager', `handoff:${reason}`, null, { handoffReason: reason, handoffAt: new Date() });
    await this.chatState.recordEvent(chat.accountId, chat.id, 'handoff', { reason, detail, turnId });
    // Модель не ответила — классифицировать нечего, менеджер решает сам.
    const status: DraftStatus = reason === 'provider_error' ? 'pending_classification' : 'pending';
    const draft = await this.createDraft('handoff', status, state, chat, batch, reason, draftMessages, rationale ?? detail, turnId);
    await this.alerts.create({
      accountId: chat.accountId,
      chatId: chat.id,
      type: ALERT_TYPES[reason] ?? 'handoff',
      payload: {
        reason,
        stage: state.stage,
        lastClientText: batch.length > 0 ? batch[batch.length - 1].text.slice(0, 200) : undefined,
        draftId: draft.id,
        turnId: turnId ?? undefined,
        detail,
      },
    });
    this.logger.log(`Чат ${chat.id}: передан менеджеру (${reason}) — ${detail}`);
    return draft;
  }

  async createDraft(
    kind: DraftKind,
    status: DraftStatus,
    state: AiChatStateEntity,
    chat: TelegramChatEntity,
    batch: HistoryMessage[],
    reason: HandoffReason | null,
    messages: ComposedMessage[],
    rationale: string | null,
    turnId: string | null,
  ): Promise<AiDraftEntity> {
    // Новое входящее при висящем черновике — старый устаревает.
    await this.drafts.update({ chatId: chat.id, status: In(OPEN_DRAFT_STATUSES) }, { status: 'superseded', decidedAt: new Date() });
    // На что опирался ход — видно в карточке черновика; у хода это уже посчитано.
    const turn = turnId ? await this.turns.findOne({ where: { id: turnId } }) : null;
    const draft = await this.drafts.save(
      this.drafts.create({
        accountId: chat.accountId,
        chatId: chat.id,
        turnId,
        kind,
        status,
        clientMessageIds: batch.map((m) => m.id),
        clientText: batch.map((m) => m.text).join('\n'),
        handoffReason: reason,
        draftMessages: messages.map(toTurnMessage),
        draftRationale: rationale,
        similarCaseIds: turn?.similarCaseIds ?? [],
        promptVersion: PROMPT_VERSION,
      }),
    );
    await this.realtime.publishForAccount(chat.accountId, { type: 'draft.created', accountId: chat.accountId, chatId: chat.id, draftId: draft.id });
    // Уведомление в Telegram — отдельным job'ом: аккаунт может быть офлайн (раздел 7 ТЗ).
    await this.jobs.enqueue({
      type: 'notify',
      accountId: chat.accountId,
      chatId: chat.id,
      runAt: new Date(),
      dedupeKey: `notify:${draft.id}`,
      payload: { draftId: draft.id },
      maxAttempts: 3,
    });
    return draft;
  }
}
