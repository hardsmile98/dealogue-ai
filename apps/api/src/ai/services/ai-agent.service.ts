import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { TelegramAccountEntity } from '../../telegram/entities/telegram-account.entity.js';
import { TelegramChatEntity } from '../../telegram/entities/telegram-chat.entity.js';
import { TelegramMessageEntity } from '../../telegram/entities/telegram-message.entity.js';
import { describeError, isAuthLost, isFloodWait } from '../../telegram/lib/telegram-errors.js';
import { TelegramEventsService } from '../../telegram/services/telegram-events.service.js';
import type { TelegramLiveEvent, TelegramMessageEvent } from '../../telegram/services/telegram-events.service.js';
import { TelegramIngestService } from '../../telegram/services/telegram-ingest.service.js';
import { TelegramOutboundService } from '../../telegram/services/telegram-outbound.service.js';
import { TelegramConfig } from '../../telegram/telegram.config.js';
import { AiConfig } from '../ai.config.js';
import type { AiAgentSettingsEntity } from '../entities/ai-agent-settings.entity.js';
import { AiRunEntity } from '../entities/ai-run.entity.js';
import type { AiRunStatus, AiRunTrigger } from '../entities/ai-run.entity.js';
import { ExchangeRetrieverService } from '../learning/exchange-retriever.service.js';
import type { RetrievedExchange } from '../learning/exchange-retriever.service.js';
import type { StyleProfile } from '../learning/style-profile.schema.js';
import { guardDecision } from '../lib/decision-guard.js';
import type { GuardResult } from '../lib/decision-guard.js';
import { planDelay } from '../lib/humanize.js';
import { LruSet } from '../lib/lru-set.js';
import { isWithinWindow, nextWindowStart, windowFromActiveHours, windowFromWorkingHours } from '../lib/working-hours.js';
import type { ActiveWindow } from '../lib/working-hours.js';
import { LlmProviderFactory } from '../llm/llm-provider.factory.js';
import { LlmError, isLlmError } from '../llm/llm-provider.interface.js';
import type { LlmCompletionResult, LlmProvider } from '../llm/llm-provider.interface.js';
import { DECISION_JSON_SCHEMA, DecisionSchema } from '../prompt/decision.schema.js';
import type { Decision } from '../prompt/decision.schema.js';
import { buildPrompt, lastClientBlock } from '../prompt/prompt-builder.js';
import type { BuiltPrompt, FollowupContext } from '../prompt/prompt-builder.js';
import type { SalesScript } from '../prompt/sales-script.schema.js';
import { SalesScriptSchema } from '../prompt/sales-script.schema.js';
import { AiJobWorker } from './ai-job-worker.service.js';
import type { JobContext, JobOutcome } from './ai-job-worker.service.js';
import { AiJobsService } from './ai-jobs.service.js';
import { AiSettingsService } from './ai-settings.service.js';
import { AlertsService } from './alerts.service.js';
import { HandoffService } from './handoff.service.js';

const OFFLINE_RETRY_MS = 5 * 60_000;
const MISCONFIGURED_RETRY_MS = 15 * 60_000;
const ECHO_GRACE_MS = 2_000;
const TYPING_REFRESH_MS = 4_000;
const HEARTBEAT_MS = 30_000;
const CHAR_BUDGET = 12_000;
const RECENT_OUTGOING = 5;

export interface GenerationResult {
  decision: Decision;
  guard: GuardResult;
  prompt: BuiltPrompt;
  exchanges: RetrievedExchange[];
  raw: LlmCompletionResult;
  latencyMs: number;
  provider: string;
  model: string;
}

export interface TestGenerateResult extends GenerationResult {
  runId: string;
  /** Что на самом деле ответил менеджер после последнего сообщения клиента (если чат старый). */
  actualManagerReply: string | null;
}

/**
 * Оркестратор ИИ-агента: слушает события Telegram, ставит задания в очередь,
 * выполняет их (ответы и дожимы), детектит ручные ответы менеджера.
 */
@Injectable()
export class AiAgentService implements OnModuleInit {
  private readonly logger = new Logger(AiAgentService.name);
  /** Сообщения, которые отправили мы, — чтобы не принять своё echo за ручной ответ. */
  private readonly sentByAi = new LruSet(5000);

