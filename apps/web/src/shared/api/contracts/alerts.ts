/** Зеркало AlertDto из apps/api/src/ai/ai.types.ts. */

export type AlertType = 'ready_to_pay' | 'needs_human' | 'ai_error'
export type AlertStatus = 'open' | 'acknowledged' | 'resolved'

export interface AlertPayloadDto {
  reason?: string
  stage?: string | null
  confidence?: number
  lastClientText?: string
  aiRunId?: string
  error?: string
}

export interface AlertDto {
  id: string
  accountId: string
  /** null — алерт уровня аккаунта (ошибка провайдера). */
  chatId: string | null
  type: AlertType
  status: AlertStatus
  payload: AlertPayloadDto
  createdAt: string
  acknowledgedAt: string | null
  resolvedAt: string | null
  chat: { peerName: string; peerUsername: string | null } | null
  account: { displayName: string; phone: string } | null
}

export interface AlertsQuery {
  /** Через запятую: open,acknowledged,resolved. */
  status?: string
  accountId?: string
}

export interface AlertsCountDto {
  open: number
}
