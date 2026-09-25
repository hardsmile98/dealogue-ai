/** Зеркало apps/api/src/realtime/realtime.types.ts. */
export type RealtimeEvent =
  | { type: 'ping'; at: string }
  | { type: 'message.created'; accountId: string; chatId: string }
  /** Собеседник прочитал наши сообщения до maxId включительно. */
  | { type: 'message.read'; accountId: string; chatId: string; maxId: number };

export interface RealtimeTicketResponse {
  ticket: string;
  expiresInSec: number;
}
