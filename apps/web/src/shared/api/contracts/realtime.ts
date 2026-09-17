/** Зеркало apps/api/src/realtime/realtime.types.ts. */
export type RealtimeEvent =
  | { type: 'ping'; at: string }
  | { type: 'alert.created'; accountId: string; chatId: string | null; alertId: string; alertType: string }
  | { type: 'alert.updated'; accountId: string; chatId: string | null; alertId: string; status: string }
  | { type: 'chat.updated'; accountId: string; chatId: string }
  | { type: 'message.created'; accountId: string; chatId: string }
  /** Собеседник прочитал наши сообщения до maxId включительно. */
  | { type: 'message.read'; accountId: string; chatId: string; maxId: number }
  | { type: 'settings.updated'; accountId: string }
  | { type: 'draft.created'; accountId: string; chatId: string; draftId: string }
  | { type: 'draft.updated'; accountId: string; chatId: string; draftId: string; status: string }
  | {
      type: 'funnel.updated'
      accountId: string
      chatId: string
      stage: string
      mode: string
      nextTouchAt: string | null
    }
  | { type: 'turn.sent'; accountId: string; chatId: string; turnId: string }

export interface RealtimeTicketResponse {
  ticket: string
  expiresInSec: number
}
