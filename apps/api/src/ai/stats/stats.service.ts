import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, In, Repository } from 'typeorm';
import { TelegramAccountEntity } from '../../telegram/entities/telegram-account.entity.js';
import { AiConfig } from '../ai.config.js';
import { AiDiagnosticEntity } from '../entities/ai-diagnostic.entity.js';
import { AiPhraseEntity } from '../entities/ai-phrase.entity.js';
import { AiStatsDailyEntity } from '../entities/ai-stats-daily.entity.js';
import type { JobContext, JobOutcome } from '../jobs/ai-job-worker.service.js';
import { AiJobWorker } from '../jobs/ai-job-worker.service.js';
import { AiJobsService } from '../jobs/ai-jobs.service.js';
import { AiSettingsService } from '../settings/ai-settings.service.js';
import { MINUTES_CAP, average, emptyMetrics, median, mergeMetrics, rate, topEntries } from './metrics.js';
import type { DailyMetrics, SendReply } from './metrics.js';
import type {
  DraftStatsDto,
  FunnelStatsDto,
  LibraryStatsDto,
  StatsRange,
  TurnStatsDto,
} from './stats.dto.js';

/** Пересчёт — раз в час (раздел 14 ТЗ). */
const RECALC_INTERVAL_MS = 60 * 60_000;
/** Первый пересчёт после старта — когда модули уже поднялись. */
const FIRST_RUN_MS = 90_000;
/** Сегодняшний день пересчитываем на чтении, если строка старше этого. */
const FRESH_MS = 5 * 60_000;
const DEFAULT_DAYS = 7;
/** Первый запуск на аккаунте поднимает историю за две недели. */
const BACKFILL_DAYS = 14;
/** Сколько вариантов библиотеки показываем на странице. */
const LIBRARY_LIMIT = 30;

/**
 * Статистика агента (раздел 14 ТЗ): job `stats` раз в час складывает сырые
 * счётчики дня в `ai_stats_daily`, страницы читают уже посчитанное. День
 * считается в таймзоне аккаунта (`tz` в настройках).
 */