  constructor(
    private readonly config: AiConfig,
    private readonly telegramConfig: TelegramConfig,
    private readonly events: TelegramEventsService,
    private readonly worker: AiJobWorker,
    private readonly jobs: AiJobsService,
    private readonly settings: AiSettingsService,
    private readonly providers: LlmProviderFactory,
    private readonly retriever: ExchangeRetrieverService,
    private readonly outbound: TelegramOutboundService,
    private readonly ingest: TelegramIngestService,
    private readonly handoff: HandoffService,
    private readonly alerts: AlertsService,
    private readonly realtime: RealtimeService,
    private readonly dataSource: DataSource,
    @InjectRepository(TelegramChatEntity)
    private readonly chats: Repository<TelegramChatEntity>,
    @InjectRepository(TelegramMessageEntity)
    private readonly messages: Repository<TelegramMessageEntity>,
    @InjectRepository(AiRunEntity)
    private readonly runs: Repository<AiRunEntity>,
    @InjectRepository(TelegramAccountEntity)
    private readonly accounts: Repository<TelegramAccountEntity>,
  ) {}

  onModuleInit(): void {
    this.events.events.subscribe((event) => {
      // Ошибка здесь не должна дойти до приёма сообщений.
      this.onEvent(event).catch((error) => this.logger.error(`Событие ${event.kind}: ${describeError(error)}`));
    });
    this.worker.register('reply', (ctx) => this.runForChat(ctx, 'inbound'));
    this.worker.register('followup', (ctx) => this.runForChat(ctx, 'followup'));
  }

  // --- события Telegram -----------------------------------------------------

  private async onEvent(event: TelegramLiveEvent): Promise<void> {
    if (!this.config.enabled) return;
    if (event.kind === 'account-live') {
      await this.jobs.wakeAccount(event.accountId);
      this.worker.kick();
      return;
    }
    if (event.kind !== 'message') return;
    if (event.direction === 'in') await this.onInbound(event);
    else await this.onOutbound(event);
  }

  private async onInbound(event: TelegramMessageEvent): Promise<void> {
    const settings = await this.settings.getOrCreate(event.accountId);
    if (!settings.enabled) return;
    const chat = await this.chats.findOne({ where: { id: event.chat.id } });
    if (!chat?.aiEnabled) return;

    // Клиент ответил — серия дожимов начинается заново после нашего ответа.
    await this.chats.update(chat.id, { aiSilenceSince: null, aiFollowupStep: 0, aiFollowupNextAt: null });
    await this.jobs.cancel('followup', chat.accountId, chat.id);
    if (chat.aiPausedReason) return;

    const jitter = Math.random() * 5_000;
    const runAt = new Date(Date.now() + settings.debounceSec * 1000 + jitter);
    await this.jobs.enqueue({
      type: 'reply',
      accountId: chat.accountId,
      chatId: chat.id,
      runAt,
      payload: { triggerMessageId: event.message.id },
    });
  }

  /** Исходящее, которое отправили не мы, — менеджер ответил вручную: ИИ в чате выключаем. */
  private async onOutbound(event: TelegramMessageEvent): Promise<void> {
    await sleep(ECHO_GRACE_MS);
    if (this.sentByAi.has(`${event.chat.id}:${event.message.id}`)) return;
    const stored = await this.messages.findOne({
      where: { chatId: event.chat.id, telegramMessageId: event.message.id },
      select: { id: true, aiRunId: true },
    });
    if (stored?.aiRunId) return;

    const chat = await this.chats.findOne({ where: { id: event.chat.id } });
    if (!chat?.aiEnabled) return;
    await this.chats.update(chat.id, {
      aiEnabled: false,
      aiPausedReason: 'manual_reply',
      aiPausedAt: new Date(),
      aiFollowupNextAt: null,
      aiSilenceSince: null,
    });
    await this.jobs.cancelForChat(chat.id);
    await this.realtime.publishForAccount(chat.accountId, { type: 'chat.updated', accountId: chat.accountId, chatId: chat.id });
    this.logger.log(`Чат ${chat.id}: менеджер ответил вручную — ИИ выключен`);
  }

  // --- управление из UI ------------------------------------------------------

