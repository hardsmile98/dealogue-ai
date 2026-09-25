import { Injectable, Logger } from '@nestjs/common';
import { TelegramAccountsRepository } from '../../telegram/repositories/telegram-accounts.repository.js';
import { AnalysisParseError, parseAnalysis } from '../core/analysis.js';
import type { Channel, Clock } from '../core/channel.js';
import { deliver, planDelays } from '../core/delivery.js';
import { hardChecks } from '../core/hard-checks.js';
import { HISTORY_LIMIT, formatHistory, lastOutgoing, milestoneMessageId, repliesSince } from '../core/history.js';
import { applyAnalysis } from '../core/memory.js';
import type { FactsUpdate } from '../core/memory.js';
import { buildPlan } from '../core/plan.js';
import type {
  Analysis,
  Draft,
  FinalPart,
  JobKind,
  Plan,
  Review,
  SaidEntry,
  SentPart,
  TurnRequest,
  TurnResult,
} from '../core/types.js';
import { WriterParseError, parseWriterOutput } from '../core/writer-output.js';
import type { BotChatStateEntity } from '../entities/bot-chat-state.entity.js';
import { stageFromMilestones } from '../library/kinds.js';
import type { ChatLabel, HandoffReason, Stage } from '../library/kinds.js';
import { readPersona } from '../library/persona.js';
import { readTimings } from '../library/timings.js';
import { BotLlmConfig } from '../llm/bot-llm.config.js';
import { DeepSeekClient } from '../llm/deepseek.client.js';
import { LlmError } from '../llm/llm.types.js';
import type { LlmClient, LlmMessage } from '../llm/llm.types.js';
import { buildAnalyzerPrompt } from '../prompts/analyzer.prompt.js';
import { buildReviewerPrompt, hasHardViolations, isBlocking, parseReview, reviewNotes } from '../prompts/reviewer.prompt.js';
import { buildWriterPrompt } from '../prompts/writer.prompt.js';
import { BotChatStateRepository } from '../repositories/bot-chat-state.repository.js';
import { BotJobsRepository } from '../repositories/bot-jobs.repository.js';
import { BotMemoryRepository } from '../repositories/bot-memory.repository.js';
import { BotTurnsRepository } from '../repositories/bot-turns.repository.js';
import { BotLadderService } from './bot-ladder.service.js';
import { BotSettingsService } from './bot-settings.service.js';
import { LibraryContextService } from './library-context.service.js';

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
 * Ход, который не удался целиком, повторяется заданием с нарастающей
 * паузой, минуты; дольше `RETRY_WINDOW_MS` — чат уходит менеджеру с ярлыком
 * «агент недоступен» (раздел 10). Для человека пауза в минуты естественна.
 */
const TURN_RETRY_DELAYS_MIN = [1, 2, 5, 10, 12];
const RETRY_WINDOW_MS = 30 * 60_000;

/** Паузы перед повторами обращения к модели при временной ошибке (сеть, 429, 5xx, таймаут). */
const LLM_RETRY_DELAYS_MS = [2_000, 5_000];

type LlmStep = 'analyzer' | 'writer' | 'reviewer';
type LlmCall = { model: string; messages: LlmMessage[]; temperature: number; json: boolean };

/** Названия вех для заглушек в истории. */
const MILESTONE_TITLES: Record<string, string> = {
  links: 'ссылки и сообщение об ожидании',
  diagnostic: 'диагностика',
  offer: 'описание практик',
  prices: 'стоимость',
};

const HANDOFF_LABELS: Record<HandoffReason, ChatLabel | null> = {
  media: 'needs_reply',
  risk: 'needs_reply',
  no_language_materials: 'needs_reply',
  reply_after_prices: 'needs_reply',
  prices_sent: 'prices_silent',
  foreign_outgoing: null,
  agent_unavailable: 'agent_unavailable',
};

class TurnAbort extends Error {
  constructor(readonly status: TurnResult['status'], message: string) {
    super(message);
    this.name = 'TurnAbort';
  }
}

/**
 * Исполнитель хода — конвейер из раздела 3 документа: анализ → план →
 * текст → проверка → жёсткие проверки → доставка → закрытие. Один ход на
 * чат одновременно (замок), ключ идемпотентности до первой отправки.
 */