@Injectable()
export class StatsService implements OnModuleInit {
  private readonly logger = new Logger(StatsService.name);
  private firstRun: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(AiStatsDailyEntity)
    private readonly stats: Repository<AiStatsDailyEntity>,
    @InjectRepository(TelegramAccountEntity)
    private readonly accounts: Repository<TelegramAccountEntity>,
    @InjectRepository(AiPhraseEntity)
    private readonly phrases: Repository<AiPhraseEntity>,
    @InjectRepository(AiDiagnosticEntity)
    private readonly diagnostics: Repository<AiDiagnosticEntity>,
    private readonly dataSource: DataSource,
    private readonly settings: AiSettingsService,
    private readonly jobs: AiJobsService,
    private readonly worker: AiJobWorker,
    private readonly config: AiConfig,
  ) {}

  onModuleInit(): void {
    // Воркер выключен вместе с агентом — очередь пересчёта копить незачем.
    if (!this.config.enabled) return;
    this.worker.register('stats', (ctx) => this.handle(ctx));
    this.firstRun = setTimeout(() => void this.scheduleAll(), FIRST_RUN_MS);
    this.firstRun.unref?.();
  }

  // --- job ------------------------------------------------------------------

  /** Пересчитываем сегодня и вчера: после полуночи вчерашний день надо закрыть. */
  async handle(ctx: JobContext): Promise<JobOutcome> {
    const { job } = ctx;
    if (job.payload.cancelled === true) return { kind: 'cancelled' };
    const tz = await this.tzOf(job.accountId);
    const today = localDate(new Date(), tz);
    // Сегодня и вчера считаем всегда (после полуночи вчерашний день надо закрыть),
    // остальные дни за две недели — только если их ещё нет: так первый запуск
    // поднимает историю, а последующие не перемалывают её заново.
    const known = new Set(
      (await this.stats.find({ where: { accountId: job.accountId, date: Between(shiftDate(today, -BACKFILL_DAYS), today) }, select: { date: true } })).map(
        (row) => row.date,
      ),
    );
    for (let back = 0; back < BACKFILL_DAYS; back += 1) {
      const date = shiftDate(today, -back);
      if (back > 1 && known.has(date)) continue;
      await this.recalc(job.accountId, date, tz);
    }
    await this.jobs.enqueue({
      type: 'stats',
      accountId: job.accountId,
      runAt: new Date(Date.now() + RECALC_INTERVAL_MS),
      maxAttempts: 3,
    });
    return { kind: 'done' };
  }

  /** Поставить пересчёт всем аккаунтам владельцев (после старта процесса). */
  async scheduleAll(): Promise<void> {
    try {
      const accounts = await this.accounts.find({ select: { id: true } });
      for (const account of accounts) {
        await this.jobs.enqueue({ type: 'stats', accountId: account.id, runAt: new Date(), maxAttempts: 3 });
      }
      if (accounts.length > 0) this.worker.kick();
    } catch (error) {
      this.logger.error(`Не удалось поставить пересчёт статистики: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // --- чтение ---------------------------------------------------------------

  async funnel(accountId: string, range: StatsRange): Promise<FunnelStatsDto> {
    const { metrics, resolved } = await this.metricsFor(accountId, range);
    const stages = Object.entries(metrics.stages)
      .map(([stage, counters]) => ({ stage, ...counters }))
      .sort((a, b) => b.entered - a.entered || a.stage.localeCompare(b.stage));
    const reengage = metrics.touches.reengage ?? { sent: 0, replied: 0 };
    return {
      range: resolved,
      stages,
      leads: {
        started: metrics.leads.started,
        diagnosticsSent: metrics.leads.diagnosticsSent,
        diagnosticsRead: metrics.leads.diagnosticsRead,
        diagnosticsReadRate: rate(metrics.leads.diagnosticsRead, metrics.leads.diagnosticsSent),
        medianMinutesToDiagnostics: median(metrics.leads.minutesToDiagnostics),
      },
      reengage: { sent: reengage.sent, replied: reengage.replied, replyRate: rate(reengage.replied, reengage.sent) },
      handoffs: metrics.turns.handoff,
    };
  }

  async turns(accountId: string, range: StatsRange): Promise<TurnStatsDto> {
    const { metrics, resolved } = await this.metricsFor(accountId, range);
    const t = metrics.turns;
    return {
      range: resolved,
      total: t.total,
      sent: t.sent,
      dryRun: t.dryRun,
      silent: t.silent,
      handoff: t.handoff,
      error: t.error,
      awaitingApproval: t.awaitingApproval,
      silentRate: rate(t.silent, t.total),
      regeneratedRate: rate(t.regenerated, t.total),
      handoffRate: rate(t.handoff, t.total),
      avgConfidence: average(t.confidenceSum, t.confidenceCount),
      tokensIn: t.tokensIn,
      tokensOut: t.tokensOut,
      handoffReasons: topEntries(metrics.handoffReasons).map((item) => ({ reason: item.key, count: item.count })),
    };
  }

  async drafts(accountId: string, range: StatsRange): Promise<DraftStatsDto> {
    const { metrics, resolved } = await this.metricsFor(accountId, range);
    const created = metrics.drafts.created ?? 0;
    const statuses = topEntries(metrics.drafts).filter((item) => item.key !== 'created');
    const decided = statuses.reduce((sum, item) => sum + item.count, 0);
    return {
      range: resolved,
      created,
      decided,
      byStatus: statuses.map((item) => ({ status: item.key, count: item.count, share: rate(item.count, decided) })),
    };
  }

  /** Отклик по видам касаний и по конкретным текстам библиотеки. */
  async library(accountId: string, range: StatsRange): Promise<LibraryStatsDto> {
    const { metrics, resolved } = await this.metricsFor(accountId, range);
    const byKind = Object.entries(metrics.touches)
      .map(([kind, counters]) => ({ kind, ...withRate(counters) }))
      .sort((a, b) => b.sent - a.sent || a.kind.localeCompare(b.kind));

    const ids = Object.keys(metrics.library);
    const [phrases, diagnostics] = await Promise.all([
      ids.length > 0 ? this.phrases.find({ where: { id: In(ids) } }) : [],
      ids.length > 0 ? this.diagnostics.find({ where: { id: In(ids) } }) : [],
    ]);
    const titles = new Map<string, { title: string; kind: string }>();
    for (const row of phrases) titles.set(row.id, { title: row.title || row.kind, kind: row.usage === 'block' ? `блок ${row.kind}` : row.kind });
    for (const row of diagnostics) titles.set(row.id, { title: row.title, kind: 'диагностика' });

    const items = Object.entries(metrics.library)
      .map(([id, counters]) => ({
        id,
        title: titles.get(id)?.title ?? 'удалённый текст',
        kind: titles.get(id)?.kind ?? '—',
        ...withRate(counters),
      }))
      .sort((a, b) => b.sent - a.sent || a.title.localeCompare(b.title))
      .slice(0, LIBRARY_LIMIT);

    return { range: resolved, byKind, items };
  }

  // --- пересчёт -------------------------------------------------------------

  /** Считает метрики дня заново и кладёт их в `ai_stats_daily`. */
  async recalc(accountId: string, date: string, tz: string): Promise<DailyMetrics> {
    const metrics = emptyMetrics();
    const args = [accountId, date, tz];

    const [turns] = await this.dataSource.query<TurnsRow[]>(TURNS_SQL, args);
    if (turns) {
      metrics.turns = {
        total: Number(turns.total),
        sent: Number(turns.sent),
        dryRun: Number(turns.dry_run),
        silent: Number(turns.silent),
        handoff: Number(turns.handoff),
        error: Number(turns.error),
        awaitingApproval: Number(turns.awaiting),
        regenerated: Number(turns.regenerated),
        confidenceSum: Number(turns.conf_sum),
        confidenceCount: Number(turns.conf_count),
        tokensIn: Number(turns.tokens_in),
        tokensOut: Number(turns.tokens_out),
      };
    }

    for (const row of await this.dataSource.query<KeyCountRow[]>(TOUCHES_SQL, args)) {
      metrics.touches[row.key] = { sent: Number(row.sent), replied: Number(row.replied) };
    }
    for (const row of await this.dataSource.query<KeyCountRow[]>(LIBRARY_SQL, args)) {
      metrics.library[row.key] = { sent: Number(row.sent), replied: Number(row.replied) };
    }
    for (const row of await this.dataSource.query<EventRow[]>(EVENTS_SQL, args)) {
      const count = Number(row.count);
      if (row.kind === 'handoff') {
        const reason = row.reason ?? 'unknown';
        metrics.handoffReasons[reason] = (metrics.handoffReasons[reason] ?? 0) + count;
      } else {
        if (row.to_stage) stageOf(metrics, row.to_stage).entered += count;
        if (row.from_stage) stageOf(metrics, row.from_stage).advanced += count;
      }
    }
    for (const row of await this.dataSource.query<KeyCountRow[]>(HANDOFF_STAGE_SQL, args)) {
      stageOf(metrics, row.key).handoff += Number(row.sent);
    }
    for (const row of await this.dataSource.query<KeyCountRow[]>(DRAFTS_SQL, args)) {
      metrics.drafts[row.key] = (metrics.drafts[row.key] ?? 0) + Number(row.sent);
    }
    const [leads] = await this.dataSource.query<LeadsRow[]>(LEADS_SQL, args);
    if (leads) {
      metrics.leads.started = Number(leads.started);
      metrics.leads.diagnosticsSent = Number(leads.diag_sent);
      metrics.leads.diagnosticsRead = Number(leads.diag_read);
    }
    const minutes = await this.dataSource.query<{ minutes: string }[]>(MINUTES_SQL, [...args, MINUTES_CAP]);
    metrics.leads.minutesToDiagnostics = minutes.map((row) => Math.round(Number(row.minutes)));

    await this.dataSource.query(
      `
      INSERT INTO "ai_stats_daily" ("account_id", "date", "metrics")
      VALUES ($1, $2::date, $3::jsonb)
      ON CONFLICT ("account_id", "date") DO UPDATE SET "metrics" = EXCLUDED."metrics", "updated_at" = now()
      `,
      [accountId, date, JSON.stringify(metrics)],
    );
    return metrics;
  }

  // --- внутреннее -----------------------------------------------------------

  /**
   * Метрики за период из `ai_stats_daily`. Сегодняшний день пересчитываем на
   * месте, если он старше пяти минут, — иначе страница отставала бы на час.
   */
  private async metricsFor(accountId: string, range: StatsRange): Promise<{ metrics: DailyMetrics; resolved: StatsRange }> {
    const tz = await this.tzOf(accountId);
    const today = localDate(new Date(), tz);
    const to = range.to ?? today;
    const from = range.from ?? shiftDate(to, -(DEFAULT_DAYS - 1));
    const resolved: StatsRange = { from, to, days: daysBetween(from, to) };

    if (from <= today && today <= to) {
      const current = await this.stats.findOne({ where: { accountId, date: today } });
      if (!current || Date.now() - current.updatedAt.getTime() > FRESH_MS) {
        await this.recalc(accountId, today, tz).catch((error) => {
          this.logger.warn(`Пересчёт за ${today} не удался: ${error instanceof Error ? error.message : String(error)}`);
          return null;
        });
      }
    }

    const rows = await this.stats.find({ where: { accountId, date: Between(from, to) } });
    return { metrics: mergeMetrics(rows.map((row) => row.metrics as unknown as DailyMetrics)), resolved };
  }

  private async tzOf(accountId: string): Promise<string> {
    const settings = await this.settings.get(accountId);
    return settings.tz || 'UTC';
  }
}

function stageOf(metrics: DailyMetrics, stage: string) {
  return (metrics.stages[stage] ??= { entered: 0, advanced: 0, handoff: 0 });
}

function withRate(counters: SendReply): { sent: number; replied: number; replyRate: number | null } {
  return { sent: counters.sent, replied: counters.replied, replyRate: rate(counters.replied, counters.sent) };
}

/** Дата в таймзоне аккаунта, `YYYY-MM-DD`. */
export function localDate(at: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

export function shiftDate(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const ms = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

// --- SQL ---------------------------------------------------------------------

interface TurnsRow {
  total: string;
  sent: string;
  dry_run: string;
  silent: string;
  handoff: string;
  error: string;
  awaiting: string;
  regenerated: string;
  tokens_in: string;
  tokens_out: string;
  conf_sum: string;
  conf_count: string;
}

interface KeyCountRow {
  key: string;
  sent: string;
  replied: string;
}

interface EventRow {
  kind: string;
  reason: string | null;
  from_stage: string | null;
  to_stage: string | null;
  count: string;
}

interface LeadsRow {
  started: string;
  diag_sent: string;
  diag_read: string;
}

/** День аккаунта: от полуночи до полуночи в его таймзоне. */
const DAY = (column: string): string => `(${column} AT TIME ZONE $3)::date = $2::date`;
const NUMERIC = `~ '^[0-9]+(\\.[0-9]+)?$'`;

const TURNS_SQL = `
SELECT count(*)::text AS total,
       count(*) FILTER (WHERE "outcome" = 'sent')::text AS sent,
       count(*) FILTER (WHERE "outcome" = 'dry_run')::text AS dry_run,
       count(*) FILTER (WHERE "outcome" = 'silent')::text AS silent,
       count(*) FILTER (WHERE "outcome" = 'handoff')::text AS handoff,
       count(*) FILTER (WHERE "outcome" = 'error')::text AS error,
       count(*) FILTER (WHERE "outcome" = 'awaiting_approval')::text AS awaiting,
       count(*) FILTER (WHERE jsonb_array_length("guard_notes") > 1)::text AS regenerated,
       coalesce(sum("tokens_in"), 0)::text AS tokens_in,
       coalesce(sum("tokens_out"), 0)::text AS tokens_out,
       coalesce(sum(("analysis"->>'confidence')::numeric) FILTER (WHERE "analysis"->>'confidence' ${NUMERIC}), 0)::text AS conf_sum,
       count(*) FILTER (WHERE "analysis"->>'confidence' ${NUMERIC})::text AS conf_count
  FROM "ai_turns"
 WHERE "account_id" = $1 AND ${DAY('"created_at"')}
`;

const TOUCHES_SQL = `
SELECT coalesce("touch_kind", "trigger") AS "key",
       count(*) FILTER (WHERE "outcome" IN ('sent', 'dry_run'))::text AS "sent",
       count(*) FILTER (WHERE "outcome" IN ('sent', 'dry_run') AND "replied_at" IS NOT NULL)::text AS "replied"
  FROM "ai_turns"
 WHERE "account_id" = $1 AND ${DAY('"created_at"')}
 GROUP BY 1
`;

const LIBRARY_SQL = `
SELECT lib::text AS "key",
       count(*)::text AS "sent",
       count(*) FILTER (WHERE t."replied_at" IS NOT NULL)::text AS "replied"
  FROM "ai_turns" t, unnest(t."library_ids") AS lib
 WHERE t."account_id" = $1 AND ${DAY('t."created_at"')}
 GROUP BY 1
`;

const EVENTS_SQL = `
SELECT "kind",
       "payload"->>'reason' AS "reason",
       "payload"->>'from' AS "from_stage",
       "payload"->>'to' AS "to_stage",
       count(*)::text AS "count"
  FROM "ai_events"
 WHERE "account_id" = $1 AND ${DAY('"created_at"')} AND "kind" IN ('handoff', 'stage_changed')
 GROUP BY 1, 2, 3, 4
`;

const HANDOFF_STAGE_SQL = `
SELECT coalesce("stage_before", 'unknown') AS "key", count(*)::text AS "sent", '0'::text AS "replied"
  FROM "ai_turns"
 WHERE "account_id" = $1 AND ${DAY('"created_at"')} AND "outcome" = 'handoff'
 GROUP BY 1
`;

const DRAFTS_SQL = `
SELECT 'created' AS "key", count(*)::text AS "sent", '0'::text AS "replied"
  FROM "ai_drafts"
 WHERE "account_id" = $1 AND ${DAY('"created_at"')}
UNION ALL
SELECT "status" AS "key", count(*)::text AS "sent", '0'::text AS "replied"
  FROM "ai_drafts"
 WHERE "account_id" = $1 AND "decided_at" IS NOT NULL AND ${DAY('"decided_at"')}
 GROUP BY "status"
`;

const LEADS_SQL = `
SELECT count(*) FILTER (WHERE "funnel_started_at" IS NOT NULL AND ${DAY('"funnel_started_at"')})::text AS started,
       count(*) FILTER (WHERE "diagnostics_sent_at" IS NOT NULL AND ${DAY('"diagnostics_sent_at"')})::text AS diag_sent,
       count(*) FILTER (WHERE "diagnostics_read_at" IS NOT NULL AND ${DAY('"diagnostics_read_at"')})::text AS diag_read
  FROM "ai_chat_state"
 WHERE "account_id" = $1
`;

const MINUTES_SQL = `
SELECT (EXTRACT(EPOCH FROM ("diagnostics_sent_at" - "funnel_started_at")) / 60)::text AS "minutes"
  FROM "ai_chat_state"
 WHERE "account_id" = $1
   AND "diagnostics_sent_at" IS NOT NULL AND "funnel_started_at" IS NOT NULL
   AND ${DAY('"diagnostics_sent_at"')}
 LIMIT $4
`;
