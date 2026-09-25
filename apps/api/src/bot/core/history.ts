import type { HistoryMessage, IncomingMessage, SaidEntry } from './types.js';

/** Сколько сообщений истории идёт в промпт (раздел 7). */
export const HISTORY_LIMIT = 60;

/** Подписи медиа в истории — модели достаточно знать, что это было. */
const MEDIA_LABELS: Record<string, string> = {
  photo: '[фото]',
  voice: '[голосовое]',
  video: '[видео]',
  video_note: '[видеосообщение]',
  audio: '[аудио]',
  document: '[файл]',
  sticker: '[стикер]',
  other: '[вложение]',
};

export interface HistoryLine {
  role: 'client' | 'practitioner';
  text: string;
  sentAt: Date;
}

/**
 * История для промпта: тела вех заменяются заглушкой по реестру сказанного
 * (`[отправлена диагностика: …]`), медиа — подписью. Старшие сообщения
 * сверх лимита отбрасываются — их держит резюме.
 */
export function formatHistory(
  history: readonly HistoryMessage[],
  said: readonly SaidEntry[],
  milestoneTitles: Readonly<Record<string, string>>,
  limit = HISTORY_LIMIT,
): HistoryLine[] {
  const milestoneByMessage = new Map<number, string>();
  for (const entry of said) {
    if (entry.kind === 'milestone' && entry.messageId !== null) {
      milestoneByMessage.set(entry.messageId, entry.key);
    }
  }
  return history.slice(-limit).map((message) => {
    const milestone = message.direction === 'out' ? milestoneByMessage.get(message.id) : undefined;
    let text: string;
    if (milestone) {
      text = `[отправлена ${milestoneTitles[milestone] ?? milestone}]`;
    } else if (message.mediaKind) {
      text = MEDIA_LABELS[message.mediaKind] ?? MEDIA_LABELS.other ?? '[вложение]';
      if (message.text && !message.text.startsWith('[')) text += ` ${message.text}`;
    } else {
      text = message.text;
    }
    return { role: message.direction === 'in' ? 'client' : 'practitioner', text, sentAt: message.sentAt };
  });
}

/** Последнее наше сообщение или null. */
export function lastOutgoing(history: readonly HistoryMessage[]): HistoryMessage | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i] as HistoryMessage;
    if (message.direction === 'out') return message;
  }
  return null;
}

/** Последнее сообщение клиента или null. */
export function lastIncoming(history: readonly HistoryMessage[]): HistoryMessage | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i] as HistoryMessage;
    if (message.direction === 'in') return message;
  }
  return null;
}

/**
 * Сколько наших ответов было после сообщения вехи `messageId` (или с начала
 * переписки, если null). Ответ — непрерывная серия исходящих; серия, в
 * которой ушла сама веха, не считается. Считается по истории, а не по
 * журналу ходов, — одинаково для Telegram, песочницы с виртуальными часами и
 * чата, скопированного в песочницу. Веха старше окна истории — считаются
 * все ответы в окне (для порогов плана этого достаточно).
 */
export function repliesSince(history: readonly HistoryMessage[], messageId: number | null): number {
  let index = 0;
  if (messageId !== null) {
    const found = history.findIndex((message) => message.direction === 'out' && message.id === messageId);
    if (found >= 0) {
      index = found + 1;
      while (index < history.length && (history[index] as HistoryMessage).direction === 'out') index += 1;
    }
  }
  let count = 0;
  let inReply = false;
  for (; index < history.length; index += 1) {
    const outgoing = (history[index] as HistoryMessage).direction === 'out';
    if (outgoing && !inReply) count += 1;
    inReply = outgoing;
  }
  return count;
}

/**
 * Сообщения клиента, на которые агент ещё не отвечал: входящие после
 * последнего обработанного. По ним поллер понимает, что вместо ступени
 * нужен ответ клиенту, а повтор после сбоя — на что отвечать.
 */
export function unansweredIncoming(history: readonly HistoryMessage[], lastHandledMessageId: number): IncomingMessage[] {
  return history
    .filter((message) => message.direction === 'in' && message.id > lastHandledMessageId)
    .map((message) => ({ id: message.id, text: message.text, mediaKind: message.mediaKind, sentAt: message.sentAt }));
}

/** Прочитал ли клиент сообщение с таким id (по `readAt`). */
export function isRead(history: readonly HistoryMessage[], messageId: number | null): boolean {
  if (messageId === null) return false;
  const message = history.find((item) => item.direction === 'out' && item.id === messageId);
  return message?.readAt !== null && message?.readAt !== undefined;
}

/** Сообщение, которым доставлена веха, — из реестра сказанного. */
export function milestoneMessageId(said: readonly SaidEntry[], milestone: string): number | null {
  for (let i = said.length - 1; i >= 0; i--) {
    const entry = said[i] as SaidEntry;
    if (entry.kind === 'milestone' && entry.key === milestone) return entry.messageId;
  }
  return null;
}

export function milestoneAt(said: readonly SaidEntry[], milestone: string): Date | null {
  for (let i = said.length - 1; i >= 0; i--) {
    const entry = said[i] as SaidEntry;
    if (entry.kind === 'milestone' && entry.key === milestone) return entry.at;
  }
  return null;
}