@Injectable()
export class TurnRunnerService {
  private readonly logger = new Logger(TurnRunnerService.name);
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly accounts: TelegramAccountsRepository,
    private readonly settings: BotSettingsService,
    private readonly libraries: LibraryContextService,
    private readonly states: BotChatStateRepository,
    private readonly memories: BotMemoryRepository,
    private readonly turns: BotTurnsRepository,
    private readonly jobs: BotJobsRepository,
    private readonly llmConfig: BotLlmConfig,
    private readonly deepseek: DeepSeekClient,
    private readonly ladder: BotLadderService,
  ) {}

  /** Ход целиком под замком чата; ходы разных чатов идут параллельно. */
  run(request: TurnRequest, env: TurnEnvironment, llm: LlmClient = this.deepseek): Promise<TurnResult> {
    const previous = this.locks.get(request.chatId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(() => this.execute(request, env, llm));
    this.locks.set(request.chatId, current);
    current.finally(() => {
      if (this.locks.get(request.chatId) === current) this.locks.delete(request.chatId);
    }).catch(() => undefined);
    return current;
  }

  private async execute(request: TurnRequest, env: TurnEnvironment, llm: LlmClient): Promise<TurnResult> {
    const state = await this.states.find(request.chatId);
    if (!state || state.mode !== 'auto') {
      return { turnId: '', status: 'skipped', stage: 'intake', sent: [], handoff: null, error: 'чат не в режиме агента' };
    }
    const account = await this.accounts.findById(request.accountId);
    if (!account) throw new Error(`Аккаунт ${request.accountId} не найден`);
    const settings = await this.settings.ensure(account);
    const persona = readPersona(settings.persona, account.displayName);
    const timings = readTimings(settings.timings);
    const model = settings.model || this.llmConfig.defaultModel;

    const idempotencyKey = request.trigger === 'client' ? `${request.chatId}:${request.generationSeq}` : `job:${request.job?.id ?? request.chatId}`;
    const turnId = await this.turns.start({
      chatId: request.chatId,
      accountId: request.accountId,
      trigger: request.trigger,
      idempotencyKey,
      input: { messages: request.messages.map((m) => ({ id: m.id, text: m.text, mediaKind: m.mediaKind })), job: request.job },
    });
    if (!turnId) {
      // Задание уже выполнено (например, вторым экземпляром API) — закрываем.
      if (request.job) await this.jobs.markDone(request.job.id);
      return { turnId: '', status: 'skipped', stage: 'intake', sent: [], handoff: null, error: 'ход с таким ключом уже был' };
    }
    if (request.trigger === 'client') await this.memories.setGeneration(request.chatId, request.generationSeq);

    const library = await this.libraries.load(request.accountId, persona);
    let memory = await this.memories.load(state);
    const history = await env.channel.history(request.chatId, HISTORY_LIMIT);
    const now = env.clock.now();
    const stage = stageFromMilestones(memory.said.filter((entry) => entry.kind === 'milestone').map((entry) => entry.key));
    const historyLines = formatHistory(history, memory.said, MILESTONE_TITLES);

    try {
      // 1. Анализ — только в ходе клиента.
      let analysis: Analysis | null = null;
      let factsUpdate: FactsUpdate | null = null;
      if (request.trigger === 'client') {
        const sourceMessageId = request.messages[request.messages.length - 1]?.id ?? null;
        const prompt = buildAnalyzerPrompt({ memory, history: historyLines, messages: request.messages });
        analysis = await this.completeParsed(llm, turnId, 'analyzer', { model, messages: prompt, temperature: 0, json: true }, env.clock, (raw) =>
          parseAnalysis(raw, sourceMessageId),
        );
        const newText = request.messages.map((message) => message.text).join('\n');
        const applied = applyAnalysis(memory, analysis, newText);
        memory = applied.memory;
        factsUpdate = applied.factsUpdate;
        await this.turns.update(turnId, { analysis: analysis as unknown as Record<string, unknown> });
        this.assertFresh(env, 'после анализа');
      }

      // 2. План.
      const dueJobs = await this.jobs.dueKinds(request.chatId, new Date(now.getTime() + DUE_WINDOW_MS));
      const plan = buildPlan({
        trigger: request.trigger,
        job: request.job,
        messages: request.messages,
        analysis,
        memory,
        history,
        stage,
        now,
        timings,
        state: {
          turnsWithoutNudge: state.turnsWithoutNudge,
          remindersSent: state.remindersSent,
          // По истории, а не по времени журнала: в песочнице часы виртуальные.
          turnsInStage: repliesSince(history, milestoneMessageId(memory.said, stage)),
        },
        library,
        dueJobs,
      });
      await this.turns.update(turnId, { plan: plan as unknown as Record<string, unknown> });

      // Память сохраняем сразу после плана: факты нужны и при передаче менеджеру.
      if (analysis && factsUpdate) await this.memories.saveAnalysis(request.chatId, memory.card, memory.summary, factsUpdate);

      if (plan.handoff) {
        await this.handoff(request.chatId, plan.handoff.reason);
        if (request.job) await this.jobs.markDone(request.job.id);
        await this.turns.update(turnId, { status: 'handoff', finished: true });
        return { turnId, status: 'handoff', stage, sent: [], handoff: plan.handoff.reason };
      }

      // Устаревшее задание закрывается без обращения к модели.
      if (plan.idle) {
        if (request.job) await this.jobs.markDone(request.job.id);
        await this.ladder.reschedule(request.chatId, env.channel);
        await this.turns.update(turnId, { status: 'skipped', error: plan.idle, finished: true });
        return { turnId, status: 'skipped', stage, sent: [], handoff: null, error: plan.idle };
      }

      // 3–4. Текст и проверка.
      const language = plan.constraints.language;
      const block = plan.milestone ? library.body(plan.milestone.itemId) : null;
      if (plan.milestone && !block) throw new Error(`Тело вехи ${plan.milestone.key} (${plan.milestone.itemId}) не найдено`);
      const writerInput = {
        persona,
        stage,
        examples: library.stageExamples(stage),
        samples: [...library.samples(stage, language), ...(plan.objection ? library.objectionApproaches(plan.objection.category, language) : [])],
        about: library.about(language),
        history: historyLines,
        memory,
        plan,
        messages: request.messages,
        block,
      };
      // Переписываем только по грубым нарушениям (стиль — в журнал); повторная
      // проверка — только если первая нашла то, с чем отправлять нельзя.
      let draft = await this.write(llm, turnId, model, writerInput, env.clock);
      const reviewerInput = { persona, about: writerInput.about, memory, plan, messages: request.messages, block };
      const review = await this.review(llm, turnId, model, { ...reviewerInput, parts: draft.parts, after: draft.after }, env.clock);
      let finalReview: Review | null = null;
      const rewritten = hasHardViolations(review);
      if (rewritten) {
        draft = await this.write(llm, turnId, model, { ...writerInput, reviewNotes: reviewNotes(review) }, env.clock);
        if (isBlocking(review)) {
          finalReview = await this.review(llm, turnId, model, { ...reviewerInput, parts: draft.parts, after: draft.after, final: true }, env.clock);
        }
      }
      await this.turns.update(turnId, {
        draft: [...draft.parts, ...(plan.milestone ? ['[веха]'] : []), ...draft.after].join('\n---\n'),
        review: { violations: review.violations, rewritten, final: finalReview?.violations ?? null },
      });
      this.assertFresh(env, 'после текста');

      // 5. Жёсткие проверки и запасная фраза.
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
      if (checked.blocked) parts = [{ text: library.fallbackPhrase(language, stage), block: false }];
      await this.turns.update(turnId, {
        final: { parts, removed: checked.removed, fallback, blockedByReview },
      });

      // 6. Доставка.
      const last = lastOutgoing(history);
      const delays = planDelays({
        trigger: request.trigger,
        isNewLead: last === null,
        lastOutgoingAt: last?.sentAt ?? null,
        now,
        parts,
        timings,
      });
      const { sent, aborted } = await deliver(
        { chatId: request.chatId, parts, delays, markRead: request.trigger === 'client', isStale: env.isStale },
        env.channel,
        env.clock,
      );

      // 7. Закрытие: реестр сказанного, счётчики, задания, журнал.
      // Запасная фраза шаг воронки не делает — подталкивание не считается сказанным.
      const said = fallback
        ? this.saidEntries({ ...plan, nudge: null, objection: null }, { ...draft, meta: { ...draft.meta, arguments: [] } }, parts, sent)
        : this.saidEntries(plan, draft, parts, sent);
      await this.memories.addSaid(request.chatId, said, env.clock.now());
      // Шаг воронки сделан, если ушло подталкивание или веха; запасная фраза шагом не считается.
      const milestoneDelivered = said.some((entry) => entry.kind === 'milestone');
      await this.memories.closeTurn(request.chatId, {
        nudged: milestoneDelivered || (plan.nudge !== null && plan.nudge !== 'skip' && !aborted && !fallback),
        reminders: aborted ? 0 : plan.reminders,
        lastHandledMessageId: request.messages[request.messages.length - 1]?.id ?? null,
      });
      if (request.job) await this.jobs.markDone(request.job.id);
      const finalStage: Stage = milestoneDelivered && plan.milestone ? plan.milestone.key : stage;
      if (finalStage === 'prices') await this.handoff(request.chatId, 'prices_sent');
      // Лестница — заново от нового состояния: ответ клиента снимает дальние
      // ступени, новая веха или подталкивание ставит следующую.
      await this.ladder.reschedule(request.chatId, env.channel);

      const status: TurnResult['status'] = aborted && sent.length === 0 ? 'skipped' : 'sent';
      await this.turns.update(turnId, { status, sent: { parts: sent, aborted }, finished: true });
      return { turnId, status, stage: finalStage, sent, handoff: finalStage === 'prices' ? 'prices_sent' : null };
    } catch (error) {
      if (error instanceof TurnAbort) {
        await this.turns.update(turnId, { status: error.status, error: error.message, finished: true });
        return { turnId, status: error.status, stage, sent: [], handoff: null, error: error.message };
      }
      // Клиент не должен остаться без ответа молча: ход повторяется
      // заданием с паузой, а после 30 минут сбоев чат уходит менеджеру.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Ход ${turnId} в чате ${request.chatId} не удался: ${message}`);
      await this.turns.update(turnId, { status: 'failed', error: message, finished: true });
      if (request.job) await this.jobs.markFailed(request.job.id, message);
      const handoff = await this.retryOrHandoff(request, env.clock).catch((retryError: unknown) => {
        this.logger.error(`Не удалось поставить повтор в чате ${request.chatId}: ${String(retryError)}`);
        return null;
      });
      return { turnId, status: 'failed', stage, sent: [], handoff, error: message };
    }
  }

  /**
   * Память по уже идущей переписке — для чата, скопированного в песочницу:
   * анализатор читает историю целиком и заполняет карточку, факты и резюме.
   * Ничего не отправляет; в журнале — ход `restore`.
   */
  async restoreMemory(chatId: string, accountId: string, env: Pick<TurnEnvironment, 'channel' | 'clock'>, llm: LlmClient = this.deepseek): Promise<void> {
    const state = await this.states.find(chatId);
    if (!state) throw new Error(`Чат ${chatId} не найден`);
    const account = await this.accounts.findById(accountId);
    if (!account) throw new Error(`Аккаунт ${accountId} не найден`);
    const settings = await this.settings.ensure(account);
    const model = settings.model || this.llmConfig.defaultModel;

    const turnId = await this.turns.start({
      chatId,
      accountId,
      trigger: 'restore',
      idempotencyKey: `restore:${chatId}`,
      input: {},
    });
    if (!turnId) return;
    try {
      const memory = await this.memories.load(state);
      const history = await env.channel.history(chatId, HISTORY_LIMIT);
      const messages = history
        .filter((message) => message.direction === 'in')
        .map((message) => ({ id: message.id, text: message.text, mediaKind: message.mediaKind, sentAt: message.sentAt }));
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
      const sourceMessageId = messages[messages.length - 1]?.id ?? null;
      const analysis = await this.completeParsed(llm, turnId, 'analyzer', { model, messages: prompt, temperature: 0, json: true }, env.clock, (raw) =>
        parseAnalysis(raw, sourceMessageId),
      );
      const applied = applyAnalysis(memory, analysis, messages.map((message) => message.text).join('\n'));
      await this.memories.saveAnalysis(chatId, applied.memory.card, applied.memory.summary, applied.factsUpdate);
      await this.turns.update(turnId, { status: 'done', analysis: analysis as unknown as Record<string, unknown>, finished: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.turns.update(turnId, { status: 'failed', error: message, finished: true });
      throw error;
    }
  }

  /** Повтор упавшего хода заданием или, когда окно повторов вышло, передача менеджеру. */
  private async retryOrHandoff(request: TurnRequest, clock: Clock): Promise<HandoffReason | null> {
    const now = clock.now();
    const retry = request.job?.retry;
    const firstFailedAt = retry ? new Date(retry.firstFailedAt) : now;
    const attempt = (retry?.attempt ?? 0) + 1;
    const delayMin = TURN_RETRY_DELAYS_MIN[attempt - 1];
    if (delayMin === undefined || now.getTime() + delayMin * 60_000 - firstFailedAt.getTime() > RETRY_WINDOW_MS) {
      await this.handoff(request.chatId, 'agent_unavailable');
      return 'agent_unavailable';
    }
    // Ответ клиенту повторяется заданием `reply`: оно заново соберёт неотвеченные сообщения.
    const kind: JobKind = request.trigger === 'client' ? 'reply' : (request.job?.kind ?? 'reply');
    await this.jobs.createMany(request.chatId, [
      {
        kind,
        runAt: new Date(now.getTime() + delayMin * 60_000),
        payload: { retry: { firstFailedAt: firstFailedAt.toISOString(), attempt } },
      },
    ]);
    return null;
  }

  private assertFresh(env: TurnEnvironment, where: string): void {
    if (env.isStale()) throw new TurnAbort('skipped', `клиент дописал ${where}, ход пересобирается`);
  }

  private write(llm: LlmClient, turnId: string, model: string, input: Parameters<typeof buildWriterPrompt>[0], clock: Clock): Promise<Draft> {
    return this.completeParsed(llm, turnId, 'writer', { model, messages: buildWriterPrompt(input), temperature: 0.7, json: true }, clock, parseWriterOutput);
  }

  private async review(llm: LlmClient, turnId: string, model: string, input: Parameters<typeof buildReviewerPrompt>[0], clock: Clock): Promise<Review> {
    if (input.parts.length + input.after.length === 0 && !input.plan.milestone) {
      return { violations: [{ code: 'unanswered_point', severity: 'hard', detail: 'ответчик не вернул текст' }] };
    }
    const raw = await this.complete(llm, turnId, 'reviewer', { model, messages: buildReviewerPrompt(input), temperature: 0, json: true }, clock);
    return parseReview(raw);
  }

  /** Обращение с разбором ответа: ответ, который не разобрался, запрашивается ещё раз (один раз). */
  private async completeParsed<T>(llm: LlmClient, turnId: string, step: LlmStep, request: LlmCall, clock: Clock, parse: (raw: string) => T): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      const raw = await this.complete(llm, turnId, step, request, clock);
      try {
        return parse(raw);
      } catch (error) {
        const malformed = error instanceof AnalysisParseError || error instanceof WriterParseError;
        if (!malformed || attempt >= 2) throw error;
        this.logger.warn(`Ход ${turnId}: ${step} вернул неразборчивый ответ, повтор`);
      }
    }
  }

  /** Обращение к модели со снимком в журнал и повторами с паузой при временной ошибке. */
  private async complete(llm: LlmClient, turnId: string, step: LlmStep, request: LlmCall, clock: Clock): Promise<string> {
    const snapshot = request.messages.map((message) => `### ${message.role}\n${message.content}`).join('\n\n');
    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await llm.complete(request);
        await this.turns.addSnapshot(turnId, step, snapshot, response.text);
        return response.text;
      } catch (error) {
        const retryable = error instanceof LlmError ? error.retryable : true;
        const delay = LLM_RETRY_DELAYS_MS[attempt];
        if (!retryable || delay === undefined) {
          await this.turns.addSnapshot(turnId, step, snapshot, `ОШИБКА: ${error instanceof Error ? error.message : String(error)}`);
          throw error;
        }
        await clock.sleep(delay);
      }
    }
  }

  private saidEntries(plan: Plan, draft: Draft, parts: readonly FinalPart[], sent: readonly SentPart[]): Omit<SaidEntry, 'at'>[] {
    const entries: Omit<SaidEntry, 'at'>[] = [];
    if (sent.length === 0) return entries;
    const blockIndex = parts.findIndex((part) => part.block);
    if (plan.milestone && blockIndex >= 0 && sent[blockIndex]) {
      entries.push({ kind: 'milestone', key: plan.milestone.key, messageId: (sent[blockIndex] as SentPart).messageId });
      if (plan.milestone.key === 'links') entries.push({ kind: 'link', key: 'pages', messageId: (sent[blockIndex] as SentPart).messageId });
    }
    const lastText = sent[sent.length - 1] as SentPart;
    if (plan.nudge && plan.nudge !== 'skip') entries.push({ kind: 'nudge', key: plan.nudge, messageId: lastText.messageId });
    if (plan.objection) entries.push({ kind: 'argument', key: `${plan.objection.category}:${plan.objection.approach}`, messageId: lastText.messageId });
    for (const argument of draft.meta.arguments) {
      if (!entries.some((entry) => entry.kind === 'argument' && entry.key === argument)) {
        entries.push({ kind: 'argument', key: argument.slice(0, 64), messageId: lastText.messageId });
      }
    }
    return entries;
  }

  /** Передача менеджеру: режим, причина, ярлык, снятие заданий. Нужна и каналу (чужое исходящее). */
  async handoff(chatId: string, reason: HandoffReason): Promise<void> {
    await this.memories.setHandoff(chatId, reason, HANDOFF_LABELS[reason]);
    await this.jobs.cancelPending(chatId);
  }

  /** Состояние чата — для внешних вызывающих (сборщик, песочница). */
  state(chatId: string): Promise<BotChatStateEntity | null> {
    return this.states.find(chatId);
  }
}