  async setChatAi(chat: TelegramChatEntity, enabled: boolean, userId: string): Promise<TelegramChatEntity> {
    if (enabled) {
      await this.chats.update(chat.id, {
        aiEnabled: true,
        aiPausedReason: null,
        aiPausedAt: null,
        aiMessagesCount: 0,
        aiSilenceSince: null,
        aiFollowupStep: 0,
        aiFollowupNextAt: null,
      });
      await this.alerts.resolveForChat(chat.id, userId);
      // Клиент уже ждёт ответа — отвечаем без долгого ожидания.
      const settings = await this.settings.getOrCreate(chat.accountId);
      if (settings.enabled && chat.lastMessageDirection === 'in') {
        await this.jobs.enqueue({
          type: 'reply',
          accountId: chat.accountId,
          chatId: chat.id,
          runAt: new Date(Date.now() + Math.min(settings.debounceSec, 10) * 1000),
        });
        this.worker.kick();
      }
    } else {
      await this.chats.update(chat.id, {
        aiEnabled: false,
        aiPausedReason: null,
        aiPausedAt: null,
        aiFollowupNextAt: null,
        aiSilenceSince: null,
      });
      await this.jobs.cancelForChat(chat.id);
    }
    await this.realtime.publishForAccount(chat.accountId, { type: 'chat.updated', accountId: chat.accountId, chatId: chat.id });
    return this.chats.findOneOrFail({ where: { id: chat.id } });
  }

  async stopFollowups(chat: TelegramChatEntity): Promise<TelegramChatEntity> {
    await this.jobs.cancel('followup', chat.accountId, chat.id);
    await this.chats.update(chat.id, { aiFollowupNextAt: null, aiSilenceSince: null });
    await this.realtime.publishForAccount(chat.accountId, { type: 'chat.updated', accountId: chat.accountId, chatId: chat.id });
    return this.chats.findOneOrFail({ where: { id: chat.id } });
  }

  /** Песочница: сгенерировать решение для чата, ничего не отправляя. */
  async testGenerate(
    chat: TelegramChatEntity,
    options: { scriptOverride?: unknown; followupStep?: number },
  ): Promise<TestGenerateResult> {
    const settings = await this.settings.getOrCreate(chat.accountId);
    let script = this.settings.effectiveScript(settings);
    if (options.scriptOverride !== undefined) {
      const parsed = SalesScriptSchema.safeParse(options.scriptOverride);
      if (parsed.success) script = parsed.data.stages.length > 0 ? parsed.data : { ...parsed.data, stages: script.stages };
    }
    const history = await this.loadHistory(chat.id, settings.contextMessages);
    if (history.length === 0) throw new ServiceUnavailableException('В чате нет сообщений для генерации');

    // Для песочницы на старом чате отвечаем на последний блок клиента, обрезая историю до него.
    let lastClientIndex = -1;
    for (let i = history.length - 1; i >= 0; i -= 1) {
      if (history[i].direction === 'in') {
        lastClientIndex = i;
        break;
      }
    }
    const trigger: AiRunTrigger = options.followupStep !== undefined ? 'followup' : 'inbound';
    let effectiveHistory = history;
    let actualManagerReply: string | null = null;
    if (trigger === 'inbound' && lastClientIndex >= 0 && lastClientIndex < history.length - 1) {
      actualManagerReply = history
        .slice(lastClientIndex + 1)
        .filter((m) => m.direction === 'out')
        .map((m) => m.text)
        .join('\n');
      effectiveHistory = history.slice(0, lastClientIndex + 1);
    }

    const followup = trigger === 'followup' ? this.followupContext(settings, options.followupStep ?? 0, chat) : undefined;
    const generation = await this.generate({ chat, settings, script, history: effectiveHistory, trigger: 'test', followup });
    const run = await this.runs.save(
      this.runs.create({
        accountId: chat.accountId,
        chatId: chat.id,
        trigger: 'test',
        followupStep: options.followupStep ?? null,
        provider: generation.provider,
        model: generation.model,
        promptHash: generation.prompt.systemHash,
        promptSnapshot: { system: generation.prompt.system, messages: generation.prompt.messages },
        rawResponse: generation.raw.text,
        decision: { ...generation.decision, guard: generation.guard },
        status: 'draft',
        inputTokens: generation.raw.usage.inputTokens,
        outputTokens: generation.raw.usage.outputTokens,
        cacheHitTokens: generation.raw.usage.cacheHitTokens,
        latencyMs: generation.latencyMs,
      }),
    );
    return { ...generation, runId: run.id, actualManagerReply };
  }

  // --- выполнение job'ов -----------------------------------------------------

