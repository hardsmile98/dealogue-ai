/**
 * Метрики агента (раздел 14 ТЗ). За день они лежат в `ai_stats_daily.metrics`
 * сырыми счётчиками — так их можно складывать за любой период. Здесь только
 * чистая часть: пустой день, сложение дней и превращение счётчиков в доли для
 * страницы статистики. Считает их из базы `StatsService`.
 */

export interface TurnCounters {
  total: number;
  sent: number;
  dryRun: number;
  silent: number;
  handoff: number;
  error: number;
  awaitingApproval: number;
  /** Ходы, где модель переписывала ответ после guard. */
  regenerated: number;
  confidenceSum: number;
  confidenceCount: number;
  tokensIn: number;
  tokensOut: number;
}

export interface SendReply {
  sent: number;
  replied: number;
}

export interface StageCounters {
  entered: number;
  advanced: number;
  handoff: number;
}

export interface LeadCounters {
  started: number;
  diagnosticsSent: number;
  diagnosticsRead: number;
  /** Минуты от начала воронки до диагностики — для медианы за период. */
  minutesToDiagnostics: number[];
}

export interface DailyMetrics {
  turns: TurnCounters;
  /** Причины передач менеджеру за день. */
  handoffReasons: Record<string, number>;
  stages: Record<string, StageCounters>;
  /** Черновики: `created` плюс счётчик по статусу решения. */
  drafts: Record<string, number>;
  /** Отправлено и получено ответов — по виду касания (`inbound` — ответ на входящее). */
  touches: Record<string, SendReply>;
  /** То же по конкретному образцу, блоку или диагностике. */
  library: Record<string, SendReply>;
  leads: LeadCounters;
}

/** Сколько значений медианы храним за день — чтобы jsonb не разрастался. */
export const MINUTES_CAP = 500;

export function emptyMetrics(): DailyMetrics {
  return {
    turns: {
      total: 0,
      sent: 0,
      dryRun: 0,
      silent: 0,
      handoff: 0,
      error: 0,
      awaitingApproval: 0,
      regenerated: 0,
      confidenceSum: 0,
      confidenceCount: 0,
      tokensIn: 0,
      tokensOut: 0,
    },
    handoffReasons: {},
    stages: {},
    drafts: {},
    touches: {},
    library: {},
    leads: { started: 0, diagnosticsSent: 0, diagnosticsRead: 0, minutesToDiagnostics: [] },
  };
}

/** Сумма дней: счётчики складываются, значения медианы — конкатенируются. */
export function mergeMetrics(days: DailyMetrics[]): DailyMetrics {
  const total = emptyMetrics();
  for (const day of days) {
    const turns = day.turns ?? {};
    for (const key of Object.keys(total.turns) as (keyof TurnCounters)[]) {
      total.turns[key] += numberOf(turns[key]);
    }
    addCounts(total.handoffReasons, day.handoffReasons);
    addCounts(total.drafts, day.drafts);
    addSendReply(total.touches, day.touches);
    addSendReply(total.library, day.library);
    for (const [stage, counters] of Object.entries(day.stages ?? {})) {
      const target = (total.stages[stage] ??= { entered: 0, advanced: 0, handoff: 0 });
      target.entered += numberOf(counters?.entered);
      target.advanced += numberOf(counters?.advanced);
      target.handoff += numberOf(counters?.handoff);
    }
    const leads = day.leads;
    if (leads) {
      total.leads.started += numberOf(leads.started);
      total.leads.diagnosticsSent += numberOf(leads.diagnosticsSent);
      total.leads.diagnosticsRead += numberOf(leads.diagnosticsRead);
      if (Array.isArray(leads.minutesToDiagnostics)) {
        total.leads.minutesToDiagnostics.push(...leads.minutesToDiagnostics.filter((v) => typeof v === 'number'));
      }
    }
  }
  return total;
}

/** Доля от целого; нет выборки — `null`, а не ноль (на странице это «—»). */
export function rate(part: number, total: number): number | null {
  return total > 0 ? part / total : null;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function average(sum: number, count: number): number | null {
  return count > 0 ? sum / count : null;
}

/** Пары «ключ → счётчик» по убыванию, для таблиц причин и статусов. */
export function topEntries(counts: Record<string, number>): { key: string; count: number }[] {
  return Object.entries(counts)
    .map(([key, count]) => ({ key, count: numberOf(count) }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function addCounts(target: Record<string, number>, source: Record<string, number> | undefined): void {
  for (const [key, value] of Object.entries(source ?? {})) {
    target[key] = (target[key] ?? 0) + numberOf(value);
  }
}

function addSendReply(target: Record<string, SendReply>, source: Record<string, SendReply> | undefined): void {
  for (const [key, value] of Object.entries(source ?? {})) {
    const item = (target[key] ??= { sent: 0, replied: 0 });
    item.sent += numberOf(value?.sent);
    item.replied += numberOf(value?.replied);
  }
}

function numberOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
