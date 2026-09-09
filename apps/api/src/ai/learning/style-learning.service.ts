import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { z } from 'zod';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { TelegramMessageEntity } from '../../telegram/entities/telegram-message.entity.js';
import { TelegramConfig } from '../../telegram/telegram.config.js';
import { AiConfig } from '../ai.config.js';
import { AiExchangeEntity } from '../entities/ai-exchange.entity.js';
import { AiStyleProfileEntity } from '../entities/ai-style-profile.entity.js';
import type { StyleProfileProgress } from '../entities/ai-style-profile.entity.js';
import { completeJson } from '../llm/complete-json.js';
import { LlmProviderFactory } from '../llm/llm-provider.factory.js';
import { isLlmError } from '../llm/llm-provider.interface.js';
import type { LlmProvider } from '../llm/llm-provider.interface.js';
import { AiJobWorker } from '../services/ai-job-worker.service.js';
import type { JobContext, JobOutcome } from '../services/ai-job-worker.service.js';
import { AiJobsService } from '../services/ai-jobs.service.js';
import { AiSettingsService } from '../services/ai-settings.service.js';
import { mergeKnowledge, styleInput } from './digest-merge.js';
import { digestMapSystemPrompt, digestMapUserPrompt, digestReduceSystemPrompt, digestReduceUserPrompt } from './digest-prompts.js';
import type { DigestDialog } from './digest-prompts.js';
import { clipEnd, clipStart } from '../lib/text.js';
import { ExchangeIndexerService } from './exchange-indexer.service.js';
import { computeHabits, computeTiming } from './habits.js';
import type { ManagerMessageSample } from './habits.js';
import {
  DigestPartialSchema,
  DigestReduceSchema,
  EMPTY_STYLE_PROFILE,
  StyleProfileSchema,
} from './style-profile.schema.js';
import type { DigestPartial, StyleProfile } from './style-profile.schema.js';

/** Сколько диалогов в одной пачке для модели и потолок символов пачки. */
const BATCH_DIALOGS = 12;
const BATCH_CHARS = 18_000;
/** Сколько последних сообщений одного диалога брать в транскрипт. */
const DIALOG_MESSAGES = 60;
const DIALOG_CHARS = 2_500;
/** Ниже этого числа диалогов с ответами менеджера профиль считается ненадёжным. */
const THIN_DIALOGS = 30;
const DIGEST_MAX_TOKENS = 4096;
/** Потолок промпта сводки: остаток контекста нужен модели на сам ответ. */
const REDUCE_PROMPT_CHARS = 60_000;

interface DigestState {
  chatIds: string[];
  partials: DigestPartial[];
  exemplars: { chatId: string; summary: string; outcome: 'won' | 'lost' | 'unknown' }[];
}

/**
 * Обучение на истории: map-reduce по диалогам через модель + привычки и
 * тайминг из SQL. Промежуточные результаты хранятся в payload job'а —
 * после рестарта продолжаем с последней пачки, а не с нуля.
 */
@Injectable()
export class StyleLearningService implements OnModuleInit {
  private readonly logger = new Logger(StyleLearningService.name);

  constructor(
    private readonly config: AiConfig,
    private readonly telegramConfig: TelegramConfig,
    private readonly worker: AiJobWorker,
    private readonly jobs: AiJobsService,
    private readonly providers: LlmProviderFactory,
    private readonly settings: AiSettingsService,
    private readonly indexer: ExchangeIndexerService,
    private readonly realtime: RealtimeService,
    private readonly dataSource: DataSource,
    @InjectRepository(AiStyleProfileEntity)
    private readonly profiles: Repository<AiStyleProfileEntity>,
    @InjectRepository(AiExchangeEntity)
    private readonly exchanges: Repository<AiExchangeEntity>,
    @InjectRepository(TelegramMessageEntity)
    private readonly messages: Repository<TelegramMessageEntity>,
  ) {}

  onModuleInit(): void {
    this.worker.register('digest', (ctx) => this.handle(ctx));
  }

  /** Кнопка «Обучить на истории». */
  async start(accountId: string): Promise<void> {
    const profile = await this.settings.getProfile(accountId);
    await this.profiles.update(profile.id, {
      status: 'building',
      error: null,
      progress: { dialogsTotal: 0, dialogsDone: 0, stage: 'collect' },
    });
    await this.jobs.enqueue({ type: 'digest', accountId, runAt: new Date(), maxAttempts: 6 });
    this.worker.kick();
  }

  /**
   * Кнопка «Остановить». Снять job мало: пока профиль числится building, в
   * интерфейсе висит «Остановить» и заново обучить нельзя — поэтому статус
   * возвращаем к прежнему (готовому или пустому) прямо здесь.
   */
  async cancel(accountId: string): Promise<void> {
    await this.jobs.cancel('digest', accountId);
    const profile = await this.settings.getProfile(accountId);
    if (profile.status === 'building') await this.idle(profile, accountId);
  }

