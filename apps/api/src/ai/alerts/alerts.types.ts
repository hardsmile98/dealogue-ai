import type { AlertEntity, AlertPayload, AlertStatus, AlertType } from '../entities/alert.entity.js';

/**
 * Алерты наружу — зеркало apps/web/src/shared/api/contracts/alerts.
 * Менять синхронно.
 */
export interface AlertDto {
  id: string;
  accountId: string;
  chatId: string | null;
  type: AlertType;
  status: AlertStatus;
  payload: AlertPayload;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  /** Для списка: имя собеседника и аккаунт. */
  chat: { peerName: string; peerUsername: string | null } | null;
  account: { displayName: string; phone: string } | null;
}

export function toAlertDto(
  row: AlertEntity,
  chat: { peerName: string; peerUsername: string | null } | null,
  account: { displayName: string; phone: string } | null,
): AlertDto {
  return {
    id: row.id,
    accountId: row.accountId,
    chatId: row.chatId,
    type: row.type,
    status: row.status,
    payload: row.payload,
    createdAt: row.createdAt.toISOString(),
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    chat,
    account,
  };
}