  private async runForChat(ctx: JobContext, trigger: 'inbound' | 'followup'): Promise<JobOutcome> {
    const { job } = ctx;
    if (!job.chatId) return { kind: 'done' };
    const chat = await this.chats.findOne({ where: { id: job.chatId } });
    if (!chat) return { kind: 'done' };
    const settings = await this.settings.getOrCreate(chat.accountId);

    if (!this.config.enabled || !settings.enabled || !chat.aiEnabled || chat.aiPausedReason) return { kind: 'done' };
    if (!this.outbound.isOnline(chat.accountId)) {
      return { kind: 'postpone', runAt: new Date(Date.now() + OFFLINE_RETRY_MS), reason: 'аккаунт не подключён', payload: { offline: true } };
    }

    let resolved: ReturnType<LlmProviderFactory['resolve']>;
    try {
      resolved = this.providers.resolve(settings.provider);
    } catch (error) {
      await this.handoff.raiseAiError(chat.accountId, chat.id, error instanceof Error ? error.message : String(error));
      return { kind: 'postpone', runAt: new Date(Date.now() + MISCONFIGURED_RETRY_MS), reason: 'провайдер не настроен' };
    }
    if (!resolved.breaker.allow()) {
      const wait = resolved.breaker.retryAfterMs + Math.random() * 30_000;
      return { kind: 'postpone', runAt: new Date(Date.now() + wait), reason: 'предохранитель провайдера открыт' };
    }

    const profile = await this.profileFor(settings);
    const window = this.activeWindow(settings, profile);
    const now = new Date();
    if (window && !isWithinWindow(now, window)) {
      const start = nextWindowStart(now, window);
      const jitter = Math.random() * 20 * 60_000;
      return { kind: 'postpone', runAt: new Date(start.getTime() + jitter), reason: 'вне рабочего окна' };
    }

    // Лимиты.
    if (chat.aiMessagesCount >= settings.maxAiMessagesPerChat) {
      await this.handoff.pause(chat, 'limit');
      await this.alerts.create({
        accountId: chat.accountId,
        chatId: chat.id,
        type: 'needs_human',
        payload: { reason: `Достигнут лимит ${settings.maxAiMessagesPerChat} сообщений ИИ в чате` },
      });
      await this.alerts.refreshAttention(chat.id);
      return { kind: 'done' };
    }
    const daily = await this.countSentToday(chat.accountId);
    if (daily >= settings.maxAiMessagesPerDay) {
      const tomorrow = new Date(now.getTime() + 3600_000 * (1 + Math.random()));
      return { kind: 'postpone', runAt: tomorrow, reason: `дневной лимит ${settings.maxAiMessagesPerDay} исчерпан` };
    }
    if (trigger === 'followup') {
      if (!settings.followupsEnabled) return { kind: 'done' };
      const hourly = await this.countFollowupsLastHour(chat.accountId);
      if (hourly >= this.config.followupsPerHour) {
        return { kind: 'postpone', runAt: new Date(now.getTime() + 3600_000 + Math.random() * 600_000), reason: 'лимит дожимов в час' };
      }
    }

    // История и проверка, что job ещё актуален.
    const history = await this.loadHistory(chat.id, settings.contextMessages);
    const last = history[history.length - 1];
    if (!last) return { kind: 'done' };
    if (trigger === 'inbound' && last.direction === 'out') {
      await this.recordSkip(chat, trigger, resolved.name, settings, 'already_answered');
      return { kind: 'done' };
    }
    if (trigger === 'followup' && last.direction === 'in') {
      await this.chats.update(chat.id, { aiSilenceSince: null, aiFollowupStep: 0, aiFollowupNextAt: null });
      return { kind: 'done' };
    }

    const script = this.settings.effectiveScript(settings);
    const followup = trigger === 'followup' ? this.followupContext(settings, chat.aiFollowupStep, chat) : undefined;
    if (trigger === 'followup' && !followup) {
      await this.chats.update(chat.id, { aiFollowupNextAt: null });
      return { kind: 'done' };
    }

    // Генерация.
    let generation: GenerationResult;
    try {
      generation = await this.generate({ chat, settings, script, history, trigger, followup, resolved, profile });
      resolved.breaker.onSuccess();
    } catch (error) {
      return this.onGenerationError(chat, settings, trigger, resolved, error, ctx);
    }

    const run = await this.runs.save(
      this.runs.create({
        accountId: chat.accountId,
        chatId: chat.id,
        trigger,
        followupStep: followup ? followup.step : null,
        triggerMessageId: trigger === 'inbound' ? Number(job.payload.triggerMessageId ?? 0) || null : null,
        provider: generation.provider,
        model: generation.model,
        promptHash: generation.prompt.systemHash,
        rawResponse: generation.raw.text,
        decision: { ...generation.decision, guard: generation.guard },
        status: 'draft',
        inputTokens: generation.raw.usage.inputTokens,
        outputTokens: generation.raw.usage.outputTokens,
        cacheHitTokens: generation.raw.usage.cacheHitTokens,
        latencyMs: generation.latencyMs,
      }),
    );

    const { guard } = generation;
    const lastClientText = lastClientBlock(history);

    // Молчим или передаём человеку без отправки.
    if (guard.silent || guard.messages.length === 0) {
      const status: AiRunStatus = guard.silent ? 'silent' : 'skipped';
      await this.runs.update(run.id, { status, skipReason: guard.notes.join(',') || null });
      if (trigger === 'followup') await this.advanceFollowup(chat, settings, guard.silent ? 'silent' : 'skipped');
      await this.finishRun(chat, settings, guard, generation, run.id, lastClientText, false);
      return { kind: 'done' };
    }

    // «Человеческая» задержка с typing; job может устареть за это время.
    let sentIds: number[] | null;
    try {
      sentIds = await this.deliver(ctx, chat, settings, guard.messages, profile, trigger, run.id);
    } catch (error) {
      await this.runs.update(run.id, { status: 'error', error: describeError(error) });
      throw error;
    }
    if (sentIds === null) {
      await this.runs.update(run.id, { status: 'skipped', skipReason: 'superseded' });
      return { kind: 'done' };
    }

    await this.runs.update(run.id, { status: 'sent', sentTelegramMessageIds: sentIds });
    const fresh = await this.chats.findOneOrFail({ where: { id: chat.id } });
    await this.chats.update(chat.id, {
      aiStage: guard.stage,
      aiMessagesCount: fresh.aiMessagesCount + sentIds.length,
      aiLastReplyAt: new Date(),
      aiSilenceSince: new Date(),
      aiFollowupStep: trigger === 'followup' ? chat.aiFollowupStep + 1 : 0,
    });
    await this.scheduleFollowup({ ...fresh, aiFollowupStep: trigger === 'followup' ? chat.aiFollowupStep + 1 : 0, aiSilenceSince: new Date() }, settings);
    await this.finishRun(fresh, settings, guard, generation, run.id, lastClientText, true);
    return { kind: 'done' };
  }

