import { decodeCursor, encodeCursor, isIsoDate } from './cursor.js';

/**
 * Курсор страницы переписки. Страницы идут от новых сообщений к старым:
 * курсор — ключ сортировки самого старого сообщения на странице, следующая
 * страница — всё, что строго раньше него. Сортировка по времени, при
 * равенстве — по id сообщения в Telegram (у импортированной истории время
 * и id расходятся, поэтому одного id мало).
 */
export interface MessageCursor {
  sentAt: string;
  telegramMessageId: number;
}

export function encodeMessageCursor(message: {
  sentAt: Date;
  telegramMessageId: number;
}): string {
  return encodeCursor({
    sentAt: message.sentAt.toISOString(),
    telegramMessageId: message.telegramMessageId,
  });
}

/** Разбирает курсор из запроса; null — курсор испорчен или подделан. */
export function decodeMessageCursor(raw: string): MessageCursor | null {
  const fields = decodeCursor(raw);
  if (!fields) return null;
  const { sentAt, telegramMessageId } = fields;
  if (!isIsoDate(sentAt)) return null;
  if (
    typeof telegramMessageId !== 'number' ||
    !Number.isSafeInteger(telegramMessageId) ||
    telegramMessageId < 0
  ) {
    return null;
  }
  return { sentAt, telegramMessageId };
}
