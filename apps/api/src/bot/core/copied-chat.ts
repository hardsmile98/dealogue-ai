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
/** Абзац диагностики короче (после нормализации) слишком общий, чтобы узнавать по нему веху. */
const PARAGRAPH_MIN = 40;

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
 *
 * Диагностику агент отправляет подстроенной под клиента (core/personalize.ts):
 * её начало могло поменяться, но большая часть абзацев — как в библиотеке.
 * Поэтому исходящее без начала какой-либо вехи — диагностика, если в нём
 * есть начало хотя бы одного её абзаца; продолжение той же диагностики
 * (следующая часть разрезанного текста) второй раз не считается.
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
  const paragraphs = bodies
    .filter((body) => body.key === 'diagnostic')
    .flatMap((body) => body.text.split('\n'))
    .map((paragraph) => normalize(paragraph))
    .filter((paragraph) => paragraph.length >= PARAGRAPH_MIN)
    .map((paragraph) => paragraph.slice(0, BODY_PREFIX));
  const found = new Map<Milestone, FoundMilestone>();
  // Веха, найденная в текущей серии наших сообщений подряд.
  let inRun: Milestone | null = null;
  for (const message of history) {
    if (message.direction !== 'out') {
      inRun = null;
      continue;
    }
    const text = normalize(message.text);
    const byPrefix = patterns.find((pattern) =>
      text.includes(pattern.prefix),
    )?.key;
    const key: Milestone | null =
      byPrefix ??
      (inRun !== 'diagnostic' &&
      paragraphs.some((paragraph) => text.includes(paragraph))
        ? 'diagnostic'
        : null);
    if (!key) continue;
    inRun = key;
    found.set(key, { key, messageId: message.id, at: message.sentAt });
  }
  return [...found.values()].sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Просьба о данных из копии чата — запись реестра сказанного. */
export interface CopiedRequest {
  key: 'ask_birth_data' | 'ask_birth_date';
  messageId: number;
  at: Date;
}

/**
 * Просьбы о данных в копии чата: каждое исходящее до первой вехи — вопрос
 * знакомства (первое — просьба о дате, месте и сфере, следующие —
 * повторные), не больше `limit`. Решение по месту сообщения, а не по
 * тексту: иначе агент в копии чата, который вёл человек, здоровается и
 * просит данные заново.
 */
export function copiedIntakeRequests(
  history: readonly HistoryMessage[],
  milestones: readonly FoundMilestone[],
  limit: number,
): CopiedRequest[] {
  const firstMilestone = milestones[0]?.messageId ?? Number.POSITIVE_INFINITY;
  const requests: CopiedRequest[] = [];
  for (const message of history) {
    if (message.id >= firstMilestone) break;
    if (message.direction !== 'out' || message.mediaKind) continue;
    if (requests.length >= limit) break;
    requests.push({
      key: requests.length === 0 ? 'ask_birth_data' : 'ask_birth_date',
      messageId: message.id,
      at: message.sentAt,
    });
  }
  return requests;
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
