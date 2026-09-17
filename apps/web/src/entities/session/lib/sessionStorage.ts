import type { Session } from '../model/types'
import { isTokenExpired } from './jwt'

const STORAGE_KEY = 'dealogue.auth.session'

export interface StoredSessionRead {
  /** null, если сессии не было или её токен уже истёк. */
  session: Session | null
  /** true, когда сохранённая сессия была отброшена из-за истёкшего токена. */
  expired: boolean
}

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<Session>
  return typeof candidate.accessToken === 'string' && Boolean(candidate.user)
}

/**
 * «Запомнить меня» = localStorage (переживает перезапуск браузера),
 * иначе sessionStorage (живёт до закрытия вкладки).
 */
export function writeStoredSession(session: Session, remember: boolean): void {
  const target = remember ? localStorage : sessionStorage
  const other = remember ? sessionStorage : localStorage

  try {
    other.removeItem(STORAGE_KEY)
    target.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    // Хранилище недоступно (приватный режим, отключённые cookie) —
    // сессия останется только в памяти до перезагрузки страницы.
  }
}

/**
 * Читает сессию при старте приложения. Истёкший токен не восстанавливаем:
 * иначе пользователь попадал бы в интерфейс, где каждый запрос отвечает 401.
 */
export function readStoredSession(): StoredSessionRead {
  let raw: string | null = null
  try {
    raw =
      localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return { session: null, expired: false }
  }

  if (!raw) return { session: null, expired: false }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    clearStoredSession()
    return { session: null, expired: false }
  }

  if (!isSession(parsed)) {
    clearStoredSession()
    return { session: null, expired: false }
  }

  if (isTokenExpired(parsed.accessToken)) {
    clearStoredSession()
    return { session: null, expired: true }
  }

  return { session: parsed, expired: false }
}

export function clearStoredSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Чистить нечего.
  }
}
