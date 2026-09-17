import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, MoreThan, Not, Repository } from 'typeorm';
import { RealtimeService } from '../../../realtime/realtime.service.js';
import { TelegramChatEntity } from '../../../telegram/entities/telegram-chat.entity.js';
import { TelegramMessageEntity } from '../../../telegram/entities/telegram-message.entity.js';
import type {
  DraftKind,
  DraftStatus,
  FunnelStage,
  HandoffReason,
  TouchKind,
  TurnOutcome,
  TurnTrigger,
} from '../../domain/types.js';
import { AiAccountSettingsEntity } from '../../entities/ai-account-settings.entity.js';
import { AiChatStateEntity } from '../../entities/ai-chat-state.entity.js';
import { AiDiagnosticEntity } from '../../entities/ai-diagnostic.entity.js';
import { AiDraftEntity } from '../../entities/ai-draft.entity.js';
import { AiPhraseEntity } from '../../entities/ai-phrase.entity.js';
import { AiTurnEntity } from '../../entities/ai-turn.entity.js';
import type { TurnMessage } from '../../entities/ai-turn.entity.js';
import type { AlertType } from '../../entities/alert.entity.js';
import { LlmError } from '../../llm/llm-provider.interface.js';
import { AiJobsService } from '../../services/ai-jobs.service.js';
import { AiSettingsService } from '../../services/ai-settings.service.js';
import { AlertsService } from '../../services/alerts.service.js';
import type { ComposedMessage, GuardNote, HistoryMessage, LibraryBlock, SlotsSnapshot, TurnTask } from '../agent.types.js';
import { ComposerService } from '../composer/composer.service.js';
import { PROMPT_VERSION, buildSystemPrompt, buildTurnPrompt } from '../composer/prompt-builder.js';
import type { SystemPromptInput, TurnPromptInput } from '../composer/prompt-builder.js';
import type { ComposerOutput } from '../composer/composer.schema.js';
import { OPEN_DRAFT_STATUSES, isOpen } from '../drafts/draft-decision.js';
import { managerDraftTask } from '../drafts/manager-draft.js';
import { shiftForNightWindow } from '../funnel/night-window.js';
import { planNextTouch, pickInterval } from '../funnel/touch-planner.js';
import { expandMarkers, joinMessages, resolveBlocks } from '../guard/blocks.js';
import { describeViolations, runGuard } from '../guard/guard.js';
import type { GuardInput } from '../guard/guard.js';
import { formatSimilarCases } from '../learning/similar-cases.js';
import { defaultRng } from '../lib/random.js';
import type { Rng } from '../lib/random.js';
import { ageFrom, detectLanguage, parseBirthDate, startsWithGreeting } from '../lib/slots.js';
import { OutboundInterruptedError, OutboundService } from '../outbound/outbound.service.js';
import { plan, stageAfterTurn, stageForTouch } from '../planner/planner.js';
import type { RecentTurnSummary } from '../planner/planner.js';
import { stopReason } from '../planner/stop-reason.js';
import type { StopVerdict } from '../planner/stop-reason.js';
import { ChatStateService, StaleStateError } from './chat-state.service.js';
import { SimilarCasesService } from './similar-cases.service.js';
import { TurnContextService, refsOf, toHistoryMessage } from './turn-context.service.js';
import type { TurnContext, TurnLibraryRefs } from './turn-context.service.js';

export interface RunTurnParams {
  accountId: string;
  chatId: string;
  trigger: TurnTrigger;
  touchKind: TouchKind | null;
  /** Попытка job'а: на последней провайдерская ошибка становится передачей. */
  attempt?: { current: number; max: number } | null;
  /** Продолжить отправку хода после сбоя посередине. */
  resume?: { turnId: string; nextIndex: number } | null;
  onProgress?: (patch: Record<string, unknown>) => Promise<void>;
  rng?: Rng;
}

export type TurnRunResult =
  | { kind: 'done'; outcome: TurnOutcome | 'skip'; turnId: string | null; detail: string }
  | { kind: 'postpone'; runAt: Date; reason: string }
  | { kind: 'retry_resume'; turnId: string; nextIndex: number; error: string };

export interface GenerateParams {
  system: SystemPromptInput;
  turn: Omit<TurnPromptInput, 'guardRemark' | 'previousReply'>;
  guard: Omit<GuardInput, 'messages' | 'unknownBlockKinds' | 'requiredBlockKinds' | 'allowedBlockKinds' | 'noQuestions'>;
  task: TurnTask;
  blocks: LibraryBlock[];
}

/** Что нужно, чтобы закрыть ход после отправки (или сухого прогона). */
export interface FinishTurnParams {
  chat: TelegramChatEntity;
  state: AiChatStateEntity;
  settings: AiAccountSettingsEntity;
  refs: TurnLibraryRefs;
  turn: AiTurnEntity;
  /** Что реально ушло; пусто — сухой прогон, тогда считаем по `planned`. */
  sent: TurnMessage[];
  planned: TurnMessage[];
  stageBefore: FunnelStage;
  stageAfter: FunnelStage;
  trigger: TurnTrigger;
  touchKind: TouchKind | null;
  now: Date;
  extraPatch?: Partial<AiChatStateEntity>;
  /** Клиент написал во время отправки — следующее касание не планируем. */
  interrupted?: boolean;
  rng?: Rng;
}

export interface GenerateResult {
  output: ComposerOutput;
  messages: ComposedMessage[];
  guardNotes: GuardNote[];
  /** Guard пропустил (после автоправок или регенерации). */
  guardOk: boolean;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  model: string;
  prompts: { system: string; user: string };
}

const STALE_LEAD_MS = 6 * 3_600_000;
const RECENT_TURNS = 6;
const LIMIT_POSTPONE_MS = 10 * 60_000;
/** Дневной лимит сообщений в чат освобождается медленно — заглядываем раз в час. */
const CHAT_LIMIT_POSTPONE_MS = 60 * 60_000;

