import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { KeyedLock } from '../../common/async.js';
import { errorMessage } from '../../common/errors.js';
import type { TelegramAccountEntity } from '../../telegram/entities/telegram-account.entity.js';
import { TelegramAccountsRepository } from '../../telegram/repositories/telegram-accounts.repository.js';
import { BotConfig } from '../bot.config.js';
import { TurnInterrupted } from '../core/channel.js';
import type { Channel, Clock } from '../core/channel.js';
import { planDelays } from '../core/delivery.js';
import { hardChecks } from '../core/hard-checks.js';
import {
  HISTORY_LIMIT,
  formatHistory,
  lastOutgoing,
  milestoneMessageId,
  repliesSince,
} from '../core/history.js';
import type { HistoryLine } from '../core/history.js';
import { applyAnalysis } from '../core/memory.js';
import type { FactsUpdate } from '../core/memory.js';
import { buildPlan } from '../core/plan.js';
import { nextRetry } from '../core/retry.js';
import type {
  Analysis,
  FinalPart,
  HistoryMessage,
  JobKind,
  Memory,
  Plan,
  Review,
  TurnJob,
  TurnRequest,
  TurnResult,
} from '../core/types.js';
import type { BotChatStateEntity } from '../entities/bot-chat-state.entity.js';
import { MILESTONE_TITLES, stageFromMilestones } from '../library/kinds.js';
import type { HandoffReason, Stage } from '../library/kinds.js';
import { readPersona } from '../library/persona.js';
import type { Persona } from '../library/persona.js';
import { readTimings } from '../library/timings.js';
import type { Timings } from '../library/timings.js';
import { DeepSeekClient } from '../llm/deepseek.client.js';
import type { LlmClient } from '../llm/llm.types.js';
import { buildAnalyzerPrompt } from '../prompts/analyzer.prompt.js';
import {
  hasHardViolations,
  isBlocking,
  reviewNotes,
} from '../prompts/reviewer.prompt.js';
import type { ReviewerPromptInput } from '../prompts/reviewer.prompt.js';
import type { WriterPromptInput } from '../prompts/writer.prompt.js';
import { BotChatStateRepository } from '../repositories/bot-chat-state.repository.js';
import { BotJobsRepository } from '../repositories/bot-jobs.repository.js';
import { BotMemoryRepository } from '../repositories/bot-memory.repository.js';
import { BotTurnsRepository } from '../repositories/bot-turns.repository.js';
import { BotLadderService } from './bot-ladder.service.js';
import { BotRecoveryService } from './bot-recovery.service.js';
import { BotSettingsService } from './bot-settings.service.js';
import { LibraryContextService } from './library-context.service.js';
import type { LibraryContext } from './library-context.service.js';
import { TurnDeliveryService } from './turn-delivery.service.js';
import type { CommittedTurn } from './turn-delivery.service.js';
import { TurnLlmService } from './turn-llm.service.js';
import type { LlmCallContext } from './turn-llm.service.js';

/** Что нужно ходу от окружения: куда отправлять, чьё время, не устарел ли ход. */
export interface TurnEnvironment {
  channel: Channel;
  clock: Clock;
  /** Клиент дописал, пока ход готовился: результат выбрасывается. */
  isStale: () => boolean;
}

/** Срочные задания: созревшие или созреют в ближайшие минуты входят в ход клиента. */
const DUE_WINDOW_MS = 10 * 60_000;

/**
 * Сколько при остановке API ждать идущие ходы. Паузы и обращения к модели
 * прерываются сразу; ждём только начатую отправку в Telegram (у неё свой
 * таймаут 30 с) и запись в базу. Не дождались — ход подхватит
 * восстановление после старта.
 */
const DRAIN_TIMEOUT_MS = 35_000;

/** Ход прерван по ходу дела (клиент дописал) — не сбой, повтор не нужен. */
class TurnAbort extends Error {
  constructor(
    readonly status: TurnResult['status'],
    message: string,
  ) {
    super(message);
    this.name = 'TurnAbort';
  }
}

