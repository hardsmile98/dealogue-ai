import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { TelegramChatEntity } from '../../../telegram/entities/telegram-chat.entity.js';
import { AiConfig } from '../../ai.config.js';
import type { FunnelStage, TouchKind } from '../../domain/types.js';
import { AiChatStateEntity } from '../../entities/ai-chat-state.entity.js';
import { AiDraftEntity } from '../../entities/ai-draft.entity.js';
import { AiTurnEntity } from '../../entities/ai-turn.entity.js';
import type { ManualTurnInput, PatchChatAiInput, RateTurnInput, ResumeChatAiInput } from '../dto/chat.schema.js';
import { AiLibraryService } from '../../library/library.service.js';
import { LlmProviderFactory } from '../../llm/llm-provider.factory.js';
import { AiJobWorker } from '../../jobs/ai-job-worker.service.js';
import { AiJobsService } from '../../jobs/ai-jobs.service.js';
import { AiSettingsService } from '../../settings/ai-settings.service.js';
import { AlertsService } from '../../alerts/alerts.service.js';
import { toChatAiStateDto, toChatAiSummaryDto, toTurnDto } from '../dto/agent.dto.js';
import type { AiOverviewDto, ChatAiStateDto, ChatAiSummaryDto, TurnDto } from '../dto/agent.dto.js';
import { planNextTouch } from '../funnel/touch-planner.js';
import type { CardField } from '../../domain/types.js';
import { cardToColumns, markManual } from '../card/client-card.js';
import { clientCard } from '../card/turn-card.js';
import { defaultRng } from '../lib/random.js';
import { ChatStateService } from './chat-state.service.js';
import { SimilarCasesService } from './similar-cases.service.js';

/** Состояние чата для менеджера: просмотр, правка слотов, режимы, ручные ходы, журнал, оценки. */
@Injectable()
export class ChatAiService {
  constructor(
    @InjectRepository(AiChatStateEntity)
    private readonly states: Repository<AiChatStateEntity>,
    @InjectRepository(AiTurnEntity)
    private readonly turns: Repository<AiTurnEntity>,
    @InjectRepository(AiDraftEntity)
    private readonly drafts: Repository<AiDraftEntity>,
    @InjectRepository(TelegramChatEntity)
    private readonly chats: Repository<TelegramChatEntity>,
    private readonly chatState: ChatStateService,
    private readonly similar: SimilarCasesService,
    private readonly settings: AiSettingsService,
    private readonly jobs: AiJobsService,
    private readonly worker: AiJobWorker,
    private readonly library: AiLibraryService,
    private readonly alerts: AlertsService,
    private readonly providers: LlmProviderFactory,
    private readonly config: AiConfig,
  ) {}

  async getState(chat: TelegramChatEntity): Promise<ChatAiStateDto> {
    const state = await this.requireState(chat);
    const draft = await this.drafts.findOne({ where: { chatId: chat.id, status: In(['pending', 'pending_classification']) }, order: { createdAt: 'DESC' } });
    // На что опирался черновик — показываем менеджеру рядом с текстом (раздел 9.3 ТЗ).
    const cases = draft ? await this.similar.byIds(draft.similarCaseIds) : [];
    return toChatAiStateDto(
      state,
      draft,
      cases.map((item) => ({
        id: item.id,
        source: item.source,
        clientText: item.clientText,
        answerText: item.answerText,
        createdAt: item.createdAt.toISOString(),
      })),
    );
  }

  async listSummaries(accountId: string): Promise<ChatAiSummaryDto[]> {
    const states = await this.chatState.listForAccount(accountId);
    if (states.length === 0) return [];
    const pending = await this.drafts.find({ where: { accountId, status: In(['pending', 'pending_classification']) }, select: { chatId: true } });
    const withDraft = new Set(pending.map((d) => d.chatId));
    return states.map((s) => toChatAiSummaryDto(s, withDraft.has(s.chatId)));
  }