/**
 * Ход агента целиком (раздел 4 ТЗ): Planner → Composer → Guard → Outbound →
 * состояние и таймеры. Один вызов — один ход; параллельность по чату
 * исключает очередь (один job на чат) и версия состояния.
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    @InjectRepository(TelegramChatEntity)
    private readonly chats: Repository<TelegramChatEntity>,
    @InjectRepository(TelegramMessageEntity)
    private readonly messages: Repository<TelegramMessageEntity>,
    @InjectRepository(AiTurnEntity)
    private readonly turns: Repository<AiTurnEntity>,
    @InjectRepository(AiDraftEntity)
    private readonly drafts: Repository<AiDraftEntity>,
    @InjectRepository(AiPhraseEntity)
    private readonly phrases: Repository<AiPhraseEntity>,
    @InjectRepository(AiDiagnosticEntity)
    private readonly diagnostics: Repository<AiDiagnosticEntity>,
    private readonly settings: AiSettingsService,
    private readonly chatState: ChatStateService,
    private readonly context: TurnContextService,
    private readonly similar: SimilarCasesService,
    private readonly composer: ComposerService,
    private readonly outbound: OutboundService,
    private readonly jobs: AiJobsService,
    private readonly alerts: AlertsService,
    private readonly realtime: RealtimeService,
  ) {}

  // ---------------------------------------------------------------------------
  // Ход
  // ---------------------------------------------------------------------------

  async runTurn(params: RunTurnParams): Promise<TurnRunResult> {
    try {
      return await this.runTurnInner(params);
    } catch (error) {
      if (error instanceof StaleStateError) {
        return { kind: 'postpone', runAt: new Date(Date.now() + 5_000), reason: error.message };
      }
      throw error;
    }
  }

  private async runTurnInner(params: RunTurnParams): Promise<TurnRunResult> {
    const rng = params.rng ?? defaultRng;
    const now = new Date();
    const settings = await this.settings.get(params.accountId);
    if (!settings.enabled) return done('skip', null, 'ИИ-агент выключен на аккаунте');

    const chat = await this.chats.findOne({ where: { id: params.chatId, accountId: params.accountId } });
    if (!chat) return done('skip', null, 'Чат не найден');
    const state = await this.chatState.find(chat.id);
    if (!state) return done('skip', null, 'Состояние чата не создано');

    if (params.resume) return this.resumeTurn(params, settings, chat, state);

    const { trigger, touchKind } = params;
    const newInbound = await this.messages.find({
      where: { chatId: chat.id, direction: 'in', telegramMessageId: MoreThan(state.lastHandledMessageId) },
      order: { telegramMessageId: 'ASC' },
    });
    if (trigger === 'inbound' && newInbound.length === 0) return done('skip', null, 'Новых входящих нет');
    if (trigger === 'touch') {
      if (newInbound.length > 0) return done('skip', null, 'Есть необработанные входящие — касание отменено');
      if (state.nextTouchKind !== touchKind) return done('skip', null, `Касание ${touchKind} больше не запланировано`);
    }

    const batch = trigger === 'inbound' ? newInbound.map(toHistoryMessage) : [];
    const handledId = newInbound.length > 0 ? newInbound[newInbound.length - 1].telegramMessageId : state.lastHandledMessageId;
    const stage: FunnelStage = touchKind && trigger !== 'inbound' ? stageForTouch(touchKind) : state.stage;

    // Слоты, которые можно вынуть кодом до модели.
    const slotPatch = this.codeSlots(state, batch, now);
    Object.assign(state, slotPatch);

    // Чат ведёт человек — бот только готовит черновик ответа (раздел 8.3 ТЗ).
    // Проверяем до стоп-триггеров: передавать нечего, чат уже у менеджера.
    if (state.mode === 'manager') {
      return this.managerDraftTurn(params, settings, chat, state, batch, handledId, slotPatch, now, rng);
    }

    // Лид ждал первого ответа слишком долго — отвечать «привет» через полдня странно.
    if (stage === 'greeting' && trigger === 'inbound' && !state.lastBotMessageAt && now.getTime() - batch[0].sentAt.getTime() > STALE_LEAD_MS) {
      await this.chatState.apply(state, { ...slotPatch, lastHandledMessageId: handledId, lastClientMessageAt: batch[batch.length - 1].sentAt });
      await this.handoff(state, chat, 'stale_lead', 'Лид ждал первого ответа больше 6 часов', batch, [], null, null);
      return done('handoff', null, 'stale_lead');
    }

    if (state.isMinor) {
      await this.chatState.apply(state, { ...slotPatch, lastHandledMessageId: handledId });
      await this.handoff(state, chat, 'minor', `По дате рождения клиенту ${state.age ?? '<18'} лет`, batch, [], null, null);
      return done('handoff', null, 'minor');
    }

    const slots = snapshot(state);
    const ctx = await this.context.load({
      accountId: chat.accountId,
      stage,
      touchKind: trigger === 'inbound' ? null : touchKind,
      slots,
      usedExampleIds: state.usedExampleIds,
      sentBlockIds: state.sentBlockIds,
      personaLinks: settings.persona.links,
      rng,
    });
    const history = await this.context.loadHistory(chat.id, batch.map((m) => m.id));
    const recentTurns = await this.recentTurns(chat.id);

    const verdict = plan({
      trigger,
      touchKind: trigger === 'inbound' ? null : touchKind,
      mode: state.mode,
      stage,
      playbook: ctx.playbook,
      slots,
      batch,
      history,
      isMinor: state.isMinor,
      autoMessagesSinceClient: state.autoMessagesSinceClient,
      remindersSent: state.remindersSent,
      diagnosticsSentAt: state.diagnosticsSentAt,
      diagnosticsReadAt: state.diagnosticsReadAt,
      lastClientMessageAt: state.lastClientMessageAt,
      limits: settings.limits,
      blocks: ctx.blocks,
      exhaustedBlockKinds: ctx.exhaustedBlockKinds,
      recentTurns,
      now,
    });

    if (verdict.kind === 'skip') {
      await this.chatState.apply(state, {
        ...slotPatch,
        lastHandledMessageId: handledId,
        ...(batch.length > 0 ? { lastClientMessageAt: batch[batch.length - 1].sentAt, autoMessagesSinceClient: 0 } : {}),
        ...(trigger === 'touch' ? { nextTouchKind: null, nextTouchAt: null } : {}),
      });
      if (verdict.detail.startsWith('library_incomplete:')) {
        const kind = verdict.detail.slice('library_incomplete:'.length);
        await this.alerts.create({
          accountId: chat.accountId,
          chatId: chat.id,
          type: 'library_incomplete',
          payload: { stage, detail: `Нет включённого блока «${kind}» — шаг пропущен` },
        });
      }
      await this.chatState.recordEvent(chat.accountId, chat.id, 'touch_cancelled', { trigger, touchKind, detail: verdict.detail });
      return done('skip', null, verdict.detail);
    }
    if (verdict.kind === 'handoff') {
      await this.chatState.apply(state, {
        ...slotPatch,
        lastHandledMessageId: handledId,
        ...(batch.length > 0 ? { lastClientMessageAt: batch[batch.length - 1].sentAt } : {}),
      });
      await this.handoff(state, chat, verdict.reason, verdict.detail, batch, [], null, null);
      return done('handoff', null, verdict.reason);
    }

    // Лимиты вызовов модели по аккаунту.
    const limit = await this.overLlmLimit(chat.accountId, settings, now);
    if (limit) return { kind: 'postpone', runAt: new Date(now.getTime() + LIMIT_POSTPONE_MS), reason: limit };
    // Лимиты сообщений бота (раздел 7 ТЗ): молчим, пока окно не освободится.
    const messageLimit = await this.overMessageLimit(chat, settings, now);
    if (messageLimit) return { kind: 'postpone', runAt: new Date(now.getTime() + messageLimit.retryMs), reason: messageLimit.reason };

    const task = verdict.task;
    const similar = await this.findSimilar(chat, state, stage, batch);

    let gen: GenerateResult;
    try {
      gen = await this.generate(this.generateParams({ settings, ctx, task, history, batch, slots, state, similarCases: similar.lines, now }));
    } catch (error) {
      return this.onProviderError(error, params, settings, chat, state, batch, handledId, slotPatch, stage, task);
    }

    // --- анализ: слоты, стоп-триггеры от модели -------------------------------------
    const llmSlots = this.llmSlots(state, gen.output, now);
    Object.assign(state, llmSlots);
    const turnBase = {
      accountId: chat.accountId,
      chatId: chat.id,
      trigger,
      touchKind: trigger === 'inbound' ? null : touchKind,
      stageBefore: stage,
      inputMessageIds: batch.map((m) => m.id),
      clientText: batch.map((m) => m.text).join('\n'),
      similarCaseIds: similar.ids,
      promptVersion: PROMPT_VERSION,
      model: gen.model,
      analysis: gen.output.analysis as unknown as Record<string, unknown>,
      messagesPlanned: gen.messages.map(toTurnMessage),
      guardNotes: gen.guardNotes as unknown as Record<string, unknown>[],
      tokensIn: gen.tokensIn,
      tokensOut: gen.tokensOut,
      durationMs: gen.durationMs,
    };
    const basePatch: Partial<AiChatStateEntity> = {
      ...slotPatch,
      ...llmSlots,
      lastHandledMessageId: handledId,
      ...(batch.length > 0 ? { lastClientMessageAt: batch[batch.length - 1].sentAt, autoMessagesSinceClient: 0 } : {}),
    };

    const stop = this.stopReason(state, gen, ctx, settings);
    if (stop) {
      const turn = await this.turns.save(this.turns.create({ ...turnBase, stageAfter: stage, outcome: 'handoff' }));
      await this.chatState.apply(state, basePatch);
      await this.handoff(state, chat, stop.reason, stop.detail, batch, gen.messages, turn.id, gen.output.analysis.escalation?.note ?? null);
      return done('handoff', turn.id, stop.reason);
    }

    if (!gen.output.reply.send || gen.messages.length === 0) {
      return this.silentTurn(params, settings, chat, state, turnBase, basePatch, stage, gen, ctx, rng, now);
    }

    // --- доставка ------------------------------------------------------------------
    const after = this.stageAfter({
      state,
      stage,
      trigger,
      touchKind,
      progress: gen.output.analysis.stageProgress,
      requestKnown: Boolean(state.requestSummary || gen.output.analysis.slots?.requestSummary),
      hasDiscountBlock: ctx.hasDiscountBlock,
      settings,
    });
    // В supervised черновик создаётся и в сухом прогоне — подтверждение учитывает dryRun само.
    if (state.mode === 'supervised') {
      const turn = await this.turns.save(this.turns.create({ ...turnBase, stageAfter: stage, outcome: 'awaiting_approval' }));
      await this.chatState.apply(state, { ...basePatch, ...(trigger === 'touch' ? { nextTouchKind: null, nextTouchAt: null } : {}) });
      const draft = await this.createDraft('supervised', 'pending', state, chat, batch, null, gen.messages, gen.output.analysis.clientIntent, turn.id);
      if (trigger === 'touch' && touchKind) {
        // Менеджер не подтвердит вовремя — касание уйдёт на следующий интервал.
        const deadline = new Date(now.getTime() + settings.timings.superviseTimeoutHours * 3_600_000);
        await this.jobs.enqueue({
          type: 'touch',
          accountId: chat.accountId,
          chatId: chat.id,
          runAt: deadline,
          payload: { kind: touchKind, superviseTimeout: true, draftId: draft.id },
        });
      }
      return done('awaiting_approval', turn.id, 'Ход ждёт подтверждения менеджера');
    }
    if (settings.dryRun) {
      const turn = await this.turns.save(this.turns.create({ ...turnBase, stageAfter: after, outcome: 'dry_run' }));
      await this.finishTurn({
        chat,
        state,
        settings,
        refs: refsOf(ctx),
        turn,
        sent: [],
        planned: gen.messages.map(toTurnMessage),
        extraPatch: basePatch,
        stageBefore: stage,
        stageAfter: after,
        trigger,
        touchKind,
        rng,
        now,
      });
      return done('dry_run', turn.id, `Сухой прогон: ${gen.messages.length} сообщ.`);
    }
    if (!this.outbound.isOnline(chat.accountId)) {
      return { kind: 'postpone', runAt: new Date(now.getTime() + 60_000), reason: 'Аккаунт не подключён к Telegram' };
    }

    const turn = await this.turns.save(this.turns.create({ ...turnBase, stageAfter: after, outcome: 'sent' }));
    await this.chatState.apply(state, basePatch);
    const inboundChars = trigger === 'inbound' ? batch.reduce((sum, m) => sum + m.text.length, 0) : null;
    try {
      const result = await this.outbound.sendTurn({
        accountId: chat.accountId,
        chat,
        turnId: turn.id,
        messages: gen.messages,
        inboundChars,
        markRead: settings.markRead,
        lastHandledMessageId: handledId,
        onProgress: async (sent) => {
          await this.turns.update(turn.id, { messagesSent: sent });
          if (params.onProgress) await params.onProgress({ resumeTurnId: turn.id, resumeIndex: sent.length });
        },
        rng,
      });
      await this.finishTurn({
        chat,
        state,
        settings,
        refs: refsOf(ctx),
        turn,
        sent: result.sent,
        planned: gen.messages.map(toTurnMessage),
        stageBefore: stage,
        stageAfter: after,
        trigger,
        touchKind,
        rng,
        now,
        interrupted: result.interrupted,
      });
      return done(result.interrupted ? 'cancelled' : 'sent', turn.id, result.interrupted ? 'Клиент написал во время отправки' : `Отправлено ${result.sent.length} сообщ.`);
    } catch (error) {
      if (error instanceof OutboundInterruptedError) {
        await this.turns.update(turn.id, { messagesSent: error.sent, outcome: 'error', error: error.message });
        this.logger.warn(`Чат ${chat.id}: ${error.message}`);
        return { kind: 'retry_resume', turnId: turn.id, nextIndex: error.nextIndex, error: error.message };
      }
      throw error;
    }
  }

  /** Продолжение отправки после сбоя: оставшиеся сообщения хода, без нового вызова модели. */
  private async resumeTurn(
    params: RunTurnParams,
    settings: AiAccountSettingsEntity,
    chat: TelegramChatEntity,
    state: AiChatStateEntity,
  ): Promise<TurnRunResult> {
    const resume = params.resume as { turnId: string; nextIndex: number };
    const turn = await this.turns.findOne({ where: { id: resume.turnId, chatId: chat.id } });
    if (!turn) return done('skip', null, 'Ход для продолжения не найден');
    if (state.mode !== 'auto') return done('cancelled', turn.id, 'Режим чата изменился — остаток хода не отправляем');
    if (!this.outbound.isOnline(chat.accountId)) {
      return { kind: 'postpone', runAt: new Date(Date.now() + 60_000), reason: 'Аккаунт не подключён к Telegram' };
    }
    const messages: ComposedMessage[] = turn.messagesPlanned.map((m) => ({ text: m.text, blockKind: null, blockId: m.blockId ?? null }));
    try {
      const result = await this.outbound.sendTurn({
        accountId: chat.accountId,
        chat,
        turnId: turn.id,
        messages,
        startIndex: resume.nextIndex,
        alreadySent: turn.messagesSent,
        inboundChars: null,
        markRead: false,
        lastHandledMessageId: state.lastHandledMessageId,
        onProgress: async (sent) => {
          await this.turns.update(turn.id, { messagesSent: sent });
          if (params.onProgress) await params.onProgress({ resumeTurnId: turn.id, resumeIndex: sent.length });
        },
        rng: params.rng,
      });
      await this.turns.update(turn.id, { messagesSent: result.sent, outcome: result.interrupted ? 'cancelled' : 'sent', error: null });
      await this.chatState.apply(state, { lastBotMessageAt: new Date() });
      await this.realtime.publishForAccount(chat.accountId, { type: 'turn.sent', accountId: chat.accountId, chatId: chat.id, turnId: turn.id });
      return done('sent', turn.id, `Дослали ${result.sent.length - resume.nextIndex} сообщ.`);
    } catch (error) {
      if (error instanceof OutboundInterruptedError) {
        await this.turns.update(turn.id, { messagesSent: error.sent, error: error.message });
        return { kind: 'retry_resume', turnId: turn.id, nextIndex: error.nextIndex, error: error.message };
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Composer + Guard (используется и песочницей)
  // ---------------------------------------------------------------------------

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const system = buildSystemPrompt(params.system);
    const guardNotes: GuardNote[] = [];
    let tokensIn = 0;
    let tokensOut = 0;
    let durationMs = 0;
    let model = this.composer.modelName;
    let remark: string | null = null;
    let previous: string | null = null;
    let last: { output: ComposerOutput; messages: ComposedMessage[] } | null = null;
    let user = '';

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      user = buildTurnPrompt({ ...params.turn, guardRemark: remark, previousReply: previous });
      const result = await this.composer.compose(system, user);
      tokensIn += result.raw.usage.inputTokens;
      tokensOut += result.raw.usage.outputTokens;
      durationMs += result.durationMs;
      model = result.raw.model;

      const resolved = resolveBlocks(expandMarkers(result.output.reply.messages), params.blocks);
      // Модель просит остановиться или промолчать — guard не нужен.
      if (result.output.analysis.escalation || !result.output.reply.send) {
        return { output: result.output, messages: resolved.messages, guardNotes, guardOk: true, tokensIn, tokensOut, durationMs, model, prompts: { system, user } };
      }
      const guard = runGuard({
        ...params.guard,
        messages: resolved.messages,
        unknownBlockKinds: resolved.unknownKinds,
        requiredBlockKinds: params.task.requiredBlockKinds,
        allowedBlockKinds: params.task.allowedBlockKinds,
        noQuestions: params.task.noQuestions,
      });
      guardNotes.push({ attempt, violations: guard.violations, fixes: guard.fixes });
      last = { output: result.output, messages: guard.messages };
      if (guard.ok) {
        return { output: result.output, messages: guard.messages, guardNotes, guardOk: true, tokensIn, tokensOut, durationMs, model, prompts: { system, user } };
      }
      remark = describeViolations(guard.violations);
      previous = joinMessages(resolved.messages);
    }
    const final = last as { output: ComposerOutput; messages: ComposedMessage[] };
    return { output: final.output, messages: final.messages, guardNotes, guardOk: false, tokensIn, tokensOut, durationMs, model, prompts: { system, user } };
  }

  // ---------------------------------------------------------------------------
  // Черновики для менеджера
  // ---------------------------------------------------------------------------

  /**
   * Чат в режиме `manager`: бот не пишет клиенту, а предлагает человеку вариант
   * ответа (раздел 8.3 ТЗ). Этап и таймеры не трогаем — воронку ведёт человек.
   */
  private async managerDraftTurn(
    params: RunTurnParams,
    settings: AiAccountSettingsEntity,
    chat: TelegramChatEntity,
    state: AiChatStateEntity,
    batch: HistoryMessage[],
    handledId: number,
    slotPatch: Partial<AiChatStateEntity>,
    now: Date,
    rng: Rng,
  ): Promise<TurnRunResult> {
    if (params.trigger !== 'inbound' || batch.length === 0) return done('skip', null, 'Чат ведёт менеджер');
    const patch: Partial<AiChatStateEntity> = {
      ...slotPatch,
      lastHandledMessageId: handledId,
      lastClientMessageAt: batch[batch.length - 1].sentAt,
      autoMessagesSinceClient: 0,
    };

    // Медиа бот не видит — черновика не будет, но входящее менеджер увидит в очереди.
    const media = batch.find((m) => m.mediaKind && !m.text.trim());
    if (media) {
      await this.chatState.apply(state, patch);
      await this.createDraft('handoff', 'pending', state, chat, batch, 'media', [], 'Клиент прислал вложение — бот его не видит', null);
      return done('awaiting_approval', null, 'Черновика нет: медиа без текста');
    }

    const limit = await this.overLlmLimit(chat.accountId, settings, now);
    if (limit) return { kind: 'postpone', runAt: new Date(now.getTime() + LIMIT_POSTPONE_MS), reason: limit };

    const stage = state.stage;
    const slots = snapshot(state);
    const ctx = await this.context.load({
      accountId: chat.accountId,
      stage,
      touchKind: null,
      slots,
      usedExampleIds: state.usedExampleIds,
      sentBlockIds: state.sentBlockIds,
      personaLinks: settings.persona.links,
      rng,
    });
    const history = await this.context.loadHistory(chat.id, batch.map((m) => m.id));
    const task = managerDraftTask(stage, ctx);
    const similar = await this.findSimilar(chat, state, stage, batch);

    let gen: GenerateResult;
    try {
      gen = await this.generate(this.generateParams({ settings, ctx, task, history, batch, slots, state, similarCases: similar.lines, now }));
    } catch (error) {
      const retryable = error instanceof LlmError ? error.retryable : true;
      const lastAttempt = params.attempt ? params.attempt.current >= params.attempt.max : false;
      if (retryable && !lastAttempt) throw error;
      const message = error instanceof Error ? error.message : String(error);
      await this.chatState.apply(state, patch);
      // Без модели черновика нет — менеджер всё равно должен увидеть входящее.
      await this.createDraft('handoff', 'pending_classification', state, chat, batch, state.handoffReason, [], `Модель недоступна: ${message}`, null);
      await this.alerts.create({ accountId: chat.accountId, chatId: chat.id, type: 'ai_error', payload: { error: message, stage } });
      return done('error', null, message);
    }

    const llmSlots = this.llmSlots(state, gen.output, now);
    const turn = await this.turns.save(
      this.turns.create({
        accountId: chat.accountId,
        chatId: chat.id,
        trigger: 'manager_draft',
        touchKind: null,
        stageBefore: stage,
        stageAfter: stage,
        inputMessageIds: batch.map((m) => m.id),
        clientText: batch.map((m) => m.text).join('\n'),
        similarCaseIds: similar.ids,
        promptVersion: PROMPT_VERSION,
        model: gen.model,
        analysis: gen.output.analysis as unknown as Record<string, unknown>,
        messagesPlanned: gen.messages.map(toTurnMessage),
        guardNotes: gen.guardNotes as unknown as Record<string, unknown>[],
        tokensIn: gen.tokensIn,
        tokensOut: gen.tokensOut,
        durationMs: gen.durationMs,
        outcome: 'awaiting_approval',
      }),
    );
    await this.chatState.apply(state, { ...patch, ...llmSlots });
    const escalation = gen.output.analysis.escalation;
    await this.createDraft(
      'handoff',
      'pending',
      state,
      chat,
      batch,
      escalation?.reason ?? state.handoffReason,
      gen.output.reply.send ? gen.messages : [],
      escalation?.note ?? gen.output.reply.silentReason ?? gen.output.analysis.clientIntent ?? null,
      turn.id,
    );
    return done('awaiting_approval', turn.id, 'Черновик для менеджера готов');
  }

  /**
   * Переписать черновик заново: для хода под контролем — по задаче того же
   * шага, для передачи — как ответ, который предложат менеджеру.
   */
  async regenerateDraft(draft: AiDraftEntity, rng: Rng = defaultRng): Promise<AiDraftEntity> {
    const now = new Date();
    const chat = await this.chats.findOne({ where: { id: draft.chatId } });
    const state = await this.chatState.find(draft.chatId);
    if (!chat || !state) throw new Error('Чат черновика не найден');
    const settings = await this.settings.get(draft.accountId);
    const turn = draft.turnId ? await this.turns.findOne({ where: { id: draft.turnId } }) : null;

    const batchRows = draft.clientMessageIds.length > 0 ? await this.messages.find({ where: { id: In(draft.clientMessageIds) }, order: { telegramMessageId: 'ASC' } }) : [];
    const batch = batchRows.map(toHistoryMessage);
    const stage = turn?.stageBefore ?? state.stage;
    const touchKind = turn?.touchKind ?? null;
    const slots = snapshot(state);
    const ctx = await this.context.load({
      accountId: draft.accountId,
      stage,
      touchKind,
      slots,
      usedExampleIds: state.usedExampleIds,
      sentBlockIds: state.sentBlockIds,
      personaLinks: settings.persona.links,
      rng,
    });
    const history = await this.context.loadHistory(chat.id, batch.map((m) => m.id));

    let task = managerDraftTask(stage, ctx);
    if (draft.kind === 'supervised') {
      const verdict = plan({
        trigger: turn?.trigger === 'touch' || turn?.trigger === 'manual' ? turn.trigger : 'inbound',
        touchKind,
        mode: 'auto',
        stage,
        playbook: ctx.playbook,
        slots,
        batch,
        history,
        isMinor: state.isMinor,
        autoMessagesSinceClient: state.autoMessagesSinceClient,
        remindersSent: state.remindersSent,
        diagnosticsSentAt: state.diagnosticsSentAt,
        diagnosticsReadAt: state.diagnosticsReadAt,
        lastClientMessageAt: state.lastClientMessageAt,
        limits: settings.limits,
        blocks: ctx.blocks,
        exhaustedBlockKinds: ctx.exhaustedBlockKinds,
        recentTurns: await this.recentTurns(chat.id),
        now,
      });
      if (verdict.kind === 'proceed') task = verdict.task;
    }

    const similar = await this.findSimilar(chat, state, stage, batch);
    const gen = await this.generate(this.generateParams({ settings, ctx, task, history, batch, slots, state, similarCases: similar.lines, now }));
    draft.draftMessages = gen.messages.map(toTurnMessage);
    draft.similarCaseIds = similar.ids;
    draft.draftRationale = gen.output.reply.send
      ? (gen.output.analysis.clientIntent ?? draft.draftRationale)
      : (gen.output.reply.silentReason ?? 'Модель считает, что отвечать сейчас не нужно');
    await this.drafts.save(draft);
    if (turn) {
      turn.messagesPlanned = draft.draftMessages;
      turn.similarCaseIds = similar.ids;
      turn.analysis = gen.output.analysis as unknown as Record<string, unknown>;
      turn.guardNotes = gen.guardNotes as unknown as Record<string, unknown>[];
      turn.tokensIn += gen.tokensIn;
      turn.tokensOut += gen.tokensOut;
      turn.durationMs += gen.durationMs;
      await this.turns.save(turn);
    }
    await this.realtime.publishForAccount(draft.accountId, { type: 'draft.updated', accountId: draft.accountId, chatId: draft.chatId, draftId: draft.id, status: draft.status });
    return draft;
  }

  /** Параметры вызова модели для хода в этом чате — одинаковые у хода, черновика и регенерации. */
  private generateParams(input: {
    settings: AiAccountSettingsEntity;
    ctx: TurnContext;
    task: TurnTask;
    history: HistoryMessage[];
    batch: HistoryMessage[];
    slots: SlotsSnapshot;
    state: AiChatStateEntity;
    similarCases?: string[];
    now: Date;
  }): GenerateParams {
    const { settings, ctx, task, history, batch, slots, state, now } = input;
    return {
      system: { persona: settings.persona, facts: ctx.facts, stages: ctx.stages, categories: ctx.categories },
      turn: { task, playbook: ctx.playbook, examples: ctx.examples, blocks: ctx.blocks, history, batch, slots, notes: ctx.notes, similarCases: input.similarCases ?? [], now },
      guard: {
        sentBlockIds: state.sentBlockIds,
        exhaustedBlockKinds: ctx.exhaustedBlockKinds,
        allow: ctx.allow,
        pastBotMessages: history.filter((m) => m.role === 'bot').map((m) => m.text),
        clientLanguage: slots.language,
        greetedToday: Boolean(state.lastGreetingAt && sameDay(state.lastGreetingAt, now)),
        config: settings.guard,
      },
      task,
      blocks: ctx.blocks,
    };
  }

  /**
   * Похожие прошлые случаи для промпта (раздел 9.3 ТЗ). Ищем только по тексту
   * клиента: у касания его нет, значит и подсказывать нечем.
   */
  private async findSimilar(
    chat: TelegramChatEntity,
    state: AiChatStateEntity,
    stage: FunnelStage,
    batch: HistoryMessage[],
  ): Promise<{ lines: string[]; ids: string[] }> {
    if (batch.length === 0) return { lines: [], ids: [] };
    const cases = await this.similar.find({
      accountId: chat.accountId,
      chatId: chat.id,
      texts: batch.map((m) => m.text),
      stage,
      categoryKey: state.requestCategoryKey,
    });
    return { lines: formatSimilarCases(cases), ids: cases.map((c) => c.id) };
  }

  // ---------------------------------------------------------------------------
  // Передача менеджеру
  // ---------------------------------------------------------------------------

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
    const type: AlertType = reason === 'minor' ? 'minor' : reason === 'media' ? 'media' : reason === 'stale_lead' ? 'stale_lead' : reason === 'provider_error' ? 'ai_error' : 'handoff';
    const status: DraftStatus = reason === 'provider_error' ? 'pending_classification' : 'pending';
    const draft = await this.createDraft('handoff', status, state, chat, batch, reason, draftMessages, rationale ?? detail, turnId);
    await this.alerts.create({
      accountId: chat.accountId,
      chatId: chat.id,
      type,
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

  private async createDraft(
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

  // ---------------------------------------------------------------------------
  // Внутреннее
  // ---------------------------------------------------------------------------

  private async onProviderError(
    error: unknown,
    params: RunTurnParams,
    settings: AiAccountSettingsEntity,
    chat: TelegramChatEntity,
    state: AiChatStateEntity,
    batch: HistoryMessage[],
    handledId: number,
    slotPatch: Partial<AiChatStateEntity>,
    stage: FunnelStage,
    task: TurnTask,
  ): Promise<TurnRunResult> {
    const message = error instanceof Error ? error.message : String(error);
    const retryable = error instanceof LlmError ? error.retryable : true;
    const lastAttempt = params.attempt ? params.attempt.current >= params.attempt.max : false;
    if (retryable && !lastAttempt) throw error;

    // Провайдер не ответил и повторов не осталось (или ошибка не сетевая) — менеджеру, без текста.
    await this.turns.save(
      this.turns.create({
        accountId: chat.accountId,
        chatId: chat.id,
        trigger: params.trigger,
        touchKind: params.trigger === 'inbound' ? null : params.touchKind,
        stageBefore: stage,
        stageAfter: stage,
        inputMessageIds: batch.map((m) => m.id),
        clientText: batch.map((m) => m.text).join('\n'),
        promptVersion: PROMPT_VERSION,
        model: this.composer.modelName,
        outcome: 'error',
        error: message,
        analysis: { task: task.text },
      }),
    );
    await this.chatState.apply(state, {
      ...slotPatch,
      lastHandledMessageId: handledId,
      ...(batch.length > 0 ? { lastClientMessageAt: batch[batch.length - 1].sentAt } : {}),
    });
    await this.handoff(state, chat, 'provider_error', message, batch, [], null, null);
    void settings;
    return done('error', null, message);
  }

  /** Стоп-триггеры по результату модели: escalation, язык, уверенность, несовершеннолетний, guard. */
  private stopReason(
    state: AiChatStateEntity,
    gen: GenerateResult,
    ctx: TurnContext,
    settings: AiAccountSettingsEntity,
  ): StopVerdict | null {
    const last = gen.guardNotes[gen.guardNotes.length - 1];
    return stopReason({
      isMinor: state.isMinor,
      analysis: gen.output.analysis,
      hasEnglishTexts: ctx.hasEnglishTexts,
      guardOk: gen.guardOk,
      guardRemark: last ? describeViolations(last.violations) : null,
      confidenceThreshold: settings.guard.confidenceThreshold,
    });
  }

  private async silentTurn(
    params: RunTurnParams,
    settings: AiAccountSettingsEntity,
    chat: TelegramChatEntity,
    state: AiChatStateEntity,
    turnBase: Partial<AiTurnEntity>,
    basePatch: Partial<AiChatStateEntity>,
    stage: FunnelStage,
    gen: GenerateResult,
    ctx: TurnContext,
    rng: Rng,
    now: Date,
  ): Promise<TurnRunResult> {
    const turn = await this.turns.save(this.turns.create({ ...turnBase, stageAfter: stage, outcome: 'silent', error: gen.output.reply.silentReason }));
    const patch: Partial<AiChatStateEntity> = { ...basePatch };
    if (params.trigger === 'touch' && params.touchKind) {
      // Касание неуместно сейчас — переносим, но не бесконечно.
      const postponed = state.touchPostponedCount + 1;
      if (postponed <= 2) {
        const shortKinds: TouchKind[] = ['birth_nudge', 'diagnostics', 'reengage'];
        const wanted = shortKinds.includes(params.touchKind)
          ? new Date(now.getTime() + settings.timings.diagnosticsDelayMin * 60_000)
          : new Date(now.getTime() + pickInterval({ timings: settings.timings, lastIntervalHours: state.lastIntervalHours ? Number(state.lastIntervalHours) : null, rng }) * 3_600_000);
        const at = await this.scheduleTouch(state, params.touchKind, wanted, settings, rng);
        Object.assign(patch, { touchPostponedCount: postponed, nextTouchKind: params.touchKind, nextTouchAt: at });
        await this.chatState.apply(state, patch);
        await this.chatState.recordEvent(chat.accountId, chat.id, 'touch_scheduled', { kind: params.touchKind, at: at.toISOString(), postponed });
        return done('silent', turn.id, `Касание перенесено: ${gen.output.reply.silentReason ?? ''}`);
      }
      // Дважды переносили — считаем касание выполненным и идём дальше по воронке.
      const after = stageAfterTurn(stage, 'touch', params.touchKind, 'stay', stageCtx(state, ctx));
      await this.finishTurn({
        chat,
        state,
        settings,
        refs: refsOf(ctx),
        turn,
        sent: [],
        planned: [],
        extraPatch: { ...patch, touchPostponedCount: 0 },
        stageBefore: stage,
        stageAfter: after,
        trigger: 'touch',
        touchKind: params.touchKind,
        rng,
        now,
      });
      return done('silent', turn.id, 'Касание пропущено после двух переносов');
    }
    await this.chatState.apply(state, patch);
    await this.chatState.publishFunnel(state);
    return done('silent', turn.id, gen.output.reply.silentReason ?? 'Модель решила промолчать');
  }

  /** Этап после хода: решение модели плюс структурные правила (раздел 5.2 ТЗ). */
  stageAfter(params: {
    state: AiChatStateEntity;
    stage: FunnelStage;
    trigger: TurnTrigger;
    touchKind: TouchKind | null;
    progress: string;
    requestKnown: boolean;
    hasDiscountBlock: boolean;
    settings: AiAccountSettingsEntity;
  }): FunnelStage {
    const { state, stage, trigger, touchKind, settings } = params;
    let after = stageAfterTurn(stage, trigger, trigger === 'inbound' ? null : touchKind, params.progress, {
      birthKnown: Boolean(state.birthDate || state.birthDateText),
      requestKnown: params.requestKnown,
      hasDiscountBlock: params.hasDiscountBlock,
    });
    if (trigger !== 'inbound' && touchKind === 'reminder' && state.remindersSent + 1 >= settings.timings.maxReminders) after = 'closed_silent';
    return after;
  }

  /** Общее завершение хода после отправки (или сухого прогона): состояние, счётчики, таймеры, события. */
  async finishTurn(params: FinishTurnParams): Promise<void> {
    const { chat, state, settings, refs, turn, sent, planned, stageBefore, stageAfter, trigger, touchKind, now } = params;
    const rng = params.rng ?? defaultRng;
    const extraPatch = params.extraPatch ?? {};
    const interrupted = params.interrupted ?? false;
    const isTouch = trigger === 'touch' || (trigger === 'manual' && touchKind !== null);
    const delivered = sent.length > 0 ? sent : planned;
    const blockIds = delivered.map((m) => m.blockId).filter((id): id is string => Boolean(id));
    const sentDiagnosticId = refs.diagnosticIds.find((id) => blockIds.includes(id)) ?? null;
    const greeted = delivered.some((m) => startsWithGreeting(m.text));

    const patch: Partial<AiChatStateEntity> = {
      ...extraPatch,
      stage: stageAfter,
      ...(stageAfter !== state.stage ? { stageEnteredAt: now } : {}),
      lastBotMessageAt: now,
      autoMessagesSinceClient: isTouch ? state.autoMessagesSinceClient : (extraPatch.autoMessagesSinceClient ?? state.autoMessagesSinceClient) + 1,
      sentBlockIds: [...new Set([...state.sentBlockIds, ...blockIds])],
      usedExampleIds: [...new Set([...state.usedExampleIds, ...refs.exampleIds])].slice(-200),
      ...(greeted ? { lastGreetingAt: now } : {}),
      ...(sentDiagnosticId ? { diagnosticsTemplateId: sentDiagnosticId, diagnosticsSentAt: now, diagnosticsReadAt: null } : {}),
      ...(isTouch && touchKind === 'reminder' ? { remindersSent: state.remindersSent + 1 } : {}),
      ...(stageAfter === 'closed_silent' ? { closedAt: now } : {}),
      touchPostponedCount: 0,
    };

    // Следующее касание — от момента отправки; входящее во время отправки обработает inbound-job.
    const nextTouch = interrupted
      ? null
      : planNextTouch({
          stage: stageAfter,
          trigger,
          touchKind: isTouch ? touchKind : null,
          birthKnown: Boolean(state.birthDate || state.birthDateText),
          remindersSent: patch.remindersSent ?? state.remindersSent,
          lastIntervalHours: state.lastIntervalHours ? Number(state.lastIntervalHours) : null,
          diagnosticsReadAt: state.diagnosticsReadAt,
          hasDiscountBlock: refs.hasDiscountBlock,
          timings: settings.timings,
          now,
          rng,
        });
    // Ночное окно может сдвинуть касание на утро — в состояние пишем фактическое время.
    const touchAt = nextTouch ? await this.scheduleTouch(state, nextTouch.kind, nextTouch.at, settings, rng) : null;
    patch.nextTouchKind = nextTouch?.kind ?? null;
    patch.nextTouchAt = touchAt;
    if (nextTouch?.intervalHours) patch.lastIntervalHours = String(nextTouch.intervalHours);

    await this.chatState.apply(state, patch);
    if (stageBefore !== stageAfter) {
      await this.chatState.recordEvent(chat.accountId, chat.id, 'stage_changed', { from: stageBefore, to: stageAfter, turnId: turn.id });
    }
    if (nextTouch && touchAt) {
      await this.chatState.recordEvent(chat.accountId, chat.id, 'touch_scheduled', { kind: nextTouch.kind, at: touchAt.toISOString(), turnId: turn.id });
    } else {
      await this.jobs.cancel('touch', chat.accountId, chat.id);
    }
    const libraryIds = await this.bumpCounters(refs, blockIds);
    await this.turns.update(turn.id, { libraryIds, ...(sent.length > 0 ? { messagesSent: sent } : {}) });
    await this.chatState.publishFunnel(state);
    await this.realtime.publishForAccount(chat.accountId, { type: 'turn.sent', accountId: chat.accountId, chatId: chat.id, turnId: turn.id });
  }

  /** Ставит касание в очередь с учётом ночного окна; возвращает фактическое время. */
  async scheduleTouch(state: AiChatStateEntity, kind: TouchKind, at: Date, settings: AiAccountSettingsEntity, rng: Rng): Promise<Date> {
    const runAt = shiftForNightWindow(at, settings.nightWindow, rng);
    await this.jobs.enqueue({ type: 'touch', accountId: state.accountId, chatId: state.chatId, runAt, payload: { kind } });
    return runAt;
  }

  /**
   * Менеджер не подтвердил ход-касание в supervised за отведённое время:
   * черновик устаревает, касание переносится на следующий интервал (раздел 8.4 ТЗ).
   */
  async superviseTimeout(accountId: string, chatId: string, draftId: string, kind: TouchKind, rng: Rng = defaultRng): Promise<string> {
    const draft = await this.drafts.findOne({ where: { id: draftId, chatId } });
    if (!draft || !isOpen(draft.status)) return 'Черновик уже решён';
    const state = await this.chatState.find(chatId);
    if (!state || state.mode !== 'supervised') return 'Чат больше не в режиме supervised';
    await this.drafts.update(draft.id, { status: 'superseded', decidedAt: new Date() });
    await this.realtime.publishForAccount(accountId, { type: 'draft.updated', accountId, chatId, draftId: draft.id, status: 'superseded' });
    const at = await this.postponeTouch(state, kind, 'supervise_timeout', { draftId }, rng);
    return `Касание ${kind} перенесено на ${at.toISOString()}`;
  }

  /**
   * Касание не состоялось (таймаут подтверждения или менеджер отклонил ход) —
   * переносим его на новый интервал, чтобы воронка не замирала.
   */
  async postponeTouch(
    state: AiChatStateEntity,
    kind: TouchKind,
    reason: string,
    extra: Record<string, unknown> = {},
    rng: Rng = defaultRng,
  ): Promise<Date> {
    const settings = await this.settings.get(state.accountId);
    const hours = pickInterval({ timings: settings.timings, lastIntervalHours: state.lastIntervalHours ? Number(state.lastIntervalHours) : null, rng });
    const at = await this.scheduleTouch(state, kind, new Date(Date.now() + hours * 3_600_000), settings, rng);
    await this.chatState.apply(state, { nextTouchKind: kind, nextTouchAt: at, lastIntervalHours: String(hours) });
    await this.chatState.recordEvent(state.accountId, state.chatId, 'touch_scheduled', { kind, at: at.toISOString(), reason, ...extra });
    await this.chatState.publishFunnel(state);
    return at;
  }

  /** Счётчик отправок примеров, блоков и диагностик; возвращает их id для счётчика ответов. */
  private async bumpCounters(refs: TurnLibraryRefs, blockIds: string[]): Promise<string[]> {
    const phraseIds = [...refs.exampleIds, ...refs.phraseBlockIds.filter((id) => blockIds.includes(id))];
    const diagnosticIds = refs.diagnosticIds.filter((id) => blockIds.includes(id));
    if (phraseIds.length > 0) await this.phrases.increment({ id: In(phraseIds) }, 'sentCount', 1).catch(() => undefined);
    if (diagnosticIds.length > 0) await this.diagnostics.increment({ id: In(diagnosticIds) }, 'sentCount', 1).catch(() => undefined);
    return [...phraseIds, ...diagnosticIds];
  }

  /**
   * Лимиты сообщений бота (раздел 6.1 ТЗ): в один чат за сутки и по аккаунту
   * за час. Ход не отменяем, а переносим: тема разговора никуда не денется,
   * а сообщений в чате станет меньше, чем у живого человека.
   */
  private async overMessageLimit(
    chat: TelegramChatEntity,
    settings: AiAccountSettingsEntity,
    now: Date,
  ): Promise<{ reason: string; retryMs: number } | null> {
    const perChat = await this.messages.count({
      where: { chatId: chat.id, direction: 'out', aiTurnId: Not(IsNull()), sentAt: MoreThan(new Date(now.getTime() - 86_400_000)) },
    });
    if (perChat >= settings.limits.botMessagesPerChatPerDay) {
      return {
        reason: `Лимит сообщений бота в чат за сутки (${settings.limits.botMessagesPerChatPerDay}) исчерпан`,
        retryMs: CHAT_LIMIT_POSTPONE_MS,
      };
    }
    const perHour = await this.messages
      .createQueryBuilder('m')
      .innerJoin(TelegramChatEntity, 'c', 'c.id = m.chatId')
      .where('c.accountId = :accountId', { accountId: chat.accountId })
      .andWhere('m.direction = :direction', { direction: 'out' })
      .andWhere('m.aiTurnId IS NOT NULL')
      .andWhere('m.sentAt > :since', { since: new Date(now.getTime() - 3_600_000) })
      .getCount();
    if (perHour >= settings.limits.botMessagesPerHour) {
      return {
        reason: `Лимит сообщений бота по аккаунту в час (${settings.limits.botMessagesPerHour}) исчерпан`,
        retryMs: LIMIT_POSTPONE_MS,
      };
    }
    return null;
  }

  private async overLlmLimit(accountId: string, settings: AiAccountSettingsEntity, now: Date): Promise<string | null> {
    const hour = await this.turns.count({ where: { accountId, createdAt: MoreThan(new Date(now.getTime() - 3_600_000)) } });
    if (hour >= settings.limits.llmCallsPerHour) return `Лимит вызовов модели в час (${settings.limits.llmCallsPerHour}) исчерпан`;
    const day = await this.turns.count({ where: { accountId, createdAt: MoreThan(new Date(now.getTime() - 86_400_000)) } });
    if (day >= settings.limits.llmCallsPerDay) return `Лимит вызовов модели в сутки (${settings.limits.llmCallsPerDay}) исчерпан`;
    return null;
  }

  private async recentTurns(chatId: string): Promise<RecentTurnSummary[]> {
    const rows = await this.turns.find({ where: { chatId }, order: { createdAt: 'DESC' }, take: RECENT_TURNS });
    return rows.reverse().map((t) => ({
      stageBefore: t.stageBefore,
      stageAfter: t.stageAfter,
      clientIntent: typeof t.analysis?.clientIntent === 'string' ? (t.analysis.clientIntent as string) : null,
      trigger: t.trigger,
    }));
  }

  /** Слоты, которые вынимаем кодом из входящих: дата рождения, возраст, язык. */
  private codeSlots(state: AiChatStateEntity, batch: HistoryMessage[], now: Date): Partial<AiChatStateEntity> {
    const patch: Partial<AiChatStateEntity> = {};
    if (batch.length === 0) return patch;
    const text = batch.map((m) => m.text).join('\n');
    if (!state.manualSlots.includes('birthDate') && !state.birthDate) {
      const parsed = parseBirthDate(text, now);
      if (parsed) {
        patch.birthDateText = parsed.text;
        if (parsed.iso) {
          patch.birthDate = parsed.iso;
          const age = ageFrom(parsed.iso, now);
          patch.age = age;
          patch.isMinor = age !== null && age < 18;
        }
      }
    }
    if (!state.manualSlots.includes('language')) {
      const language = detectLanguage(text);
      if (language && language !== 'other') patch.language = language;
    }
    return patch;
  }

  /** Слоты из анализа модели — только пустые, ручные не трогаем. */
  private llmSlots(state: AiChatStateEntity, output: ComposerOutput, now: Date): Partial<AiChatStateEntity> {
    const slots = output.analysis.slots ?? {};
    const patch: Partial<AiChatStateEntity> = {};
    const manual = new Set(state.manualSlots);
    if (!manual.has('birthDate') && !state.birthDate && slots.birthDate) {
      const parsed = parseBirthDate(slots.birthDate, now);
      if (parsed?.iso) {
        patch.birthDate = parsed.iso;
        patch.birthDateText = slots.birthDateText ?? state.birthDateText ?? parsed.text;
        const age = ageFrom(parsed.iso, now);
        patch.age = age;
        patch.isMinor = age !== null && age < 18;
      }
    }
    if (!manual.has('birthPlace') && !state.birthPlace && slots.birthPlace) patch.birthPlace = slots.birthPlace;
    if (!manual.has('request') && slots.requestSummary && (!state.requestSummary || state.requestSummary.length < slots.requestSummary.length)) {
      patch.requestSummary = slots.requestSummary;
    }
    if (!manual.has('request') && slots.requestCategoryKey && !state.requestCategoryKey) patch.requestCategoryKey = slots.requestCategoryKey;
    if (!manual.has('gender') && !state.gender && slots.genderHint) {
      patch.gender = slots.genderHint;
      patch.genderSource = 'text';
    }
    if (!manual.has('language') && output.analysis.language !== 'other' && output.analysis.language !== state.language) {
      patch.language = output.analysis.language;
    }
    if (slots.isMinorHint && !manual.has('birthDate')) patch.isMinor = true;
    return patch;
  }
}

// --- вспомогательное ---------------------------------------------------------------

function done(outcome: TurnOutcome | 'skip', turnId: string | null, detail: string): TurnRunResult {
  return { kind: 'done', outcome, turnId, detail };
}

export function snapshot(state: AiChatStateEntity): SlotsSnapshot {
  return {
    birthDate: state.birthDate,
    birthDateText: state.birthDateText,
    birthPlace: state.birthPlace,
    age: state.age,
    gender: state.gender,
    language: state.language || 'ru',
    requestCategoryKey: state.requestCategoryKey,
    requestSummary: state.requestSummary,
    manualSlots: state.manualSlots,
  };
}

function stageCtx(state: AiChatStateEntity, ctx: TurnContext) {
  return {
    birthKnown: Boolean(state.birthDate || state.birthDateText),
    requestKnown: Boolean(state.requestSummary),
    hasDiscountBlock: ctx.hasDiscountBlock,
  };
}

export function toTurnMessage(message: ComposedMessage): TurnMessage {
  return { text: message.text, blockId: message.blockId, telegramMessageId: null, sentAt: null };
}

function sameDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}