  private async onGenerationError(
    chat: TelegramChatEntity,
    settings: AiAgentSettingsEntity,
    trigger: AiRunTrigger,
    resolved: ReturnType<LlmProviderFactory['resolve']>,
    error: unknown,
    ctx: JobContext,
  ): Promise<JobOutcome> {
    const message = error instanceof Error ? error.message : String(error);
    await this.runs.save(
      this.runs.create({
        accountId: chat.accountId,
        chatId: chat.id,
        trigger,
        provider: resolved.name,
        model: settings.model ?? this.config.model,
        status: 'error',
        error: message,
      }),
    );
    if (isLlmError(error)) {
      if (error.kind === 'refusal') {
        await this.handoff.evaluate({
          chat,
          settings,
          guard: { messages: [], stage: chat.aiStage, silent: false, readyToPay: false, needsHuman: true, notes: ['refusal'] },
          runId: null,
          lastClientText: '',
          confidence: 0,
          reason: 'Модель отказалась отвечать',
        });
        return { kind: 'done' };
      }
      resolved.breaker.onFailure();
      await this.handoff.raiseAiError(chat.accountId, chat.id, message);
      if (!error.retryable) {
        // Неверный ключ или наш запрос — ждём вмешательства, но не теряем job.
        return { kind: 'postpone', runAt: new Date(Date.now() + MISCONFIGURED_RETRY_MS), reason: message };
      }
      if (ctx.job.attempts >= 3) {
        await this.handoff.pause(chat, 'error');
        return { kind: 'done' };
      }
      throw error; // воркер повторит с backoff
    }
    resolved.breaker.onFailure();
    throw error;
  }

  // --- генерация ------------------------------------------------------------

