export { baseApi } from './baseApi'
export { unauthorized } from './authEvents'
export { setAuthTokenProvider, getAuthToken } from './authToken'
export { connectRealtime } from './realtime'
export type { RealtimeConnection } from './realtime'

export {
  ACCOUNT_STATS_TAG,
  AI_CHAT_TAG,
  AI_DRAFT_TAG,
  AI_HEALTH_TAG,
  AI_LIBRARY_TAG,
  AI_OVERVIEW_TAG,
  AI_SETTINGS_TAG,
  AI_STATS_TAG,
  AI_TURNS_TAG,
  ALERT_TAG,
  CHAT_TAG,
  MESSAGE_TAG,
  TELEGRAM_ACCOUNT_TAG,
} from './tags'

/**
 * Контракты backend-API. Реэкспортируются целиком: это зеркала серверных
 * типов, у них нет «внутренней» части, которую стоило бы прятать, а ручной
 * список имён всё равно устаревал при каждом изменении API.
 */
export * from './contracts/telegram'
export * from './contracts/ai'
export * from './contracts/alerts'
export * from './contracts/realtime'
