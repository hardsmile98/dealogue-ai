/** DTO статистики — зеркало apps/web/src/shared/api/contracts/ai.ts. */

export interface StatsRange {
  /** `YYYY-MM-DD` в таймзоне аккаунта; пусто — последние 7 дней. */
  from?: string;
  to?: string;
  days?: number;
}

export interface FunnelStatsDto {
  range: StatsRange;
  /** По этапам: вошло, продвинулось дальше, передано менеджеру. */
  stages: { stage: string; entered: number; advanced: number; handoff: number }[];
  leads: {
    started: number;
    diagnosticsSent: number;
    diagnosticsRead: number;
    diagnosticsReadRate: number | null;
    medianMinutesToDiagnostics: number | null;
  };
  /** Вопрос-возврат после диагностики: сколько ушло и сколько ответили. */
  reengage: { sent: number; replied: number; replyRate: number | null };
  handoffs: number;
}

export interface TurnStatsDto {
  range: StatsRange;
  total: number;
  sent: number;
  dryRun: number;
  silent: number;
  handoff: number;
  error: number;
  awaitingApproval: number;
  silentRate: number | null;
  regeneratedRate: number | null;
  handoffRate: number | null;
  avgConfidence: number | null;
  tokensIn: number;
  tokensOut: number;
  handoffReasons: { reason: string; count: number }[];
}

export interface DraftStatsDto {
  range: StatsRange;
  created: number;
  decided: number;
  byStatus: { status: string; count: number; share: number | null }[];
}

export interface LibraryStatsDto {
  range: StatsRange;
  /** Отклик по виду касания (и `inbound` — ответы на входящие). */
  byKind: { kind: string; sent: number; replied: number; replyRate: number | null }[];
  /** Отклик по конкретным текстам библиотеки. */
  items: { id: string; title: string; kind: string; sent: number; replied: number; replyRate: number | null }[];
}
