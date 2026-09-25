import type { Milestone } from '../library/kinds.js';
import type { HistoryMessage } from './types.js';

/** Тело вехи из библиотеки аккаунта — образец, с которым сравниваются исходящие. */
export interface MilestoneBody {
  key: Milestone;
  text: string;
}

export interface FoundMilestone {
  key: Milestone;
  messageId: number;
  at: Date;
}

/** Сколько начальных символов тела (после нормализации) должно найтись в сообщении. */
const BODY_PREFIX = 60;

/** Только буквы и цифры в нижнем регистре: переносы, эмодзи и знаки не мешают сравнению. */
function normalize(text: string): string {
  let result = '';
  for (const char of text.toLowerCase()) {
    if (
      char.toLowerCase() !== char.toUpperCase() ||
      (char >= '0' && char <= '9')
    )
      result += char;
  }
  return result;
}

/**
 * Вехи в переписке, скопированной из реального чата: исходящее сообщение, в
 * котором есть начало тела вехи из библиотеки (менеджер вставлял тот же
 * текст; Telegram мог разрезать длинный на части — хватает первой). Это
 * сравнение с собственными текстами библиотеки, а не разбор смысла. На
 * каждую веху — последнее такое сообщение.
 */
export function findMilestones(
  history: readonly HistoryMessage[],
  bodies: readonly MilestoneBody[],
): FoundMilestone[] {
  const patterns = bodies
    .map((body) => ({
      key: body.key,
      prefix: normalize(body.text).slice(0, BODY_PREFIX),
    }))
    .filter((pattern) => pattern.prefix.length >= 20);
  const found = new Map<Milestone, FoundMilestone>();
  for (const message of history) {
    if (message.direction !== 'out') continue;
    const text = normalize(message.text);
    const match = patterns.find((pattern) => text.includes(pattern.prefix));
    if (match)
      found.set(match.key, {
        key: match.key,
        messageId: message.id,
        at: message.sentAt,
      });
  }
  return [...found.values()].sort((a, b) => a.at.getTime() - b.at.getTime());
}

/**
 * Последнее сообщение клиента, на которое уже ответили: входящие после
 * последнего нашего сообщения — это новый ход, остальные обработаны.
 */
export function lastAnsweredIncoming(
  history: readonly HistoryMessage[],
): number | null {
  let lastOut = -1;
  history.forEach((message, index) => {
    if (message.direction === 'out') lastOut = index;
  });
  for (let index = lastOut; index >= 0; index -= 1) {
    const message = history[index] as HistoryMessage;
    if (message.direction === 'in') return message.id;
  }
  return null;
}