  async patch(chat: TelegramChatEntity, input: PatchChatAiInput, byUserId: string): Promise<ChatAiStateDto> {
    const state = await this.requireState(chat);
    if (input.slots) {
      // Менеджер правит карточку, колонки-слоты пересчитываются из неё.
      const now = new Date();
      const manual = new Set(state.manualSlots);
      const touched: CardField[] = [];
      const card = { ...clientCard(state, state.language, now) };
      const s = input.slots;
      if (s.birthDate !== undefined) {
        card.birthDate = s.birthDate;
        if (s.birthDate === null) card.birthDateText = null;
        card.minorHint = false;
        touched.push('birthDate');
        manual.add('birthDate');
      }
      if (s.birthPlace !== undefined) {
        card.birthPlace = s.birthPlace;
        touched.push('birthPlace');
        manual.add('birthPlace');
      }
      if (s.gender !== undefined) {
        card.gender = s.gender;
        touched.push('gender');
        manual.add('gender');
      }
      if (s.language !== undefined) {
        card.language = s.language;
        touched.push('language');
        manual.add('language');
      }
      if (s.requestSummary !== undefined) {
        card.requestSummary = s.requestSummary;
        touched.push('requestSummary');
        manual.add('request');
      }
      if (s.requestCategoryKey !== undefined) {
        card.requestCategoryKey = s.requestCategoryKey;
        touched.push('requestCategoryKey');
        manual.add('request');
      }
      const next = markManual(card, touched, { now });
      await this.chatState.apply(state, {
        card: next,
        ...cardToColumns(next, now),
        manualSlots: [...manual],
      });
    }
    if (input.manualNotes !== undefined) await this.chatState.apply(state, { manualNotes: input.manualNotes });
    if (input.mode !== undefined && input.mode !== state.mode) {
      if (input.mode === 'auto' || input.mode === 'supervised') {
        await this.resume(chat, { mode: input.mode, when: 'interval' }, byUserId);
      } else {
        await this.chatState.setMode(state, input.mode, 'manual', byUserId);
      }
    }
    await this.chatState.publishFunnel(state);
    return this.getState(chat);
  }

  /** «Вернуть боту»: режим, этап, касание сейчас или по интервалу. */
  async resume(chat: TelegramChatEntity, input: ResumeChatAiInput, byUserId: string): Promise<ChatAiStateDto> {
    const state = await this.requireState(chat);
    const settings = await this.settings.get(chat.accountId);
    const stage = (input.stage as FunnelStage | undefined) ?? state.stage;
    await this.chatState.setMode(state, input.mode, 'manual_resume', byUserId, {
      stage,
      ...(stage !== state.stage ? { stageEnteredAt: new Date() } : {}),
      touchPostponedCount: 0,
      ...(stage === 'closed_silent' ? {} : { closedAt: null }),
    });
    await this.alerts.resolveForChat(chat.id, byUserId);
    await this.drafts.update({ chatId: chat.id, status: In(['pending', 'pending_classification']) }, { status: 'dismissed', decidedBy: byUserId, decidedAt: new Date(), decisionSource: 'web' });

    // Ждут ли необработанные входящие — тогда ход по ним, иначе касание по этапу.
    if (state.lastHandledMessageId < chat.lastTelegramMessageId && chat.lastMessageDirection === 'in') {
      await this.jobs.enqueue({ type: 'inbound', accountId: chat.accountId, chatId: chat.id, runAt: new Date(), payload: { delayed: true } });
      this.worker.kick();
    } else {
      const hasDiscount = (await this.library.listPhrases(chat.accountId, { usage: 'block', kind: 'discount', enabled: 'true' })).length > 0;
      const next = planNextTouch({
        stage,
        trigger: 'manual',
        touchKind: null,
        birthKnown: Boolean(state.birthDate || state.birthDateText),
        remindersSent: state.remindersSent,
        lastIntervalHours: state.lastIntervalHours ? Number(state.lastIntervalHours) : null,
        diagnosticsReadAt: state.diagnosticsReadAt,
        hasDiscountBlock: hasDiscount,
        timings: settings.timings,
        now: new Date(),
        rng: defaultRng,
      });
      const kind = next?.kind ?? firstTouchFor(stage);
      if (kind) {
        const at = input.when === 'now' || !next ? new Date() : next.at;
        await this.chatState.apply(state, { nextTouchKind: kind, nextTouchAt: at, ...(next?.intervalHours ? { lastIntervalHours: String(next.intervalHours) } : {}) });
        await this.jobs.enqueue({ type: 'touch', accountId: chat.accountId, chatId: chat.id, runAt: at, payload: { kind } });
        await this.chatState.recordEvent(chat.accountId, chat.id, 'touch_scheduled', { kind, at: at.toISOString(), byUserId });
        if (input.when === 'now') this.worker.kick();
      }
    }
    await this.chatState.publishFunnel(state);
    return this.getState(chat);
  }

  /** Ручной ход: конкретное касание сейчас (например, «диагностика сейчас»). */
  async manualTurn(chat: TelegramChatEntity, input: ManualTurnInput, byUserId: string): Promise<{ ok: true }> {
    const state = await this.requireState(chat);
    if (state.mode !== 'auto' && state.mode !== 'supervised') {
      throw new BadRequestException('Сначала верните чат боту (режим auto или supervised)');
    }
    const kind = (input.touchKind as TouchKind | null) ?? null;
    await this.jobs.cancel('touch', chat.accountId, chat.id);
    await this.chatState.apply(state, { nextTouchKind: kind, nextTouchAt: new Date() });
    await this.jobs.enqueue({ type: 'touch', accountId: chat.accountId, chatId: chat.id, runAt: new Date(), payload: { kind, manual: true } });
    await this.chatState.recordEvent(chat.accountId, chat.id, 'touch_scheduled', { kind, manual: true, byUserId });
    this.worker.kick();
    return { ok: true };
  }