  private async generate(params: {
    chat: TelegramChatEntity;
    settings: AiAgentSettingsEntity;
    script: SalesScript;
    history: TelegramMessageEntity[];
    trigger: 'inbound' | 'followup' | 'test';
    followup?: FollowupContext;
    resolved?: ReturnType<LlmProviderFactory['resolve']>;
    profile?: StyleProfile | null;
  }): Promise<GenerationResult> {
    const { chat, settings, script, history, trigger, followup } = params;
    const resolved = params.resolved ?? this.providers.resolve(settings.provider);
    const profile = params.profile === undefined ? await this.profileFor(settings) : params.profile;
    const account = await this.accounts.findOne({ where: { id: chat.accountId }, select: { id: true, displayName: true } });

    const lastClientText = lastClientBlock(history);
    const exchanges = await this.retrieve(chat, settings, lastClientText, trigger === 'followup' || followup !== undefined);

    const prompt = buildPrompt({
      managerName: account?.displayName ?? 'менеджер',
      peerName: chat.peerName,
      script,
      profile,
      exchanges,
      history,
      stage: chat.aiStage,
      trigger,
      followup,
      now: new Date(),
      tz: profile?.timing?.tz ?? this.telegramConfig.timezone,
      charBudget: CHAR_BUDGET,
      allowMultiMessage: (profile?.habits.multiMessageShare ?? 0) >= 0.3,
    });

    const started = Date.now();
    const { raw, decision } = await this.complete(resolved.provider, prompt, settings);
    const latencyMs = Date.now() - started;

    const recentOutgoing = history
      .filter((m) => m.direction === 'out')
      .slice(-RECENT_OUTGOING)
      .map((m) => m.text);
    const guard = guardDecision({
      decision,
      script,
      lastClientText,
      recentOutgoing,
      managerLenP90: profile?.habits.messageLenP90 ?? 0,
      previousStage: chat.aiStage,
      trigger,
    });

    return { decision, guard, prompt, exchanges, raw, latencyMs, provider: resolved.name, model: raw.model };
  }

