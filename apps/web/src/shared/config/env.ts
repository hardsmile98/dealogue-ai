const rawApiUrl = import.meta.env.VITE_API_URL ?? ''

/** Базовый URL backend-API без завершающего слэша. */
export const API_URL = rawApiUrl.replace(/\/+$/, '')

/**
 * Если VITE_API_URL не задан — форма входа работает на локальном моке
 * и не ходит в сеть. См. features/auth/login/api/mockLogin.ts.
 * Раздел Telegram мока не имеет и всегда ходит в /telegram/* backend'а.
 */
export const IS_MOCK_API = API_URL === ''
