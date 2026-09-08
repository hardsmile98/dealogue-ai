const rawApiUrl = import.meta.env.VITE_API_URL ?? ''

/** Базовый URL backend-API без завершающего слэша. */
export const API_URL = rawApiUrl.replace(/\/+$/, '')

/**
 * Если VITE_API_URL не задан — приложение работает на локальном моке
 * и не ходит в сеть. См. features/auth/login/api/mockLogin.ts.
 */
export const IS_MOCK_API = API_URL === ''

/**
 * Раздел Telegram работает на моке, пока в apps/api нет соответствующих
 * эндпоинтов. Мок включён по умолчанию; чтобы ходить в реальный API,
 * задайте VITE_MOCK_TELEGRAM=false. Без VITE_API_URL мок включён всегда.
 */
export const IS_MOCK_TELEGRAM =
  IS_MOCK_API || (import.meta.env.VITE_MOCK_TELEGRAM ?? 'true') !== 'false'
