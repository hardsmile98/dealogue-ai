/** Зеркало AlertDto из apps/api/src/ai/ai.types.ts. */

export type AlertType =
  | 'handoff'
  | 'minor'
  | 'media'
  | 'stale_lead'
  | 'library_incomplete'
  | 'ai_error'
  | 'anomaly'
export type AlertStatus = 'open' | 'acknowledged' | 'resolved'

export interface AlertPayloadDto {
  /** Причина передачи менеджеру (для handoff). */
  reason?: string
  stage?: string | null
  lastClientText?: string
  draftId?: string
  turnId?: string
  error?: string
  detail?: string
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