  async listTurns(chat: TelegramChatEntity, limit: number, before?: string): Promise<TurnDto[]> {
    const rows = await this.turns.find({
      where: { chatId: chat.id, ...(before ? { createdAt: LessThan(new Date(before)) } : {}) },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return rows.map(toTurnDto);
  }

  async rateTurn(chat: TelegramChatEntity, turnId: string, input: RateTurnInput): Promise<TurnDto> {
    const turn = await this.turns.findOne({ where: { id: turnId, chatId: chat.id } });
    if (!turn) throw new NotFoundException('Ход не найден');
    turn.rating = input.rating;
    turn.ratingNote = input.note;
    await this.turns.save(turn);
    if (input.createNote && input.note) {
      await this.library.createNote(chat.accountId, { text: input.note, scope: turn.stageBefore ? `stage:${turn.stageBefore}` : 'global', enabled: true }, 'from_rating');
    }
    return toTurnDto(turn);
  }

  async overview(accountId: string): Promise<AiOverviewDto> {
    const settings = await this.settings.get(accountId);
    const states = await this.chatState.listForAccount(accountId);
    const chatsByMode: Record<string, number> = {};
    const chatsByStage: Record<string, number> = {};
    for (const s of states) {
      chatsByMode[s.mode] = (chatsByMode[s.mode] ?? 0) + 1;
      if (s.mode === 'auto' || s.mode === 'supervised') chatsByStage[s.stage] = (chatsByStage[s.stage] ?? 0) + 1;
    }
    const upcoming = states
      .filter((s) => s.nextTouchAt && s.nextTouchKind && (s.mode === 'auto' || s.mode === 'supervised'))
      .sort((a, b) => (a.nextTouchAt as Date).getTime() - (b.nextTouchAt as Date).getTime())
      .slice(0, 10);
    const chatRows = upcoming.length > 0 ? await this.chats.find({ where: { id: In(upcoming.map((s) => s.chatId)) } }) : [];
    const names = new Map(chatRows.map((c) => [c.id, c.peerName]));
    const pendingDrafts = await this.drafts.count({ where: { accountId, status: In(['pending', 'pending_classification']) } });

    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const today = await this.turns
      .createQueryBuilder('t')
      .select('t.outcome', 'outcome')
      .addSelect('count(*)::int', 'count')
      .where('t.account_id = :accountId AND t.created_at >= :since', { accountId, since })
      .groupBy('t.outcome')
      .getRawMany<{ outcome: string; count: number }>();
    const count = (outcome: string) => today.find((r) => r.outcome === outcome)?.count ?? 0;
    const breaker = this.providers.breaker(this.config.provider).state;

    return {
      enabled: settings.enabled,
      dryRun: settings.dryRun,
      defaultChatMode: settings.defaultChatMode,
      chatsByMode,
      chatsByStage,
      upcomingTouches: upcoming.map((s) => ({
        chatId: s.chatId,
        peerName: names.get(s.chatId) ?? '',
        kind: s.nextTouchKind as TouchKind,
        at: (s.nextTouchAt as Date).toISOString(),
        stage: s.stage,
      })),
      pendingDrafts,
      turnsToday: {
        total: today.reduce((sum, r) => sum + Number(r.count), 0),
        sent: count('sent'),
        dryRun: count('dry_run'),
        handoff: count('handoff'),
        error: count('error'),
      },
      provider: { name: this.config.provider, model: this.config.model, ready: this.config.ready, breakerOpen: breaker.open },
    };
  }

  // --- внутреннее -----------------------------------------------------------

  /** Состояние чата; для чата без состояния создаём «выключенное», чтобы менеджер мог включить бота. */
  private async requireState(chat: TelegramChatEntity): Promise<AiChatStateEntity> {
    const existing = await this.chatState.find(chat.id);
    if (existing) return existing;
    return this.states.save(
      this.states.create({
        chatId: chat.id,
        accountId: chat.accountId,
        mode: 'off',
        stage: 'greeting',
        stageEnteredAt: new Date(),
        lastHandledMessageId: chat.lastTelegramMessageId,
      }),
    );
  }
}

/** Касание, с которого начинается этап, если планировщик ничего не предложил. */
function firstTouchFor(stage: FunnelStage): TouchKind | null {
  switch (stage) {
    case 'collect_birth':
      return 'birth_nudge';
    case 'collect_request':
    case 'ack_request':
    case 'diagnostics':
      return 'diagnostics';
    case 'post_diagnostics':
      return 'reengage';
    case 'offer':
      return 'offer';
    case 'price':
      return 'price';
    case 'discount':
      return 'discount';
    case 'reminders':
      return 'reminder';
    default:
      return null;
  }
}
