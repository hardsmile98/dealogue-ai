import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { RealtimeService } from '../../../realtime/realtime.service.js';
import { TelegramAccountEntity } from '../../../telegram/entities/telegram-account.entity.js';
import { TelegramChatEntity } from '../../../telegram/entities/telegram-chat.entity.js';
import { TelegramMessageEntity } from '../../../telegram/entities/telegram-message.entity.js';
import type { DraftStatus } from '../../domain/types.js';
import { AiAccountSettingsEntity } from '../../entities/ai-account-settings.entity.js';
import { AiChatStateEntity } from '../../entities/ai-chat-state.entity.js';
import { AiDiagnosticEntity } from '../../entities/ai-diagnostic.entity.js';
import { AiDraftEntity } from '../../entities/ai-draft.entity.js';
import { AiPhraseEntity } from '../../entities/ai-phrase.entity.js';
import { AiTurnEntity } from '../../entities/ai-turn.entity.js';
import type { TurnMessage } from '../../entities/ai-turn.entity.js';
import type { DraftToExampleInput, DraftToNoteInput, DraftsQueryInput, SendDraftInput } from '../../dto/ai-drafts.schema.js';
import { AiLibraryService } from '../../library/library.service.js';
import { AiJobsService } from '../../services/ai-jobs.service.js';
import { AiSettingsService } from '../../services/ai-settings.service.js';
import { toDraftDto, toDraftListItemDto } from '../agent.dto.js';
import type { DraftDto, DraftListItemDto } from '../agent.dto.js';
import type { ComposedMessage } from '../agent.types.js';
import { OPEN_DRAFT_STATUSES, decideStatus, isOpen, sameMessages } from '../drafts/draft-decision.js';
import { OutboundInterruptedError, OutboundService } from '../outbound/outbound.service.js';
import { AgentService, toTurnMessage } from './agent.service.js';
import { ChatStateService, StaleStateError } from './chat-state.service.js';

const DEFAULT_LIMIT = 30;

/**
 * Очередь черновиков и решения менеджера по ним (разделы 8.3, 9.1 ТЗ):
 * отправить как есть / с правками / свой ответ / не отвечать, переписать,
 * сохранить как пример или заметку.
 */
@Injectable()
export class DraftsService {
  private readonly logger = new Logger(DraftsService.name);

  constructor(
    @InjectRepository(AiDraftEntity)
    private readonly drafts: Repository<AiDraftEntity>,
    @InjectRepository(AiTurnEntity)
    private readonly turns: Repository<AiTurnEntity>,
    @InjectRepository(AiChatStateEntity)
    private readonly states: Repository<AiChatStateEntity>,
    @InjectRepository(TelegramChatEntity)
    private readonly chats: Repository<TelegramChatEntity>,
    @InjectRepository(TelegramAccountEntity)
    private readonly accounts: Repository<TelegramAccountEntity>,
    @InjectRepository(TelegramMessageEntity)
    private readonly messages: Repository<TelegramMessageEntity>,
    @InjectRepository(AiPhraseEntity)
    private readonly phrases: Repository<AiPhraseEntity>,
    @InjectRepository(AiDiagnosticEntity)
    private readonly diagnostics: Repository<AiDiagnosticEntity>,
    private readonly chatState: ChatStateService,
    private readonly settings: AiSettingsService,
    private readonly outbound: OutboundService,
    private readonly library: AiLibraryService,
    private readonly jobs: AiJobsService,
    private readonly realtime: RealtimeService,
    private readonly agent: AgentService,
  ) {}

  // ---------------------------------------------------------------------------
  // Очередь
  // ---------------------------------------------------------------------------

  listForAccount(accountId: string, query: DraftsQueryInput): Promise<DraftListItemDto[]> {
    return this.list([accountId], query);
  }

  /** Очередь по всем аккаунтам владельца — для страницы «Требуют внимания». */
  async listForUser(userId: string, query: DraftsQueryInput): Promise<DraftListItemDto[]> {
    const rows = await this.accounts.find({ where: { userId }, select: { id: true } });
    if (rows.length === 0) return [];
    return this.list(rows.map((r) => r.id), query);
  }

  private async list(accountIds: string[], query: DraftsQueryInput): Promise<DraftListItemDto[]> {
    const statuses = parseStatuses(query.status);
    const rows = await this.drafts.find({
      where: {
        accountId: In(accountIds),
        ...(statuses ? { status: In(statuses) } : {}),
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.cursor ? { createdAt: LessThan(new Date(query.cursor)) } : {}),
      },
      order: { createdAt: 'DESC' },
      take: query.limit ?? DEFAULT_LIMIT,
    });
    if (rows.length === 0) return [];