/** Аккаунт хода и его настройки агента, уже разобранные. */
interface AccountContext {
  account: TelegramAccountEntity;
  persona: Persona;
  timings: Timings;
  model: string;
}

/** Всё, что ход прочитал до обращения к модели. */
interface TurnContext extends AccountContext {
  turnId: string;
  state: BotChatStateEntity;
  library: LibraryContext;
  memory: Memory;
  history: HistoryMessage[];
  historyLines: HistoryLine[];
  stage: Stage;
  now: Date;
  llm: LlmCallContext;
}

/** Текст хода после проверки и жёстких проверок — то, что уйдёт клиенту. */
interface ComposedTurn {
  parts: FinalPart[];
  /** Текст ответчика не прошёл: вместо него — веха сама или запасная фраза. */
  fallback: boolean;
  writerArguments: readonly string[];
}

/**
 * Исполнитель хода — конвейер из раздела 3 документа: анализ → план →
 * текст → проверка → жёсткие проверки → точка фиксации → доставка →
 * закрытие. Один ход на чат одновременно (замок), ключ идемпотентности до
 * первой отправки. Обращения к модели — TurnLlmService, логика плана —
 * core/plan.ts, доставка и закрытие — TurnDeliveryService.
 *
 * Остановка API: новые ходы не начинаются, идущие останавливаются в
 * безопасной точке (паузы и обращения к модели прерываются, начатая
 * отправка доходит), и только потом закрываются Telegram и база. Что не
 * доделано, после старта подхватит BotRecoveryService.
 */
@Injectable()
export class TurnRunnerService implements OnModuleDestroy {
  private readonly logger = new Logger(TurnRunnerService.name);
  private readonly locks = new KeyedLock();
  /** Остановка API — сигнал всем идущим ходам. */
  private readonly stopping = new AbortController();
  /** Идущие ходы этого процесса — их ждёт остановка. */
  private readonly active = new Set<Promise<unknown>>();

  constructor(
    private readonly config: BotConfig,
    private readonly accounts: TelegramAccountsRepository,
    private readonly settings: BotSettingsService,
    private readonly libraries: LibraryContextService,
    private readonly states: BotChatStateRepository,
    private readonly memories: BotMemoryRepository,
    private readonly turns: BotTurnsRepository,
    private readonly jobs: BotJobsRepository,
    private readonly ladder: BotLadderService,
    private readonly model: TurnLlmService,
    private readonly delivery: TurnDeliveryService,
    private readonly recovery: BotRecoveryService,
    private readonly deepseek: DeepSeekClient,
  ) {}

