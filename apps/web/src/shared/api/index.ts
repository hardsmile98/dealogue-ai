export { baseApi } from './baseApi'
export { unauthorized } from './authEvents'
export { setAuthTokenProvider, getAuthToken } from './authToken'
export { connectRealtime } from './realtime'
export type { RealtimeConnection } from './realtime'

export { ACCOUNT_STATS_TAG, CHAT_TAG, MESSAGE_TAG, TELEGRAM_ACCOUNT_TAG } from './tags'

/**
 * Контракты backend-API. Реэкспортируются целиком: это зеркала серверных
 * типов, у них нет «внутренней» части, которую стоило бы прятать, а ручной
 * список имён всё равно устаревал при каждом изменении API.
 */
export * from './contracts/telegram'
export * from './contracts/realtime'
