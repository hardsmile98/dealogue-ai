import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { RealtimeService } from '../../../realtime/realtime.service.js';
import { TelegramChatEntity } from '../../../telegram/entities/telegram-chat.entity.js';
import { TelegramMessageEntity } from '../../../telegram/entities/telegram-message.entity.js';
import { AlertsService } from '../../alerts/alerts.service.js';
import type { FunnelStage, TouchKind, TurnTrigger } from '../../domain/types.js';
import type { AiAccountSettingsEntity } from '../../entities/ai-account-settings.entity.js';
import type { AiChatStateEntity } from '../../entities/ai-chat-state.entity.js';
import { AiTurnEntity } from '../../entities/ai-turn.entity.js';
import type { TurnMessage } from '../../entities/ai-turn.entity.js';
import { LlmError } from '../../llm/llm-provider.interface.js';
import { AiSettingsService } from '../../settings/ai-settings.service.js';
import type { ComposedMessage, HistoryMessage, TurnTask } from '../agent.types.js';
import { PROMPT_VERSION } from '../composer/prompt-builder.js';
import { MAX_TOUCH_POSTPONES, postponedTouchAt } from '../funnel/touch-planner.js';
import { defaultRng } from '../lib/random.js';
import type { Rng } from '../lib/random.js';
import { toTurnMessage } from '../lib/turn-message.js';
import { cardPatch, clientCard, slotsOf } from '../card/turn-card.js';
import { OutboundInterruptedError, OutboundService } from '../outbound/outbound.service.js';
import { plan, stageAfterTurn, stageForTouch } from '../planner/planner.js';
import { ChatStateService, StaleStateError } from './chat-state.service.js';
import { HandoffService } from './handoff.service.js';
import { ManagerDraftService } from './manager-draft.service.js';
import { TouchSchedulerService, lastInterval } from './touch-scheduler.service.js';
import { TurnContextService, peerOf, refsOf, toHistoryMessage } from './turn-context.service.js';
import type { TurnContext } from './turn-context.service.js';
import { TurnFinalizerService } from './turn-finalizer.service.js';
import { TurnGenerationService } from './turn-generation.service.js';
import type { GenerateResult } from './turn-generation.service.js';
import { TurnLimitsService } from './turn-limits.service.js';
import { done, postpone } from './turn-result.js';
import type { RunTurnParams, TurnRunResult } from './turn-result.js';

/** Лид ждал первого ответа дольше этого — отвечать «привет» уже странно. */
const STALE_LEAD_MS = 6 * 3_600_000;
const HOUR_MS = 3_600_000;
/** Аккаунт офлайн или отправка сорвалась — вернёмся через минуту. */
const OFFLINE_RETRY_MS = 60_000;
/** Состояние чата обогнали — перечитаем почти сразу. */
const STALE_STATE_RETRY_MS = 5_000;

