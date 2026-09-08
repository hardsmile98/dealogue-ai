import type { FetchBaseQueryError } from '@reduxjs/toolkit/query'
import type { Session } from '@/entities/session'
import type { Credentials } from '../model/types'

const MOCK_LOGIN = 'demo'
const MOCK_PASSWORD = 'demo1234'
const MOCK_LATENCY_MS = 700

type MockLoginResult = { data: Session } | { error: FetchBaseQueryError }

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Заглушка на время, пока в apps/api нет POST /auth/login.
 * Включается автоматически, когда не задан VITE_API_URL (см. shared/config).
 * Отвечает теми же кодами, что и реальный сервер, — обработка ошибок общая.
 */
export async function mockLogin(
  credentials: Credentials,
): Promise<MockLoginResult> {
  await delay(MOCK_LATENCY_MS)

  const loginMatches = credentials.login.trim().toLowerCase() === MOCK_LOGIN
  const passwordMatches = credentials.password === MOCK_PASSWORD

  if (!loginMatches || !passwordMatches) {
    return { error: { status: 401, data: { message: 'Invalid credentials' } } }
  }

  return {
    data: {
      accessToken: 'mock-access-token',
      user: { id: '1', login: MOCK_LOGIN, name: 'Демо-пользователь' },
    },
  }
}