  /** Оценка объёма до запуска: диалоги и символы, которые уйдут в модель. */
  async estimate(accountId: string): Promise<{ dialogs: number; chars: number; exchanges: number; thin: boolean }> {
    await this.indexer.indexRecent(accountId);
    const chatIds = await this.rankChats(accountId);
    const stats = await this.indexer.countForAccount(accountId);
    let chars = 0;
    for (const chatId of chatIds.slice(0, 50)) {
      chars += (await this.transcript(chatId)).length;
    }
    const avg = chatIds.length > 0 ? chars / Math.min(50, chatIds.length) : 0;
    return {
      dialogs: chatIds.length,
      chars: Math.round(avg * chatIds.length),
      exchanges: stats.exchanges,
      thin: chatIds.length < THIN_DIALOGS,
    };
  }

  private async handle(ctx: JobContext): Promise<JobOutcome> {
    const { accountId } = ctx.job;
    const profileRow = await this.settings.getProfile(accountId);
    const settings = await this.settings.getOrCreate(accountId);
    const { provider } = this.providers.resolve(settings.provider);
    const model = settings.model ?? undefined;

    const state: DigestState = {
      chatIds: (ctx.job.payload.chatIds as string[] | undefined) ?? [],
      partials: ((ctx.job.payload.partials as unknown[] | undefined) ?? [])
        .map((p) => DigestPartialSchema.safeParse(p))
        .filter((r) => r.success)
        .map((r) => r.data),
      exemplars: (ctx.job.payload.exemplars as DigestState['exemplars'] | undefined) ?? [],
    };

    try {
      // 1. Сбор: индекс обменов и ранжирование диалогов (только при первом заходе).
      if (state.chatIds.length === 0) {
        await this.progress(ctx, profileRow, accountId, { dialogsTotal: 0, dialogsDone: 0, stage: 'collect' });
        await this.indexer.indexAccount(accountId);
        state.chatIds = await this.rankChats(accountId);
        if (!(await ctx.heartbeat({ chatIds: state.chatIds }))) {
          await this.idle(profileRow, accountId);
          return { kind: 'cancelled' };
        }
      }

      const total = state.chatIds.length;
      if (total === 0) {
        await this.finish(profileRow, accountId, EMPTY_STYLE_PROFILE, state, 0);
        return { kind: 'done' };
      }

      // 2. Map: пачками, с сохранением партиалов после каждой.
      const batches = this.batches(state.chatIds);
      for (let b = state.partials.length; b < batches.length; b += 1) {
        const batch = batches[b];
        const done = batches.slice(0, b).reduce((n, x) => n + x.length, 0);
        await this.progress(ctx, profileRow, accountId, { dialogsTotal: total, dialogsDone: done, stage: 'map' });

        const dialogs: DigestDialog[] = [];
        for (const [i, chatId] of batch.entries()) {
          const transcript = await this.transcript(chatId);
          if (transcript) dialogs.push({ index: i, chatId, transcript });
        }
        const partial = await this.mapBatch(provider, model, dialogs);
        state.partials.push(partial);
        for (const ex of partial.exemplars) {
          const dialog = dialogs[ex.dialogIndex];
          if (dialog) state.exemplars.push({ chatId: dialog.chatId, summary: ex.summary, outcome: ex.outcome });
        }
        const alive = await ctx.heartbeat({ partials: state.partials, exemplars: state.exemplars });
        if (!alive) {
          await this.idle(profileRow, accountId);
          return { kind: 'cancelled' };
        }
      }

      // 3. Reduce + привычки/тайминг кодом.
      await this.progress(ctx, profileRow, accountId, { dialogsTotal: total, dialogsDone: total, stage: 'reduce' });
      const reduced = await this.reduce(provider, model, state.partials);
      const { habits, timing } = await this.computeStats(accountId);
      const profile: StyleProfile = StyleProfileSchema.parse({
        ...reduced,
        habits,
        timing,
        dialogExemplars: state.exemplars.slice(0, 30),
      });

      // 4. Разметка намерений в индексе обменов — для подбора примеров по этапу.
      await this.progress(ctx, profileRow, accountId, { dialogsTotal: total, dialogsDone: total, stage: 'index' });
      await this.tagIntents(accountId, profile);

      await this.finish(profileRow, accountId, profile, state, total);
      return { kind: 'done' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Ошибка ключа — повторять бессмысленно. После последней попытки — тоже.
      const fatal = isLlmError(error) && (error.kind === 'auth' || error.kind === 'bad_request');
      const last = fatal || ctx.job.attempts >= ctx.job.maxAttempts;
      await this.profiles.update(profileRow.id, { status: last ? 'error' : 'building', error: message });
      await this.realtime.publishForAccount(accountId, {
        type: 'learning.progress',
        accountId,
        job: 'digest',
        status: 'error',
        done: 0,
        total: state.chatIds.length,
        error: message,
      });
      if (fatal) {
        this.logger.error(`Аккаунт ${accountId}: обучение остановлено — ${message}`);
        return { kind: 'done' };
      }
      throw error;
    }
  }

  // --- шаги ---------------------------------------------------------------

  /** Диалоги с ответами менеджера, самые полезные первыми, не больше лимита. */
  private async rankChats(accountId: string): Promise<string[]> {
    const rows = await this.dataSource.query<{ chat_id: string }[]>(
      `
      SELECT e."chat_id",
             count(*) FILTER (WHERE e."quality" > 0) AS useful,
             max(e."manager_at") AS last_at
      FROM "ai_exchanges" e
      WHERE e."account_id" = $1
      GROUP BY e."chat_id"
      HAVING count(*) FILTER (WHERE e."quality" > 0) >= 1
      ORDER BY (count(*) FILTER (WHERE e."quality" = 2)) DESC, useful DESC, last_at DESC
      LIMIT $2
      `,
      [accountId, this.config.digestMaxDialogs],
    );
    return rows.map((r) => r.chat_id);
  }

  private batches(chatIds: string[]): string[][] {
    const result: string[][] = [];
    for (let i = 0; i < chatIds.length; i += BATCH_DIALOGS) result.push(chatIds.slice(i, i + BATCH_DIALOGS));
    return result;
  }

  /** Транскрипт диалога «К:/М:», последние N сообщений, без сообщений ИИ. */
  private async transcript(chatId: string): Promise<string> {
    const rows = await this.messages.find({
      where: { chatId },
      order: { sentAt: 'DESC', telegramMessageId: 'DESC' },
      take: DIALOG_MESSAGES,
    });
    const lines: string[] = [];
    for (const m of rows.reverse()) {
      if (m.aiRunId) continue;
      const text = m.text.trim();
      if (!text) continue;
      lines.push(`${m.direction === 'in' ? 'К' : 'М'}: ${clipStart(text.replace(/\s+/g, ' '), 400)}`);
    }
    let transcript = lines.join('\n');
    if (transcript.length > DIALOG_CHARS) transcript = clipEnd(transcript, DIALOG_CHARS);
    return transcript;
  }

  private async mapBatch(provider: LlmProvider, model: string | undefined, dialogs: DigestDialog[]): Promise<DigestPartial> {
    if (dialogs.length === 0) return DigestPartialSchema.parse({});
    // Пачка не должна превышать потолок символов — иначе режем количество диалогов.
    let selected = dialogs;
    while (selected.length > 1 && digestMapUserPrompt(selected).length > BATCH_CHARS) {
      selected = selected.slice(0, -1);
    }
    try {
      const { data } = await completeJson(
        provider,
        {
          system: digestMapSystemPrompt(),
          messages: [{ role: 'user', content: digestMapUserPrompt(selected) }],
          schemaName: 'digest_partial',
          jsonSchema: z.toJSONSchema(DigestPartialSchema) as Record<string, unknown>,
          maxTokens: DIGEST_MAX_TOKENS,
          timeoutMs: this.config.requestTimeoutMs * 2,
          model,
          temperature: 0.3,
        },
        DigestPartialSchema,
        'Пачка диалогов',
      );
      return data;
    } catch (error) {
      // Одна испорченная пачка не должна валить обучение целиком — остальные полезнее.
      if (isLlmError(error) && error.kind === 'invalid_json') {
        this.logger.warn(error.message);
        return DigestPartialSchema.parse({});
      }
      throw error;
    }
  }

  /**
   * Сводка: стиль и фразник — от модели, знания — кодом. Модель, которую
   * просили выдать ещё и сотни FAQ, возражений и фактов, упиралась в лимит
   * ответа и обрывала JSON на полуслове.
   */
  private async reduce(provider: LlmProvider, model: string | undefined, partials: DigestPartial[]) {
    const knowledge = mergeKnowledge(partials);
    if (partials.length === 0) return { ...DigestReduceSchema.parse({ styleGuide: '' }), ...knowledge };
    const compact = styleInput(partials);
    const { data } = await completeJson(
      provider,
      {
        system: digestReduceSystemPrompt(),
        messages: [{ role: 'user', content: clipStart(digestReduceUserPrompt(compact), REDUCE_PROMPT_CHARS) }],
        schemaName: 'digest_reduce',
        jsonSchema: z.toJSONSchema(DigestReduceSchema) as Record<string, unknown>,
        maxTokens: DIGEST_MAX_TOKENS * 2,
        timeoutMs: this.config.requestTimeoutMs * 3,
        model,
        temperature: 0.3,
      },
      DigestReduceSchema,
      'Сводка профиля',
    );
    return { ...data, ...knowledge };
  }

  private async computeStats(accountId: string) {
    const tz = this.telegramConfig.timezone;
    const exchanges = await this.exchanges.find({
      where: { accountId },
      select: { delaySec: true, managerAt: true, managerParts: true, managerText: true, quality: true },
    });
    const useful = exchanges.filter((e) => e.quality > 0);
    const multi = useful.length > 0 ? useful.filter((e) => e.managerParts > 1).length / useful.length : 0;

    const samples: ManagerMessageSample[] = [];
    for (const e of useful) {
      const parts = e.managerText.split('\n').filter(Boolean);
      parts.forEach((text, i) => {
        samples.push({ text, sentAt: e.managerAt, opensBlock: i === 0, closesBlock: i === parts.length - 1 });
      });
    }
    const habits = computeHabits(samples, multi);
    const timing = computeTiming(
      useful.map((e) => e.delaySec),
      useful.map((e) => e.managerAt),
      tz,
    );
    return { habits, timing };
  }

  /** Намерение обмена — по сходству ответа менеджера с фразами из phrasebook. */
  private async tagIntents(accountId: string, profile: StyleProfile): Promise<void> {
    await this.dataSource.query(`UPDATE "ai_exchanges" SET "intent" = NULL WHERE "account_id" = $1`, [accountId]);
    for (const entry of profile.phrasebook) {
      const phrases = entry.phrases.filter((p) => p.length >= 8).slice(0, 20);
      if (phrases.length === 0) continue;
      await this.dataSource.query(
        `
        UPDATE "ai_exchanges" e SET "intent" = $2
        WHERE e."account_id" = $1 AND e."intent" IS NULL
          AND EXISTS (SELECT 1 FROM unnest($3::text[]) p WHERE e."manager_text" % p)
        `,
        [accountId, entry.intent, phrases],
      );
    }
  }

  private async finish(
    row: AiStyleProfileEntity,
    accountId: string,
    profile: StyleProfile,
    state: DigestState,
    dialogs: number,
  ): Promise<void> {
    const stats = await this.indexer.countForAccount(accountId);
    const managerMessages = await this.messages
      .createQueryBuilder('m')
      .innerJoin('telegram_chats', 'c', 'c.id = m.chat_id')
      .where('c.account_id = :accountId', { accountId })
      .andWhere("m.direction = 'out'")
      .andWhere('m.ai_run_id IS NULL')
      .getCount();
    await this.profiles.update(row.id, {
      status: 'ready',
      version: row.version + 1,
      builtAt: new Date(),
      profile,
      progress: { dialogsTotal: dialogs, dialogsDone: dialogs, stage: 'index' },
      sourceStats: {
        dialogs,
        exchanges: stats.exchanges,
        managerMessages,
        from: stats.from?.toISOString() ?? null,
        to: stats.to?.toISOString() ?? null,
        thin: dialogs < THIN_DIALOGS,
      },
      error: null,
    });
    await this.realtime.publishForAccount(accountId, {
      type: 'learning.progress',
      accountId,
      job: 'digest',
      status: 'done',
      done: dialogs,
      total: dialogs,
    });
    this.logger.log(`Аккаунт ${accountId}: профиль стиля v${row.version + 1} готов (диалогов ${dialogs}, пачек ${state.partials.length})`);
  }

  /** Профиль больше не строится: вернуть его к прежнему состоянию без ошибки. */
  private async idle(row: AiStyleProfileEntity, accountId: string): Promise<void> {
    await this.profiles.update(row.id, {
      status: row.builtAt ? 'ready' : 'empty',
      progress: null,
      error: null,
    });
    await this.realtime.publishForAccount(accountId, {
      type: 'learning.progress',
      accountId,
      job: 'digest',
      status: 'cancelled',
      done: 0,
      total: 0,
    });
  }

  private async progress(
    ctx: JobContext,
    row: AiStyleProfileEntity,
    accountId: string,
    progress: StyleProfileProgress,
  ): Promise<void> {
    await this.profiles.update(row.id, { status: 'building', progress });
    await ctx.heartbeat().catch(() => undefined);
    await this.realtime.publishForAccount(accountId, {
      type: 'learning.progress',
      accountId,
      job: 'digest',
      status: 'running',
      done: progress.dialogsDone,
      total: progress.dialogsTotal,
      stage: progress.stage,
    });
  }
}
