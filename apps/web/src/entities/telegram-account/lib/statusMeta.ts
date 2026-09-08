import type { AccountStatus } from '../model/types'

export interface StatusMeta {
  label: string
  /** Цвет MUI Chip — статус всегда сопровождается подписью, не только цветом. */
  color: 'success' | 'warning' | 'default' | 'error'
  description: string
}

export const ACCOUNT_STATUS_META: Record<AccountStatus, StatusMeta> = {
  connected: {
    label: 'Подключён',
    color: 'success',
    description: 'Сообщения синхронизируются',
  },
  pending: {
    label: 'Ожидает подтверждения',
    color: 'warning',
    description: 'Вход не завершён — нужен код или пароль',
  },
  disconnected: {
    label: 'Отключён',
    color: 'default',
    description: 'Сессия завершена, нужно переподключить',
  },
  error: {
    label: 'Ошибка',
    color: 'error',
    description: 'Синхронизация остановлена',
  },
}

/** Статусы, при которых уместно предложить переподключение. */
export function needsReconnect(status: AccountStatus): boolean {
  return status === 'disconnected' || status === 'error' || status === 'pending'
}