    const chatIds = [...new Set(rows.map((r) => r.chatId))];
    const [chats, states, accounts] = await Promise.all([
      this.chats.find({ where: { id: In(chatIds) } }),
      this.states.find({ where: { chatId: In(chatIds) } }),
      this.accounts.find({ where: { id: In([...new Set(rows.map((r) => r.accountId))]) } }),
    ]);
    const chatMap = new Map(chats.map((c) => [c.id, c]));
    const stateMap = new Map(states.map((s) => [s.chatId, s]));
    const accountMap = new Map(accounts.map((a) => [a.id, a]));
    return rows.map((row) => {
      const chat = chatMap.get(row.chatId);
      const state = stateMap.get(row.chatId);
      const account = accountMap.get(row.accountId);
      return toDraftListItemDto(
        row,
        state ? { stage: state.stage, mode: state.mode } : null,
        chat ? { peerName: chat.peerName, peerUsername: chat.peerUsername } : null,
        account ? { displayName: account.displayName, phone: account.phone } : null,
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Решения менеджера
  // ---------------------------------------------------------------------------

  /**
   * Отправить черновик клиенту: как есть, с правками или свой ответ. Ход под
   * контролем (`supervised`) после отправки закрывается как обычный ход бота —
   * с этапом, счётчиками и следующим касанием.
   */
  async send(accountId: string, draftId: string, input: SendDraftInput, userId: string): Promise<DraftDto> {
    const draft = await this.requireOpen(accountId, draftId);
    const chat = await this.requireChat(draft.chatId);
    const settings = await this.settings.get(accountId);
    const messages = input.messages.map((text) => text.trim()).filter(Boolean);
    if (messages.length === 0) throw new BadRequestException('Пустой ответ');
    if (!settings.dryRun && !this.outbound.isOnline(accountId)) {
      throw new ServiceUnavailableException('Аккаунт не подключён к Telegram');
    }

    const state = await this.chatState.find(draft.chatId);
    const turn = draft.turnId ? await this.turns.findOne({ where: { id: draft.turnId } }) : null;
    const composed = await this.composeFinal(draft, messages);
    const now = new Date();

    // Ход под контролем уходит с ai_turn_id (это сообщение бота), ответ на
    // передачу — без него: писал человек (раздел 5.6 ТЗ).
    const asBotTurn = draft.kind === 'supervised' && turn !== null;

    let sent: TurnMessage[] = [];
    if (!settings.dryRun) {
      try {
        const result = await this.outbound.sendTurn({
          accountId,
          chat,
          turnId: asBotTurn ? (turn as AiTurnEntity).id : null,
          messages: composed,
          inboundChars: draft.clientMessageIds.length > 0 ? 0 : null,
          markRead: settings.markRead,
          lastHandledMessageId: state?.lastHandledMessageId ?? chat.lastTelegramMessageId,
        });
        sent = result.sent;
      } catch (error) {
        if (!(error instanceof OutboundInterruptedError) || error.sent.length === 0) {
          const detail = error instanceof Error ? error.message : String(error);
          throw new ServiceUnavailableException(`Не удалось отправить: ${detail}`);
        }
        // Часть сообщений ушла — черновик считаем решённым, остаток менеджер допишет сам.
        sent = error.sent;
        this.logger.warn(`Черновик ${draft.id}: отправлено ${sent.length} из ${composed.length} — ${error.message}`);
      }
    }

    const status = decideStatus(draft.draftMessages.map((m) => m.text), messages, input.own);
    draft.status = status;
    draft.finalText = messages.join('\n');
    draft.sentMessageIds = await this.messageIdsOf(chat.id, sent);
    draft.decidedBy = userId;
    draft.decidedAt = now;
    draft.decisionSource = 'web';
    await this.drafts.save(draft);
    await this.publish(draft);

    if (asBotTurn && state) {
      // Пока шла отправка (паузы «печатает»), состояние могло измениться — берём свежее.
      const fresh = (await this.chatState.find(chat.id)) ?? state;
      try {
        await this.closeBotTurn(chat, fresh, settings, turn as AiTurnEntity, composed, sent, now);
      } catch (error) {
        // Сообщение уже ушло и черновик решён: гонку состояния не превращаем в ошибку менеджеру.
        if (!(error instanceof StaleStateError)) throw error;
        this.logger.warn(`Черновик ${draft.id}: ${error.message} — этап и касание пересчитает следующий ход`);
      }
    } else {
      await this.chatState.patch(chat.id, { lastManagerMessageAt: now });
      if (state) {
        state.lastManagerMessageAt = now;
        await this.chatState.publishFunnel(state);
      }
    }
    this.logger.log(`Черновик ${draft.id}: ${status}${settings.dryRun ? ' (сухой прогон, ничего не ушло)' : `, ушло ${sent.length} сообщ.`}`);
    return toDraftDto(draft);
  }

  /** «Не отвечать»: черновик закрыт; касание под контролем переносится, чтобы воронка не замирала. */
  async dismiss(accountId: string, draftId: string, userId: string): Promise<DraftDto> {
    const draft = await this.requireOpen(accountId, draftId);
    draft.status = 'dismissed';
    draft.decidedBy = userId;
    draft.decidedAt = new Date();
    draft.decisionSource = 'web';
    await this.drafts.save(draft);
    await this.publish(draft);

    const turn = draft.turnId ? await this.turns.findOne({ where: { id: draft.turnId } }) : null;
    if (draft.kind === 'supervised' && turn?.touchKind && turn.trigger !== 'inbound') {
      const state = await this.chatState.find(draft.chatId);
      if (state && state.mode === 'supervised') {
        const at = await this.agent.postponeTouch(state, turn.touchKind, 'draft_dismissed', { draftId: draft.id });
        this.logger.log(`Черновик ${draft.id}: отклонён, касание ${turn.touchKind} перенесено на ${at.toISOString()}`);
      }
    }
    if (turn && turn.outcome === 'awaiting_approval') {
      await this.turns.update(turn.id, { outcome: 'cancelled', error: 'Менеджер отклонил черновик' });
    }
    return toDraftDto(draft);
  }

  /** Переписать черновик заново — тем же вызовом модели, что готовил его. */
  async regenerate(accountId: string, draftId: string): Promise<DraftDto> {
    const draft = await this.requireOpen(accountId, draftId);
    const updated = await this.agent.regenerateDraft(draft);
    return toDraftDto(updated);
  }

  /** Сохранить текст (черновика или ответа менеджера) как образец в библиотеку. */
  async toExample(accountId: string, draftId: string, input: DraftToExampleInput): Promise<{ id: string }> {
    const draft = await this.requireDraft(accountId, draftId);
    const phrase = await this.library.createPhrase(
      accountId,
      {
        usage: 'example',
        kind: input.kind,
        categoryKey: null,
        gender: null,
        language: 'ru',
        title: input.title || `Из черновика ${draft.createdAt.toISOString().slice(0, 10)}`,
        text: input.text,
        conditions: {},
        enabled: true,
        weight: 1,
        sortOrder: 0,
      },
      'manual',
    );
    return { id: phrase.id };
  }

  /** Сохранить вывод менеджера как заметку — она подмешивается в каждый ход по scope. */
  async toNote(accountId: string, draftId: string, input: DraftToNoteInput): Promise<{ id: string }> {
    await this.requireDraft(accountId, draftId);
    const note = await this.library.createNote(accountId, { text: input.text, scope: input.scope, enabled: true }, 'manual');
    return { id: note.id };
  }

  // ---------------------------------------------------------------------------
  // Внутреннее
  // ---------------------------------------------------------------------------

  /**
   * Правка менеджера снимает с сообщения метку блока: дословным остаётся
   * только то, что он не трогал. Диагностику помечаем видом блока, чтобы она
   * дослалась целиком, если клиент напишет во время отправки.
   */
  private async composeFinal(draft: AiDraftEntity, messages: string[]): Promise<ComposedMessage[]> {
    const blockIds = draft.draftMessages.map((m) => m.blockId).filter((id): id is string => Boolean(id));
    const diagnosticIds = blockIds.length > 0 ? (await this.diagnostics.find({ where: { id: In(blockIds) }, select: { id: true } })).map((d) => d.id) : [];
    return messages.map((text, index) => {
      const source = draft.draftMessages[index];
      const untouched = source !== undefined && sameMessages([source.text], [text]);
      const blockId = untouched ? (source.blockId ?? null) : null;
      return { text, blockKind: blockId && diagnosticIds.includes(blockId) ? 'diagnostics' : null, blockId };
    });
  }

  /** Подтверждённый ход под контролем закрывается как обычный ход бота. */
  private async closeBotTurn(
    chat: TelegramChatEntity,
    state: AiChatStateEntity,
    settings: AiAccountSettingsEntity,
    turn: AiTurnEntity,
    composed: ComposedMessage[],
    sent: TurnMessage[],
    now: Date,
  ): Promise<void> {
    const planned = composed.map(toTurnMessage);
    const blockIds = planned.map((m) => m.blockId).filter((id): id is string => Boolean(id));
    const [phraseRows, diagnosticRows, discount] = await Promise.all([
      blockIds.length > 0 ? this.phrases.find({ where: { id: In(blockIds) }, select: { id: true } }) : [],
      blockIds.length > 0 ? this.diagnostics.find({ where: { id: In(blockIds) }, select: { id: true } }) : [],
      this.phrases.findOne({ where: { accountId: chat.accountId, usage: 'block', kind: 'discount', enabled: true }, select: { id: true } }),
    ]);
    // Ждавший подтверждения таймаут больше не нужен — следующее касание поставит finishTurn.
    await this.jobs.cancel('touch', chat.accountId, chat.id);
    const progress = typeof turn.analysis?.stageProgress === 'string' ? turn.analysis.stageProgress : 'stay';
    const stageBefore = turn.stageBefore ?? state.stage;
    const stageAfter = this.agent.stageAfter({
      state,
      stage: stageBefore,
      trigger: turn.trigger,
      touchKind: turn.touchKind,
      progress,
      requestKnown: Boolean(state.requestSummary),
      hasDiscountBlock: Boolean(discount),
      settings,
    });

    turn.messagesPlanned = planned;
    turn.messagesSent = sent;
    turn.stageAfter = stageAfter;
    turn.outcome = settings.dryRun ? 'dry_run' : 'sent';
    await this.turns.save(turn);

    await this.agent.finishTurn({
      chat,
      state,
      settings,
      refs: {
        // Образцы этого хода не сохранены — считаем только то, что реально ушло.
        exampleIds: [],
        phraseBlockIds: phraseRows.map((p) => p.id),
        diagnosticIds: diagnosticRows.map((d) => d.id),
        hasDiscountBlock: Boolean(discount),
      },
      turn,
      sent,
      planned,
      stageBefore,
      stageAfter,
      trigger: turn.trigger,
      touchKind: turn.touchKind,
      now,
    });
  }

  private async messageIdsOf(chatId: string, sent: TurnMessage[]): Promise<string[]> {
    const ids = sent.map((m) => m.telegramMessageId).filter((id): id is number => typeof id === 'number');
    if (ids.length === 0) return [];
    const rows = await this.messages.find({ where: { chatId, telegramMessageId: In(ids) }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  private async requireDraft(accountId: string, draftId: string): Promise<AiDraftEntity> {
    const draft = await this.drafts.findOne({ where: { id: draftId, accountId } });
    if (!draft) throw new NotFoundException('Черновик не найден');
    return draft;
  }

  private async requireOpen(accountId: string, draftId: string): Promise<AiDraftEntity> {
    const draft = await this.requireDraft(accountId, draftId);
    if (!isOpen(draft.status)) throw new BadRequestException('Черновик уже решён');
    return draft;
  }

  private async requireChat(chatId: string): Promise<TelegramChatEntity> {
    const chat = await this.chats.findOne({ where: { id: chatId } });
    if (!chat) throw new NotFoundException('Чат черновика не найден');
    return chat;
  }

  private async publish(draft: AiDraftEntity): Promise<void> {
    await this.realtime.publishForAccount(draft.accountId, {
      type: 'draft.updated',
      accountId: draft.accountId,
      chatId: draft.chatId,
      draftId: draft.id,
      status: draft.status,
    });
  }
}

const KNOWN_STATUSES: DraftStatus[] = [...OPEN_DRAFT_STATUSES, 'sent_as_is', 'edited', 'replaced', 'dismissed', 'superseded'];

/** `status=pending,edited`; пусто — открытые черновики. */
function parseStatuses(raw: string | undefined): DraftStatus[] | null {
  if (!raw) return OPEN_DRAFT_STATUSES;
  if (raw === 'all') return null;
  const parsed = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is DraftStatus => KNOWN_STATUSES.includes(s as DraftStatus));
  return parsed.length > 0 ? parsed : OPEN_DRAFT_STATUSES;
}
