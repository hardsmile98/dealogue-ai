import type { Session } from '../model/types'

const STORAGE_KEY = 'dealogue.auth.session'

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

export function readStoredSession(): Session | null {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed: unknown = JSON.parse(raw)
    return isSession(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function clearStoredSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Чистить нечего.
  }
}
