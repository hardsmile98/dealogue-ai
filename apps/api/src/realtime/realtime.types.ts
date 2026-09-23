/**
 * События, которые сервер шлёт в браузер по SSE.
 * Зеркало: apps/web/src/shared/api/contracts/realtime.ts.
 */
export type RealtimeEvent =
  | { type: 'ping'; at: string }
  | { type: 'message.created'; accountId: string; chatId: string }
  /** Собеседник прочитал наши сообщения до maxId включительно. */
  | { type: 'message.read'; accountId: string; chatId: string; maxId: number };
