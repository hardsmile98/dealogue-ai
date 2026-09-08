export interface AuthUser {
  id: string
  login: string
  name: string
}

export interface Session {
  accessToken: string
  user: AuthUser
}

export interface SessionState {
  current: Session | null
}

/**
 * Минимальная форма состояния, нужная селекторам этого entity.
 * Позволяет не импортировать RootState из слоя app (запрещённый вверх-импорт):
 * RootState структурно подходит под этот интерфейс.
 */
export interface WithSessionState {
  session: SessionState
}