/**
 * Ход агента целиком (раздел 4 ТЗ): Planner → Composer → Guard → Outbound →
 * состояние и таймеры. Один вызов — один ход; параллельность по чату
 * исключает очередь (один job на чат) и версия состояния.
 *
 * Сам сервис только ведёт ход по шагам, за каждым шагом стоит свой:
 * TurnGenerationService — вызов модели и проверка ответа,
 * TurnLimitsService — лимиты, HandoffService — передача менеджеру,
 * TurnFinalizerService — закрытие хода, TouchSchedulerService — касания,
 * ManagerDraftService — чат, который ведёт человек.
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
    private readonly settings: AiSettingsService,
    private readonly chatState: ChatStateService,
    private readonly context: TurnContextService,
    private readonly generation: TurnGenerationService,
    private readonly limits: TurnLimitsService,
    private readonly handoffs: HandoffService,
    private readonly finalizer: TurnFinalizerService,
    private readonly touches: TouchSchedulerService,
    private readonly managerDrafts: ManagerDraftService,
    private readonly outbound: OutboundService,
    private readonly alerts: AlertsService,
    private readonly realtime: RealtimeService,
  ) {}

  async runTurn(params: RunTurnParams): Promise<TurnRunResult> {
    try {
      return await this.runTurnInner(params);
    } catch (error) {
      // Состояние чата изменилось под нами — перечитаем и попробуем снова.
      if (error instanceof StaleStateError) return postpone(new Date(Date.now() + STALE_STATE_RETRY_MS), error.message);
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

    if (params.resume) return this.resumeTurn(params, chat, state);

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

    // Чат ведёт человек — бот только готовит черновик ответа (раздел 8.3 ТЗ).
    // Проверяем до стоп-триггеров: передавать нечего, чат уже у менеджера.
    if (state.mode === 'manager') {
      return this.managerDrafts.run({ params, settings, chat, state, batch, handledId, now, rng });
    }

    // Лид ждал первого ответа слишком долго — отвечать «привет» через полдня странно.
    if (stage === 'greeting' && trigger === 'inbound' && !state.lastBotMessageAt && now.getTime() - batch[0].sentAt.getTime() > STALE_LEAD_MS) {
      await this.chatState.apply(state, { lastHandledMessageId: handledId, lastClientMessageAt: batch[batch.length - 1].sentAt });
      await this.handoffs.handoff(state, chat, 'stale_lead', 'Лид ждал первого ответа больше 6 часов', batch, [], null, null);
      return done('handoff', null, 'stale_lead');
    }

    if (state.isMinor) {
      await this.chatState.apply(state, { lastHandledMessageId: handledId });
      await this.handoffs.handoff(state, chat, 'minor', `По дате рождения клиенту ${state.age ?? '<18'} лет`, batch, [], null, null);
      return done('handoff', null, 'minor');
    }

    // Карточка клиента до хода: её увидит модель и вернёт обновлённой.
    const card = clientCard(state, settings.persona.language, now);
    const slots = slotsOf(card, state.manualSlots, now);
    const ctx = await this.context.load({
      accountId: chat.accountId,
      stage,
      touchKind: trigger === 'inbound' ? null : touchKind,
      slots,
      usedExampleIds: state.usedExampleIds,
      sentBlockIds: state.sentBlockIds,
      accountLanguage: settings.persona.language,
      rng,
    });
    const history = await this.context.loadHistory(chat.id, batch.map((m) => m.id));

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
      recentTurns: await this.context.recentTurns(chat.id),
      now,
    });

    if (verdict.kind === 'skip') {
      return this.skipTurn(chat, state, verdict.detail, handledId, batch, stage, trigger, touchKind);
    }
    if (verdict.kind === 'handoff') {
      await this.chatState.apply(state, {
        lastHandledMessageId: handledId,
        ...(batch.length > 0 ? { lastClientMessageAt: batch[batch.length - 1].sentAt } : {}),
      });
      await this.handoffs.handoff(state, chat, verdict.reason, verdict.detail, batch, [], null, null);
      return done('handoff', null, verdict.reason);
    }

    // Лимиты вызовов модели и сообщений бота (разделы 6.1, 7 ТЗ): ход не
    // отменяем, а переносим — тема разговора никуда не денется.
    const llmLimit = await this.limits.llmCalls(chat.accountId, settings, now);
    if (llmLimit) return postpone(new Date(now.getTime() + llmLimit.retryMs), llmLimit.reason);
    const messageLimit = await this.limits.botMessages(chat, settings, now);
    if (messageLimit) return postpone(new Date(now.getTime() + messageLimit.retryMs), messageLimit.reason);

    const task = verdict.task;
    const similar = await this.generation.findSimilar(chat, state, stage, batch);

    let gen: GenerateResult;
    try {
      gen = await this.generation.generate(
        this.generation.paramsFor({ settings, ctx, task, history, batch, card, slots, peer: peerOf(chat), state, similarCases: similar.lines, badCases: similar.badLines, now }),
      );
    } catch (error) {
      return this.onProviderError(error, params, chat, state, batch, handledId, stage, task);
    }

    // --- карточка клиента и стоп-триггеры от модели ---------------------------------
    // Карточку слил TurnGeneration — по ней же выбраны блоки этого хода.
    const cardState = cardPatch(gen.card, now);
    Object.assign(state, cardState);
    const turnBase: Partial<AiTurnEntity> = {
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
      // Что карточка изменила в этот ход и на каких словах клиента — рядом с ответом
      // модели: именно сюда смотрят, когда спрашивают «почему бот так решил».
      analysis: { ...gen.output.analysis, cardChanges: gen.cardChanges } as unknown as Record<string, unknown>,
      messagesPlanned: gen.messages.map(toTurnMessage),
      guardNotes: gen.guardNotes as unknown as Record<string, unknown>[],
      tokensIn: gen.tokensIn,
      tokensOut: gen.tokensOut,
      durationMs: gen.durationMs,
    };
    const basePatch: Partial<AiChatStateEntity> = {
      ...cardState,
      lastHandledMessageId: handledId,
      ...(batch.length > 0 ? { lastClientMessageAt: batch[batch.length - 1].sentAt, autoMessagesSinceClient: 0 } : {}),
    };

    const stop = this.generation.stopReason(state, gen, ctx, settings);
    if (stop) {
      const turn = await this.turns.save(this.turns.create({ ...turnBase, stageAfter: stage, outcome: 'handoff' }));
      await this.chatState.apply(state, basePatch);
      await this.handoffs.handoff(state, chat, stop.reason, stop.detail, batch, gen.messages, turn.id, gen.output.analysis.escalation?.note ?? null);
      return done('handoff', turn.id, stop.reason);
    }

    if (!gen.output.reply.send || gen.messages.length === 0) {
      return this.silentTurn(params, settings, chat, state, turnBase, basePatch, stage, gen, ctx, rng, now);
    }

    // --- доставка ------------------------------------------------------------------
    const after = this.finalizer.stageAfter({
      state,
      stage,
      trigger,
      touchKind,
      progress: gen.output.analysis.stageProgress,
      requestKnown: Boolean(state.requestSummary),
      hasDiscountBlock: ctx.hasDiscountBlock,
      settings,
    });

    // В supervised черновик создаётся и в сухом прогоне — подтверждение учитывает dryRun само.
    if (state.mode === 'supervised') {
      const turn = await this.turns.save(this.turns.create({ ...turnBase, stageAfter: stage, outcome: 'awaiting_approval' }));
      await this.chatState.apply(state, { ...basePatch, ...(trigger === 'touch' ? { nextTouchKind: null, nextTouchAt: null } : {}) });
      const draft = await this.handoffs.createDraft('supervised', 'pending', state, chat, batch, null, gen.messages, gen.output.analysis.clientIntent, turn.id);
      if (trigger === 'touch' && touchKind) {
        // Менеджер не подтвердит вовремя — касание уйдёт на следующий интервал.
        const deadline = new Date(now.getTime() + settings.timings.superviseTimeoutHours * HOUR_MS);
        await this.touches.scheduleSuperviseTimeout(state, touchKind, draft.id, deadline);
      }
      return done('awaiting_approval', turn.id, 'Ход ждёт подтверждения менеджера');
    }

    if (settings.dryRun) {
      const turn = await this.turns.save(this.turns.create({ ...turnBase, stageAfter: after, outcome: 'dry_run' }));
      await this.finalizer.finish({
        chat,
        state,
        settings,
        refs: refsOf(ctx, gen.blocks),
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
      return postpone(new Date(now.getTime() + OFFLINE_RETRY_MS), 'Аккаунт не подключён к Telegram');
    }

    const turn = await this.turns.save(this.turns.create({ ...turnBase, stageAfter: after, outcome: 'sent' }));
    await this.chatState.apply(state, basePatch);
    try {
      const result = await this.outbound.sendTurn({
        accountId: chat.accountId,
        chat,
        turnId: turn.id,
        messages: gen.messages,
        inboundChars: trigger === 'inbound' ? batch.reduce((sum, m) => sum + m.text.length, 0) : null,
        markRead: settings.markRead,
        lastHandledMessageId: handledId,
        onProgress: (sent) => this.reportProgress(params, turn.id, sent),
        rng,
      });
      await this.finalizer.finish({
        chat,
        state,
        settings,
        refs: refsOf(ctx, gen.blocks),
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
      return result.interrupted
        ? done('cancelled', turn.id, 'Клиент написал во время отправки')
        : done('sent', turn.id, `Отправлено ${result.sent.length} сообщ.`);
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
    chat: TelegramChatEntity,
    state: AiChatStateEntity,
  ): Promise<TurnRunResult> {
    const resume = params.resume as { turnId: string; nextIndex: number };
    const turn = await this.turns.findOne({ where: { id: resume.turnId, chatId: chat.id } });
    if (!turn) return done('skip', null, 'Ход для продолжения не найден');
    if (state.mode !== 'auto') return done('cancelled', turn.id, 'Режим чата изменился — остаток хода не отправляем');
    if (!this.outbound.isOnline(chat.accountId)) {
      return postpone(new Date(Date.now() + OFFLINE_RETRY_MS), 'Аккаунт не подключён к Telegram');
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
        onProgress: (sent) => this.reportProgress(params, turn.id, sent),
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

  /** Planner решил не ходить: состояние двигаем, но ни модель, ни отправку не трогаем. */
  private async skipTurn(
    chat: TelegramChatEntity,
    state: AiChatStateEntity,
    detail: string,
    handledId: number,
    batch: HistoryMessage[],
    stage: FunnelStage,
    trigger: TurnTrigger,
    touchKind: TouchKind | null,
  ): Promise<TurnRunResult> {
    await this.chatState.apply(state, {
      lastHandledMessageId: handledId,
      ...(batch.length > 0 ? { lastClientMessageAt: batch[batch.length - 1].sentAt, autoMessagesSinceClient: 0 } : {}),
      ...(trigger === 'touch' ? { nextTouchKind: null, nextTouchAt: null } : {}),
    });
    // Шаг требует блока, которого в библиотеке нет — это чинит человек.
    const missing = detail.startsWith('library_incomplete:') ? detail.slice('library_incomplete:'.length) : null;
    if (missing) {
      await this.alerts.create({
        accountId: chat.accountId,
        chatId: chat.id,
        type: 'library_incomplete',
        payload: { stage, detail: `Нет включённого блока «${missing}» — шаг пропущен` },
      });
    }
    await this.chatState.recordEvent(chat.accountId, chat.id, 'touch_cancelled', { trigger, touchKind, detail });
    return done('skip', null, detail);
  }

  /**
   * Модель решила промолчать. У касания это значит «сейчас неуместно» —
   * переносим, но не бесконечно: после двух переносов идём дальше по воронке.
   */
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
    const { trigger, touchKind } = params;

    if (trigger !== 'touch' || !touchKind) {
      await this.chatState.apply(state, patch);
      await this.chatState.publishFunnel(state);
      return done('silent', turn.id, gen.output.reply.silentReason ?? 'Модель решила промолчать');
    }

    const postponed = state.touchPostponedCount + 1;
    if (postponed <= MAX_TOUCH_POSTPONES) {
      const wanted = postponedTouchAt(touchKind, { timings: settings.timings, lastIntervalHours: lastInterval(state), now, rng });
      const at = await this.touches.schedule(state, touchKind, wanted);
      Object.assign(patch, { touchPostponedCount: postponed, nextTouchKind: touchKind, nextTouchAt: at });
      await this.chatState.apply(state, patch);
      await this.chatState.recordEvent(chat.accountId, chat.id, 'touch_scheduled', { kind: touchKind, at: at.toISOString(), postponed });
      return done('silent', turn.id, `Касание перенесено: ${gen.output.reply.silentReason ?? ''}`);
    }

    // Дважды переносили — считаем касание выполненным и идём дальше по воронке.
    const after = stageAfterTurn(stage, 'touch', touchKind, 'stay', {
      birthKnown: Boolean(state.birthDate || state.birthDateText),
      requestKnown: Boolean(state.requestSummary),
      hasDiscountBlock: ctx.hasDiscountBlock,
    });
    await this.finalizer.finish({
      chat,
      state,
      settings,
      refs: refsOf(ctx, gen.blocks),
      turn,
      sent: [],
      planned: [],
      extraPatch: { ...patch, touchPostponedCount: 0 },
      stageBefore: stage,
      stageAfter: after,
      trigger: 'touch',
      touchKind,
      rng,
      now,
    });
    return done('silent', turn.id, 'Касание пропущено после двух переносов');
  }

  /**
   * Провайдер не ответил. Пока попытки есть и ошибка сетевая — бросаем дальше,
   * очередь повторит. Иначе чат уходит менеджеру без текста.
   */
  private async onProviderError(
    error: unknown,
    params: RunTurnParams,
    chat: TelegramChatEntity,
    state: AiChatStateEntity,
    batch: HistoryMessage[],
    handledId: number,
    stage: FunnelStage,
    task: TurnTask,
  ): Promise<TurnRunResult> {
    const message = error instanceof Error ? error.message : String(error);
    const retryable = error instanceof LlmError ? error.retryable : true;
    const lastAttempt = params.attempt ? params.attempt.current >= params.attempt.max : false;
    if (retryable && !lastAttempt) throw error;

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
        model: this.generation.modelName,
        outcome: 'error',
        error: message,
        analysis: { task: task.text },
      }),
    );
    await this.chatState.apply(state, {
      lastHandledMessageId: handledId,
      ...(batch.length > 0 ? { lastClientMessageAt: batch[batch.length - 1].sentAt } : {}),
    });
    await this.handoffs.handoff(state, chat, 'provider_error', message, batch, [], null, null);
    return done('error', null, message);
  }

  /** Отправили часть сообщений: сохраняем прогресс, чтобы после сбоя дослать остаток. */
  private async reportProgress(params: RunTurnParams, turnId: string, sent: TurnMessage[]): Promise<void> {
    await this.turns.update(turnId, { messagesSent: sent });
    if (params.onProgress) await params.onProgress({ resumeTurnId: turnId, resumeIndex: sent.length });
  }
}
