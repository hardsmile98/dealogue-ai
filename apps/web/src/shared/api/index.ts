export { baseApi } from './baseApi';
export { unauthorized } from './authEvents';
export { setAuthTokenProvider, getAuthToken } from './authToken';
export { connectRealtime } from './realtime';
export type { RealtimeConnection, RealtimeHandlers } from './realtime';

export {
  ACCOUNT_STATS_TAG,
  BOT_CHAT_TAG,
  BOT_EXAMPLES_TAG,
  BOT_HANDOFFS_TAG,
  BOT_LIBRARY_TAG,
  BOT_SANDBOX_LIST_TAG,
  BOT_SANDBOX_TAG,
  BOT_SETTINGS_TAG,
  CHAT_LIST_TAG,
  CHAT_TAG,
  MESSAGE_TAG,
  TELEGRAM_ACCOUNT_TAG,
} from './tags';

/**
 * Контракты backend-API. Реэкспортируются целиком: это зеркала серверных
 * типов, у них нет «внутренней» части, которую стоило бы прятать, а ручной
 * список имён всё равно устаревал при каждом изменении API.
 */
export * from './contracts/telegram';
export * from './contracts/realtime';
export * from './contracts/bot';
