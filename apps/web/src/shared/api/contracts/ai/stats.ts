/**
 * Статистика ИИ-агента: воронка, ходы, черновики, отклик на тексты.
 */

export interface StatsRangeDto {
  /** `YYYY-MM-DD` в таймзоне аккаунта. */
  from: string
  to: string
  days: number
}

export interface StatsQuery {
  accountId: string
  from?: string
  to?: string
}

export interface FunnelStatsDto {
  range: StatsRangeDto
  stages: { stage: string; entered: number; advanced: number; handoff: number }[]
  leads: {
    started: number
    diagnosticsSent: number
    diagnosticsRead: number
    diagnosticsReadRate: number | null
    medianMinutesToDiagnostics: number | null
  }
  reengage: { sent: number; replied: number; replyRate: number | null }
  handoffs: number
}

export interface TurnStatsDto {
  range: StatsRangeDto
  total: number
  sent: number
  dryRun: number
  silent: number
  handoff: number
  error: number
  awaitingApproval: number
  silentRate: number | null
  regeneratedRate: number | null
  handoffRate: number | null
  avgConfidence: number | null
  tokensIn: number
  tokensOut: number
  handoffReasons: { reason: string; count: number }[]
}

export interface DraftStatsDto {
  range: StatsRangeDto
  created: number
  decided: number
  byStatus: { status: string; count: number; share: number | null }[]
}

export interface LibraryStatsDto {
  range: StatsRangeDto
  byKind: { kind: string; sent: number; replied: number; replyRate: number | null }[]
  items: { id: string; title: string; kind: string; sent: number; replied: number; replyRate: number | null }[]
}
