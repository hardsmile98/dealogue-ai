import { decodeCursor, encodeCursor, isIsoDate } from './cursor.js';

/**
 * Курсор страницы чатов. Список отсортирован по времени последнего
 * сообщения (чаты без сообщений — в конце), затем по id, и курсор — это ключ
 * сортировки последнего чата на странице: следующая страница начинается
 * строго после него. В отличие от OFFSET, чат, который поднялся наверх из-за
 * нового сообщения, не сдвигает остальные — страницы не дублируются.
 */
export interface ChatCursor {
  /** ISO-время последнего сообщения; null — у чата ещё нет сообщений. */
  lastMessageAt: string | null;
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeChatCursor(chat: {
  lastMessageAt: Date | null;
  id: string;
}): string {
  return encodeCursor({
    lastMessageAt: chat.lastMessageAt?.toISOString() ?? null,
    id: chat.id,
  });
}

/** Разбирает курсор из запроса; null — курсор испорчен или подделан. */
export function decodeChatCursor(raw: string): ChatCursor | null {
  const fields = decodeCursor(raw);
  if (!fields) return null;
  const { lastMessageAt, id } = fields;
  if (typeof id !== 'string' || !UUID.test(id)) return null;
  if (lastMessageAt !== null && !isIsoDate(lastMessageAt)) return null;
  return { lastMessageAt, id };
}
