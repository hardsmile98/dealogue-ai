import { clientTextForPrompt } from './client-text.js';
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

/** Сколько символов концовки вехи видят промпты. */
const MILESTONE_ENDING_LENGTH = 200;

/** Последний абзац текста — чем веха закончилась («Рассказать подробнее?»). */
function ending(text: string): string {
  const paragraphs = text.trim().split(/\n\s*\n/);
  const last = (paragraphs[paragraphs.length - 1] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return last.length > MILESTONE_ENDING_LENGTH
    ? `…${last.slice(-MILESTONE_ENDING_LENGTH)}`
    : last;
}

/**
 * История для промпта: тела вех заменяются заглушкой по реестру сказанного
 * с концовкой вехи (`[отправлена диагностика: … — заканчивается: «Рассказать
 * подробнее?»]`: на что клиент отвечает своим «да»), медиа — подписью, у
 * сообщений клиента убирается рекламная метка. Если следом идёт наше же
 * сообщение (продолжение длинной вехи или вопрос после неё), концовку
 * показывает оно. Старшие сообщения сверх лимита отбрасываются — их держит
 * резюме.
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
  const window = history.slice(-limit);
  return window.map((message, index) => {
    const milestone =
      message.direction === 'out'
        ? milestoneByMessage.get(message.id)
        : undefined;
    const own =
      message.direction === 'in'
        ? clientTextForPrompt(message.text)
        : message.text;
    let text: string;
    if (milestone) {
      const title = milestoneTitles[milestone] ?? milestone;
      const next = window[index + 1];
      text =
        next?.direction === 'out'
          ? `[отправлена ${title}]`
          : `[отправлена ${title} — заканчивается: «${ending(message.text)}»]`;
    } else if (message.mediaKind) {
      text =
        MEDIA_LABELS[message.mediaKind] ?? MEDIA_LABELS.other ?? '[вложение]';
      if (own && !own.startsWith('[')) text += ` ${own}`;
    } else {
      text = own;
    }
    return {
      role: message.direction === 'in' ? 'client' : 'practitioner',
      text,
      sentAt: message.sentAt,
    };
  });
}

/** Последнее наше сообщение или null. */
export function lastOutgoing(
  history: readonly HistoryMessage[],
): HistoryMessage | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i] as HistoryMessage;
    if (message.direction === 'out') return message;
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
export function repliesSince(
  history: readonly HistoryMessage[],
  messageId: number | null,
): number {
  let index = 0;
  if (messageId !== null) {
    const found = history.findIndex(
      (message) => message.direction === 'out' && message.id === messageId,
    );
    if (found >= 0) {
      index = found + 1;
      while (
        index < history.length &&
        (history[index] as HistoryMessage).direction === 'out'
      )
        index += 1;
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
export function unansweredIncoming(
  history: readonly HistoryMessage[],
  lastHandledMessageId: number,
): IncomingMessage[] {
  return history
    .filter(
      (message) =>
        message.direction === 'in' && message.id > lastHandledMessageId,
    )
    .map((message) => ({
      id: message.id,
      text: message.text,
      mediaKind: message.mediaKind,
      sentAt: message.sentAt,
    }));
}

/**
 * Видел ли клиент наше сообщение с таким id: стоит отметка «прочитано» или
 * он написал после него. Ответить, не прочитав, нельзя, а отметка может
 * прийти позже ответа (в песочнице её ставят руками). Одно правило для
 * плана и лестницы — иначе лестница ставит ступень, которую план отклонит.
 */
export function seenByClient(
  history: readonly HistoryMessage[],
  messageId: number | null,
): boolean {
  if (messageId === null) return false;
  const index = history.findIndex(
    (item) => item.direction === 'out' && item.id === messageId,
  );
  if (index < 0) return false;
  if ((history[index] as HistoryMessage).readAt) return true;
  return history.slice(index + 1).some((item) => item.direction === 'in');
}

/**
 * Писал ли клиент после нашего сообщения с таким id — например, после
 * диагностики. Тогда напоминание идёт по разговору, а не вопросом-откликом
 * «жду обратную связь»: отклик уже был.
 */
export function repliedAfter(
  history: readonly HistoryMessage[],
  messageId: number | null,
): boolean {
  if (messageId === null) return false;
  const index = history.findIndex(
    (item) => item.direction === 'out' && item.id === messageId,
  );
  return (
    index >= 0 &&
    history.slice(index + 1).some((item) => item.direction === 'in')
  );
}

/** Сообщение, которым доставлена веха, — из реестра сказанного. */
export function milestoneMessageId(
  said: readonly SaidEntry[],
  milestone: string,
): number | null {
  for (let i = said.length - 1; i >= 0; i--) {
    const entry = said[i] as SaidEntry;
    if (entry.kind === 'milestone' && entry.key === milestone)
      return entry.messageId;
  }
  return null;
}

export function milestoneAt(
  said: readonly SaidEntry[],
  milestone: string,
): Date | null {
  for (let i = said.length - 1; i >= 0; i--) {
    const entry = said[i] as SaidEntry;
    if (entry.kind === 'milestone' && entry.key === milestone) return entry.at;
  }
  return null;
}
