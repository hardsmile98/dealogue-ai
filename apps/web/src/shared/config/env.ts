const rawApiUrl = import.meta.env.VITE_API_URL ?? ''

/** Базовый URL backend-API без завершающего слэша. */
export const API_URL = rawApiUrl.replace(/\/+$/, '')

/**
 * Если VITE_API_URL не задан — приложение работает на локальном моке
 * и не ходит в сеть. См. features/auth/login/api/mockLogin.ts.
 */
export const IS_MOCK_API = API_URL === ''