  /** Вызов модели с одним повтором при невалидном JSON. */
  private async complete(
    provider: LlmProvider,
    prompt: BuiltPrompt,
    settings: AiAgentSettingsEntity,
  ): Promise<{ raw: LlmCompletionResult; decision: Decision }> {
    const request = {
      system: prompt.system,
      messages: prompt.messages,
      schemaName: 'decision',
      jsonSchema: DECISION_JSON_SCHEMA,
      maxTokens: this.config.maxOutputTokens,
      timeoutMs: this.config.requestTimeoutMs,
      model: settings.model ?? undefined,
      temperature: 1,
    };
    let raw = await provider.complete(request);
    let parsed = DecisionSchema.safeParse(raw.json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      raw = await provider.complete({
        ...request,
        messages: [
          ...prompt.messages,
          { role: 'assistant', content: raw.text.slice(0, 2000) || '{}' },
          { role: 'user', content: `Ответ не прошёл валидацию (${issue?.path.join('.') ?? ''}: ${issue?.message ?? 'invalid'}). Верни только валидный JSON по схеме.` },
        ],
      });
      parsed = DecisionSchema.safeParse(raw.json);
      if (!parsed.success) throw new LlmError('invalid_json', `Модель вернула невалидный JSON: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
    }
    return { raw, decision: parsed.data };
  }

  private async retrieve(
    chat: TelegramChatEntity,
    settings: AiAgentSettingsEntity,
    lastClientText: string,
    isFollowup: boolean,
  ): Promise<RetrievedExchange[]> {
    const n = settings.retrievalExamples;
    if (n <= 0 || !settings.useLearnedStyle) return [];
    const result: RetrievedExchange[] = [];
    if (isFollowup) result.push(...(await this.retriever.byIntent(chat.accountId, 'followup', Math.min(3, n))));
    if (lastClientText) result.push(...(await this.retriever.similar(chat.accountId, lastClientText, n - result.length, chat.id)));
    if (result.length === 0) result.push(...(await this.retriever.exemplary(chat.accountId, Math.min(3, n))));
    const seen = new Set<string>();
    return result.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true))).slice(0, n);
  }

  // --- доставка -------------------------------------------------------------

  /** Ждёт «по-человечески», показывает typing, шлёт 1–3 сообщения. null — job устарел. */
  private async deliver(
    ctx: JobContext,
    chat: TelegramChatEntity,
    settings: AiAgentSettingsEntity,
    messages: string[],
    profile: StyleProfile | null,
    trigger: 'inbound' | 'followup',
    runId: string,
  ): Promise<number[] | null> {
    const plan = planDelay(messages, profile?.timing ?? null, settings.replyDelayCapSec, trigger);
    const lastKnownId = chat.lastTelegramMessageId;

    if (settings.markRead) await this.outbound.markRead(chat.accountId, chat);
    const stillValid = await this.waitWithTyping(ctx, chat, plan.initialMs, async () => this.isSuperseded(chat, lastKnownId, trigger));
    if (!stillValid) {
      await this.outbound.setTyping(chat.accountId, chat, false);
      return null;
    }

    const sentIds: number[] = [];
    for (const [i, text] of messages.entries()) {
      if (i > 0) {
        const ok = await this.waitWithTyping(ctx, chat, plan.betweenMs[i - 1] ?? 3000, async () => this.isSuperseded(chat, lastKnownId, trigger));
        if (!ok) break;
      }
      let sent;
      try {
        sent = await this.outbound.sendText(chat.accountId, chat, text);
      } catch (error) {
        if (isFloodWait(error) || isAuthLost(error)) throw error;
        this.logger.warn(`Чат ${chat.id}: отправка не удалась — ${describeError(error)}`);
        throw error;
      }
      this.sentByAi.add(`${chat.id}:${sent.id}`);
      sentIds.push(sent.id);
      await this.storeSent(chat, sent.id, text, sent.date ? new Date(sent.date * 1000) : new Date(), runId);
    }
    await this.outbound.setTyping(chat.accountId, chat, false);
    return sentIds;
  }

  private async waitWithTyping(
    ctx: JobContext,
    chat: TelegramChatEntity,
    totalMs: number,
    superseded: () => Promise<boolean>,
  ): Promise<boolean> {
    const deadline = Date.now() + totalMs;
    let lastHeartbeat = Date.now();
    let lastTyping = 0;
    // typing показываем только в последние ~15 секунд ожидания, как человек, который начал печатать.
    const typingFrom = deadline - Math.min(totalMs, 15_000);
    while (Date.now() < deadline) {
      const now = Date.now();
      if (now >= typingFrom && now - lastTyping >= TYPING_REFRESH_MS) {
        await this.outbound.setTyping(chat.accountId, chat, true);
        lastTyping = now;
      }
      if (now - lastHeartbeat >= HEARTBEAT_MS) {
        if (!(await ctx.heartbeat())) return false;
        if (await superseded()) return false;
        lastHeartbeat = now;
      }
      await sleep(Math.min(1000, deadline - now));
    }
    return !(await superseded());
  }

  /** Пока ждали: клиент написал снова, менеджер ответил или ИИ выключили. */
  private async isSuperseded(chat: TelegramChatEntity, lastKnownId: number, trigger: 'inbound' | 'followup'): Promise<boolean> {
    const fresh = await this.chats.findOne({ where: { id: chat.id } });
    if (!fresh || !fresh.aiEnabled || fresh.aiPausedReason) return true;
    if (fresh.lastTelegramMessageId > lastKnownId) return true;
    if (trigger === 'followup' && fresh.lastMessageDirection === 'in') return true;
    return false;
  }

  private async storeSent(chat: TelegramChatEntity, telegramMessageId: number, text: string, sentAt: Date, runId: string): Promise<void> {
    await this.dataSource.query(
      `
      INSERT INTO "telegram_messages" ("chat_id", "telegram_message_id", "direction", "text", "sent_at", "ai_run_id")
      VALUES ($1, $2, 'out', $3, $4, $5)
      ON CONFLICT ("chat_id", "telegram_message_id") DO UPDATE SET "ai_run_id" = EXCLUDED."ai_run_id"
      `,
      [chat.id, telegramMessageId, text, sentAt, runId],
    );
    const fresh = await this.chats.findOneOrFail({ where: { id: chat.id } });
    await this.ingest.refreshAggregates(fresh, {});
    await this.realtime.publishForAccount(chat.accountId, { type: 'message.created', accountId: chat.accountId, chatId: chat.id });
  }

  // --- дожимы -----------------------------------------------------------------

  private followupContext(settings: AiAgentSettingsEntity, stepIndex: number, chat: TelegramChatEntity): FollowupContext | undefined {
    const steps = this.settings.effectiveFollowups(settings);
    const step = steps[stepIndex];
    if (!step) return undefined;
    const since = chat.aiSilenceSince ?? chat.aiLastReplyAt ?? chat.lastMessageAt ?? new Date();
    return {
      step: stepIndex + 1,
      total: steps.length,
      silentDays: (Date.now() - since.getTime()) / 86_400_000,
      goal: step.goal,
      template: step.template,
    };
  }

  private async scheduleFollowup(chat: TelegramChatEntity, settings: AiAgentSettingsEntity): Promise<void> {
    if (!settings.followupsEnabled || !chat.aiSilenceSince) {
      await this.chats.update(chat.id, { aiFollowupNextAt: null });
      return;
    }
    const steps = this.settings.effectiveFollowups(settings);
    const next = steps[chat.aiFollowupStep];
    if (!next) {
      await this.chats.update(chat.id, { aiFollowupNextAt: null });
      return;
    }
    const runAt = new Date(chat.aiSilenceSince.getTime() + next.afterDays * 86_400_000);
    await this.jobs.enqueue({ type: 'followup', accountId: chat.accountId, chatId: chat.id, runAt, maxAttempts: 5 });
    await this.chats.update(chat.id, { aiFollowupNextAt: runAt });
  }

  /** Дожим не отправлен (silent/skipped) — шаг всё равно засчитываем, чтобы не зациклиться. */
  private async advanceFollowup(chat: TelegramChatEntity, settings: AiAgentSettingsEntity, why: string): Promise<void> {
    const nextStep = chat.aiFollowupStep + 1;
    await this.chats.update(chat.id, { aiFollowupStep: nextStep });
    await this.scheduleFollowup({ ...chat, aiFollowupStep: nextStep }, settings);
    this.logger.log(`Чат ${chat.id}: дожим ${chat.aiFollowupStep + 1} пропущен (${why})`);
  }

  // --- общее ------------------------------------------------------------------

  private async finishRun(
    chat: TelegramChatEntity,
    settings: AiAgentSettingsEntity,
    guard: GuardResult,
    generation: GenerationResult,
    runId: string,
    lastClientText: string,
    sent: boolean,
  ): Promise<void> {
    await this.handoff.evaluate({
      chat,
      settings,
      guard,
      runId,
      lastClientText,
      confidence: generation.decision.confidence,
      reason: generation.decision.reason,
    });
    await this.realtime.publishForAccount(chat.accountId, {
      type: 'ai.run',
      accountId: chat.accountId,
      chatId: chat.id,
      status: sent ? 'sent' : guard.silent ? 'silent' : 'skipped',
    });
    await this.realtime.publishForAccount(chat.accountId, { type: 'chat.updated', accountId: chat.accountId, chatId: chat.id });
  }

  private async recordSkip(
    chat: TelegramChatEntity,
    trigger: AiRunTrigger,
    provider: string,
    settings: AiAgentSettingsEntity,
    reason: string,
  ): Promise<void> {
    await this.runs.save(
      this.runs.create({
        accountId: chat.accountId,
        chatId: chat.id,
        trigger,
        provider,
        model: settings.model ?? this.config.model,
        status: 'skipped',
        skipReason: reason,
      }),
    );
  }

  private async loadHistory(chatId: string, limit: number): Promise<TelegramMessageEntity[]> {
    const rows = await this.messages.find({
      where: { chatId },
      order: { sentAt: 'DESC', telegramMessageId: 'DESC' },
      take: limit,
    });
    return rows.reverse();
  }

  private async profileFor(settings: AiAgentSettingsEntity): Promise<StyleProfile | null> {
    if (!settings.useLearnedStyle) return null;
    const row = await this.settings.getProfile(settings.accountId);
    if (row.status !== 'ready') return null;
    return this.settings.effectiveProfile(row);
  }

  private activeWindow(settings: AiAgentSettingsEntity, profile: StyleProfile | null): ActiveWindow | null {
    const manual = this.settings.effectiveWorkingHours(settings);
    if (manual) return windowFromWorkingHours(manual);
    if (profile?.timing) {
      const t = profile.timing;
      return windowFromActiveHours(t.activeHours.from, t.activeHours.to, t.activeDays, t.tz);
    }
    return null;
  }

  private async countSentToday(accountId: string): Promise<number> {
    const rows = await this.dataSource.query<{ count: string }[]>(
      `
      SELECT count(*)::text AS count FROM "ai_runs"
      WHERE "account_id" = $1 AND "status" = 'sent'
        AND ("created_at" AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date
      `,
      [accountId, this.telegramConfig.timezone],
    );
    return Number(rows[0]?.count ?? 0);
  }

  private async countFollowupsLastHour(accountId: string): Promise<number> {
    return this.runs
      .createQueryBuilder('r')
      .where('r.account_id = :accountId', { accountId })
      .andWhere("r.trigger = 'followup' AND r.status = 'sent'")
      .andWhere("r.created_at > now() - interval '1 hour'")
      .getCount();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