  /**
   * Остановка, шаг 1 (до закрытия клиентов Telegram и базы): новые ходы
   * не начинаются, идущие доходят до безопасной точки.
   */
  async onModuleDestroy(): Promise<void> {
    this.stopping.abort();
    if (this.active.size === 0) return;
    this.logger.log(`Остановка: ждём идущие ходы — ${this.active.size}`);
    let timer: NodeJS.Timeout | undefined;
    const timedOut = await Promise.race([
      Promise.allSettled(this.active).then(() => false),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(true), DRAIN_TIMEOUT_MS);
      }),
    ]);
    clearTimeout(timer);
    if (timedOut) {
      this.logger.warn(
        `Остановка: не дождались ходов — ${this.active.size}; их дошлёт восстановление после старта`,
      );
    }
  }

  /** Ход целиком под замком чата; ходы разных чатов идут параллельно. */
  run(
    request: TurnRequest,
    env: TurnEnvironment,
    llm: LlmClient = this.deepseek,
  ): Promise<TurnResult> {
    if (this.stopping.signal.aborted) return Promise.resolve(interrupted());
    return this.track(
      this.locks.run(request.chatId, () => this.execute(request, env, llm)),
    );
  }

  /**
   * Задание `resume`: дослать собранный ход `turnId` (прерван остановкой
   * API или сбоем отправки) — или закрыть, если разговор ушёл вперёд.
   * Результат — последнего доведённого хода; null, если доводить нечего.
   */
  resume(
    job: TurnJob,
    chatId: string,
    turnId: string | null,
    env: TurnEnvironment,
  ): Promise<TurnResult | null> {
    if (this.stopping.signal.aborted) return Promise.resolve(interrupted());
    return this.track(
      this.locks.run(chatId, async () => {
        try {
          await this.recovery.ready();
          const { result } = await this.delivery.settle(
            chatId,
            env,
            this.stopping.signal,
            turnId && job.retry ? { turnId, retry: job.retry } : undefined,
          );
          await this.jobs.markDone(job.id);
          return result;
        } catch (error) {
          // Остановка API: задание остаётся `running`, его вернёт в очередь восстановление.
          if (error instanceof TurnInterrupted) return interrupted();
          throw error;
        }
      }),
    );
  }

  /**
   * Память по уже идущей переписке — для чата, скопированного в песочницу:
   * анализатор читает историю целиком и заполняет карточку, факты и резюме.
   * Ничего не отправляет; в журнале — ход `restore`.
   */
  restoreMemory(
    chatId: string,
    accountId: string,
    env: Pick<TurnEnvironment, 'channel' | 'clock'>,
    llm: LlmClient = this.deepseek,
  ): Promise<void> {
    if (this.stopping.signal.aborted) {
      return Promise.reject(new TurnInterrupted());
    }
    return this.track(this.restore(chatId, accountId, env, llm));
  }

  /** Передача менеджеру: режим, причина, ярлык, снятие заданий. Нужна и каналу (чужое исходящее). */
  handoff(chatId: string, reason: HandoffReason): Promise<void> {
    return this.delivery.handoff(chatId, reason);
  }

  private track<T>(task: Promise<T>): Promise<T> {
    this.active.add(task);
    task.finally(() => this.active.delete(task)).catch(() => undefined);
    return task;
  }

  private async restore(
    chatId: string,
    accountId: string,
    env: Pick<TurnEnvironment, 'channel' | 'clock'>,
    llm: LlmClient,
  ): Promise<void> {
    await this.recovery.ready();
    const state = await this.states.find(chatId);
    if (!state) throw new Error(`Чат ${chatId} не найден`);
    const { model } = await this.accountContext(accountId);

    const turnId = await this.turns.start({
      chatId,
      accountId,
      trigger: 'restore',
      idempotencyKey: `restore:${chatId}`,
      input: {},
    });
    if (!turnId) return;
    try {
      const [memory, history] = await Promise.all([
        this.memories.load(state),
        env.channel.history(chatId, HISTORY_LIMIT),
      ]);
      const messages = history
        .filter((message) => message.direction === 'in')
        .map((message) => ({
          id: message.id,
          text: message.text,
          mediaKind: message.mediaKind,
          sentAt: message.sentAt,
        }));
      if (messages.length === 0) {
        await this.turns.update(turnId, { status: 'done', finished: true });
        return;
      }
      const prompt = buildAnalyzerPrompt({
        memory,
        history: formatHistory(history, memory.said, MILESTONE_TITLES),
        messages,
        historyLimit: HISTORY_LIMIT,
      });
      const analysis = await this.model.analyze(
        { llm, turnId, model, clock: env.clock, signal: this.stopping.signal },
        prompt,
        messages[messages.length - 1]?.id ?? null,
      );
      const applied = applyAnalysis(
        memory,
        analysis,
        messages.map((message) => message.text).join('\n'),
      );
      await this.memories.saveAnalysis(
        chatId,
        applied.memory.card,
        applied.memory.summary,
        applied.factsUpdate,
      );
      await this.turns.update(turnId, {
        status: 'done',
        analysis: analysis as unknown as Record<string, unknown>,
        finished: true,
      });
    } catch (error) {
      // Остановка API: ход остаётся `running`, восстановление пометит его прерванным.
      if (error instanceof TurnInterrupted) throw error;
      await this.turns.update(turnId, {
        status: 'failed',
        error: errorMessage(error),
        finished: true,
      });
      throw error;
    }
  }

  // --- конвейер хода -----------------------------------------------------------

  private async execute(
    initial: TurnRequest,
    env: TurnEnvironment,
    llm: LlmClient,
  ): Promise<TurnResult> {
    if (this.stopping.signal.aborted) return interrupted();
    try {
      await this.recovery.ready();
      // Собранные, но не закрытые ходы чата (остановка API, сбой отправки)
      // — раньше нового: новый ход должен знать, что из них уже ушло.
      const settled = await this.delivery.settle(
        initial.chatId,
        env,
        this.stopping.signal,
      );
      if (!settled.clear) {
        // Прошлый ход ждёт досылки с паузой — её задание и ответит.
        if (initial.job) await this.jobs.markDone(initial.job.id);
        return skipped('в чате не дослан прошлый ход — досылка уже поставлена');
      }
    } catch (error) {
      if (error instanceof TurnInterrupted) return interrupted();
      throw error;
    }

    // Аккаунт читается параллельно с состоянием чата, но его ошибка важна,
    // только если ход действительно пойдёт.
    const accountLoad = this.accountContext(initial.accountId);
    accountLoad.catch(() => undefined);
    const state = await this.states.find(initial.chatId);
    if (!state || state.mode !== 'auto') {
      return skipped('чат не в режиме агента');
    }
    // На что уже ответил ход, закрытый раньше этого (досылка, повтор), —
    // второй раз не отвечаем.
    const request: TurnRequest =
      initial.trigger === 'client'
        ? {
            ...initial,
            messages: initial.messages.filter(
              (message) => message.id > (state.lastHandledMessageId ?? 0),
            ),
          }
        : initial;
    if (request.trigger === 'client' && request.messages.length === 0) {
      if (request.job) await this.jobs.markDone(request.job.id);
      return skipped('сообщения клиента уже отвечены');
    }
    const account = await accountLoad;

    const turnId = await this.turns.start({
      chatId: request.chatId,
      accountId: request.accountId,
      trigger: request.trigger,
      idempotencyKey: idempotencyKey(request),
      input: {
        messages: request.messages.map((message) => ({
          id: message.id,
          text: message.text,
          mediaKind: message.mediaKind,
        })),
        job: request.job,
      },
    });
    if (!turnId) {
      // Задание уже выполнено (например, вторым экземпляром API) — закрываем.
      if (request.job) await this.jobs.markDone(request.job.id);
      return skipped('ход с таким ключом уже был');
    }

    let stage: Stage = 'intake';
    try {
      const context = await this.open(
        request,
        env,
        llm,
        state,
        account,
        turnId,
      );
      stage = context.stage;
      return await this.pipeline(request, env, context);
    } catch (error) {
      return this.fail(request, env, turnId, stage, error);
    }
  }

  /** Библиотека, память и история — параллельно; ключ поколения — до них. */
  private async open(
    request: TurnRequest,
    env: TurnEnvironment,
    llm: LlmClient,
    state: BotChatStateEntity,
    account: AccountContext,
    turnId: string,
  ): Promise<TurnContext> {
    const [library, memory, history] = await Promise.all([
      this.libraries.load(request.accountId, account.persona),
      this.memories.load(state),
      env.channel.history(request.chatId, HISTORY_LIMIT),
      request.trigger === 'client'
        ? this.memories.setGeneration(request.chatId, request.generationSeq)
        : undefined,
    ]);
    return {
      ...account,
      turnId,
      state,
      library,
      memory,
      history,
      historyLines: formatHistory(history, memory.said, MILESTONE_TITLES),
      stage: stageFromMilestones(
        memory.said
          .filter((entry) => entry.kind === 'milestone')
          .map((entry) => entry.key),
      ),
      now: env.clock.now(),
      llm: {
        llm,
        turnId,
        model: account.model,
        clock: env.clock,
        signal: this.stopping.signal,
      },
    };
  }

  private async pipeline(
    request: TurnRequest,
    env: TurnEnvironment,
    context: TurnContext,
  ): Promise<TurnResult> {
    const { turnId, stage } = context;

    // 1. Анализ — только в ходе клиента.
    const analyzed = await this.analyze(request, env, context);
    const memory = analyzed?.memory ?? context.memory;

    // 2. План.
    const plan = await this.plan(
      request,
      context,
      analyzed?.analysis ?? null,
      memory,
    );
    // Память сохраняем сразу после плана: факты нужны и при передаче менеджеру.
    if (analyzed) {
      await this.memories.saveAnalysis(
        request.chatId,
        memory.card,
        memory.summary,
        analyzed.factsUpdate,
      );
    }

    if (plan.handoff) {
      await this.handoff(request.chatId, plan.handoff.reason);
      if (request.job) await this.jobs.markDone(request.job.id);
      await this.turns.update(turnId, { status: 'handoff', finished: true });
      return {
        turnId,
        status: 'handoff',
        stage,
        sent: [],
        handoff: plan.handoff.reason,
      };
    }

    // Устаревшее задание закрывается без обращения к модели.
    if (plan.idle) {
      if (request.job) await this.jobs.markDone(request.job.id);
      await this.ladder.reschedule(request.chatId, env.channel);
      await this.turns.update(turnId, {
        status: 'skipped',
        error: plan.idle,
        finished: true,
      });
      return {
        turnId,
        status: 'skipped',
        stage,
        sent: [],
        handoff: null,
        error: plan.idle,
      };
    }

    // 3–5. Текст, проверка, жёсткие проверки.
    const composed = await this.compose(request, env, context, memory, plan);

    // 6. Точка фиксации: текст собран и проверен — дальше ход только
    // доставляется. Прерванный после неё (остановка API, сбой отправки)
    // досылается с того же места, а не собирается заново.
    const last = lastOutgoing(context.history);
    const delays = planDelays({
      trigger: request.trigger,
      isNewLead: last === null,
      lastOutgoingAt: last?.sentAt ?? null,
      now: context.now,
      parts: composed.parts,
      timings: context.timings,
    });
    const turn: CommittedTurn = {
      turnId,
      chatId: request.chatId,
      lastMessageId: request.messages.at(-1)?.id ?? null,
      job: request.job,
      plan,
      delivery: {
        parts: composed.parts,
        delays,
        firstPartAt: new Date(
          env.clock.now().getTime() + delays.initialMs,
        ).toISOString(),
        baselineMessageId: Math.max(
          0,
          ...context.history.map((message) => message.id),
        ),
        writerArguments: [...composed.writerArguments],
        fallback: composed.fallback,
        stage,
        markRead: request.trigger === 'client',
        sending: null,
      },
    };
    await this.delivery.commit(turn);

    // 7–8. Доставка и закрытие: реестр сказанного, счётчики, задания, журнал, лестница.
    const { result } = await this.delivery.deliver(
      turn,
      { sent: [], delays },
      env,
      this.stopping.signal,
      request.job?.retry,
    );
    return result;
  }

  /** Анализ хода клиента: карточка, факты, намерения. У хода по расписанию — null. */
  private async analyze(
    request: TurnRequest,
    env: TurnEnvironment,
    context: TurnContext,
  ): Promise<{
    analysis: Analysis;
    memory: Memory;
    factsUpdate: FactsUpdate;
  } | null> {
    if (request.trigger !== 'client') return null;
    const prompt = buildAnalyzerPrompt({
      memory: context.memory,
      history: context.historyLines,
      messages: request.messages,
    });
    const analysis = await this.model.analyze(
      context.llm,
      prompt,
      request.messages[request.messages.length - 1]?.id ?? null,
    );
    const applied = applyAnalysis(
      context.memory,
      analysis,
      request.messages.map((message) => message.text).join('\n'),
    );
    await this.turns.update(context.turnId, {
      analysis: analysis as unknown as Record<string, unknown>,
    });
    this.assertFresh(env, 'после анализа');
    return {
      analysis,
      memory: applied.memory,
      factsUpdate: applied.factsUpdate,
    };
  }

  /** План хода (core/plan.ts) по памяти после анализа; пишется в журнал. */
  private async plan(
    request: TurnRequest,
    context: TurnContext,
    analysis: Analysis | null,
    memory: Memory,
  ): Promise<Plan> {
    const { history, stage, now } = context;
    const dueJobs = await this.jobs.dueKinds(
      request.chatId,
      new Date(now.getTime() + DUE_WINDOW_MS),
    );
    const plan = buildPlan({
      trigger: request.trigger,
      job: request.job,
      messages: request.messages,
      analysis,
      memory,
      history,
      stage,
      now,
      timings: context.timings,
      state: {
        turnsWithoutNudge: context.state.turnsWithoutNudge,
        remindersSent: context.state.remindersSent,
        // По истории, а не по времени журнала: в песочнице часы виртуальные.
        turnsInStage: repliesSince(
          history,
          milestoneMessageId(memory.said, stage),
        ),
      },
      library: context.library,
      dueJobs,
    });
    await this.turns.update(context.turnId, {
      plan: plan as unknown as Record<string, unknown>,
    });
    return plan;
  }

  /**
   * Текст под план и его проверка. Переписываем только по грубым нарушениям
   * (стиль — в журнал); повторная проверка — только если первая нашла то, с
   * чем отправлять нельзя. Потом жёсткие проверки и запасная фраза.
   */
  private async compose(
    request: TurnRequest,
    env: TurnEnvironment,
    context: TurnContext,
    memory: Memory,
    plan: Plan,
  ): Promise<ComposedTurn> {
    const { library, stage, turnId } = context;
    const language = plan.constraints.language;
    const block = plan.milestone ? library.body(plan.milestone.itemId) : null;
    if (plan.milestone && !block) {
      throw new Error(
        `Тело вехи ${plan.milestone.key} (${plan.milestone.itemId}) не найдено`,
      );
    }
    const writerInput: WriterPromptInput = {
      persona: context.persona,
      stage,
      examples: library.stageExamples(stage),
      samples: [
        ...library.samples(stage, language),
        ...(plan.objection
          ? library.objectionApproaches(plan.objection.category, language)
          : []),
      ],
      about: library.about(language),
      history: context.historyLines,
      memory,
      plan,
      messages: request.messages,
      block,
    };
    const reviewerInput: Omit<ReviewerPromptInput, 'parts' | 'after'> = {
      persona: context.persona,
      about: writerInput.about,
      memory,
      plan,
      messages: request.messages,
      block,
    };

    let draft = await this.model.write(context.llm, writerInput);
    const review = await this.model.review(context.llm, {
      ...reviewerInput,
      parts: draft.parts,
      after: draft.after,
    });
    let finalReview: Review | null = null;
    const rewritten = hasHardViolations(review);
    if (rewritten) {
      draft = await this.model.write(context.llm, {
        ...writerInput,
        reviewNotes: reviewNotes(review),
      });
      if (isBlocking(review)) {
        finalReview = await this.model.review(context.llm, {
          ...reviewerInput,
          parts: draft.parts,
          after: draft.after,
          final: true,
        });
      }
    }
    await this.turns.update(turnId, {
      draft: [
        ...draft.parts,
        ...(plan.milestone ? ['[веха]'] : []),
        ...draft.after,
      ].join('\n---\n'),
      review: {
        violations: review.violations,
        rewritten,
        final: finalReview?.violations ?? null,
      },
    });
    this.assertFresh(env, 'после текста');

    const blockedByReview = finalReview !== null && isBlocking(finalReview);
    const checked = hardChecks({
      parts: blockedByReview ? [] : draft.parts,
      after: blockedByReview ? [] : draft.after,
      block,
      allowedUrls: library.allowedUrls(),
      language,
      maxParts: plan.constraints.maxParts,
    });
    let parts: FinalPart[] = checked.parts;
    // Текст ответчика не прошёл: веха (если есть) уходит сама — она полное
    // сообщение; без вехи — запасная фраза из библиотеки.
    const fallback = blockedByReview || !parts.some((part) => !part.block);
    if (checked.blocked) {
      parts = [{ text: library.fallbackPhrase(language, stage), block: false }];
    }
    await this.turns.update(turnId, {
      final: { parts, removed: checked.removed, fallback, blockedByReview },
    });
    return { parts, fallback, writerArguments: draft.meta.arguments };
  }

  /**
   * Ход не удался. Прерванный (клиент дописал) просто закрывается. Иначе
   * клиент не должен остаться без ответа молча: ход повторяется заданием с
   * паузой, а после 30 минут сбоев чат уходит менеджеру.
   */
  private async fail(
    request: TurnRequest,
    env: TurnEnvironment,
    turnId: string,
    stage: Stage,
    error: unknown,
  ): Promise<TurnResult> {
    // Остановка API — не сбой: журнал и задание остаются как есть, после
    // старта ход повторит или дошлёт восстановление.
    if (error instanceof TurnInterrupted) return interrupted(turnId, stage);
    if (error instanceof TurnAbort) {
      await this.turns.update(turnId, {
        status: error.status,
        error: error.message,
        finished: true,
      });
      return {
        turnId,
        status: error.status,
        stage,
        sent: [],
        handoff: null,
        error: error.message,
      };
    }
    const message = errorMessage(error);
    this.logger.error(
      `Ход ${turnId} в чате ${request.chatId} не удался: ${message}`,
    );
    await this.turns.update(turnId, {
      status: 'failed',
      error: message,
      finished: true,
    });
    if (request.job) await this.jobs.markFailed(request.job.id, message);
    const handoff = await this.retryOrHandoff(request, env.clock).catch(
      (retryError: unknown) => {
        this.logger.error(
          `Не удалось поставить повтор в чате ${request.chatId}: ${errorMessage(retryError)}`,
        );
        return null;
      },
    );
    return {
      turnId,
      status: 'failed',
      stage,
      sent: [],
      handoff,
      error: message,
    };
  }

  /** Повтор упавшего хода заданием или, когда окно повторов вышло, передача менеджеру. */
  private async retryOrHandoff(
    request: TurnRequest,
    clock: Clock,
  ): Promise<HandoffReason | null> {
    const next = nextRetry(request.job?.retry, clock.now());
    if (!next) {
      await this.handoff(request.chatId, 'agent_unavailable');
      return 'agent_unavailable';
    }
    // Ответ клиенту повторяется заданием `reply`: оно заново соберёт неотвеченные сообщения.
    const kind: JobKind =
      request.trigger === 'client' ? 'reply' : (request.job?.kind ?? 'reply');
    await this.jobs.createMany(request.chatId, [
      { kind, runAt: next.runAt, payload: { retry: next.retry } },
    ]);
    return null;
  }

  /** Аккаунт хода, образ, тайминги и модель (своя у аккаунта или по умолчанию). */
  private async accountContext(accountId: string): Promise<AccountContext> {
    const account = await this.accounts.findById(accountId);
    if (!account) throw new Error(`Аккаунт ${accountId} не найден`);
    const settings = await this.settings.ensure(account.id);
    return {
      account,
      persona: readPersona(settings.persona, account.displayName),
      timings: readTimings(settings.timings),
      model: settings.model || this.config.defaultModel,
    };
  }

  private assertFresh(env: TurnEnvironment, where: string): void {
    if (env.isStale()) {
      throw new TurnAbort(
        'skipped',
        `клиент дописал ${where}, ход пересобирается`,
      );
    }
  }
}

/** Ключ идемпотентности: `chat:поколение` для хода клиента, `job:<id>` для задания. */
function idempotencyKey(request: TurnRequest): string {
  return request.trigger === 'client'
    ? `${request.chatId}:${request.generationSeq}`
    : `job:${request.job?.id ?? request.chatId}`;
}

/** Ход остановлен выключением API; его подхватит восстановление после старта. */
function interrupted(turnId = '', stage: Stage = 'intake'): TurnResult {
  return {
    turnId,
    status: 'interrupted',
    stage,
    sent: [],
    handoff: null,
    error: 'ход прерван остановкой API',
  };
}

/** Ход, который не начинался: журнала нет, этап не считали. */
function skipped(error: string): TurnResult {
  return {
    turnId: '',
    status: 'skipped',
    stage: 'intake',
    sent: [],
    handoff: null,
    error,
  };
}
