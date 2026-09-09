/**
 * События, которые сервер шлёт в браузер по SSE.
 * Зеркало: apps/web/src/shared/api/contracts/realtime.ts.
 */
export type RealtimeEvent =
  | { type: 'ping'; at: string }
  | { type: 'alert.created'; accountId: string; chatId: string | null; alertId: string; alertType: string }
  | { type: 'alert.updated'; accountId: string; chatId: string | null; alertId: string; status: string }
  | { type: 'chat.updated'; accountId: string; chatId: string }
  | { type: 'message.created'; accountId: string; chatId: string }
  | { type: 'ai.run'; accountId: string; chatId: string; status: string }
  | {
      type: 'learning.progress';
      accountId: string;
      job: 'import' | 'digest';
      status: 'running' | 'done' | 'error';
      done: number;
      total: number;
      stage?: string;
      error?: string;
    };
