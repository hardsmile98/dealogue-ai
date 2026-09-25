/**
 * Тайминги агента — свои у каждого аккаунта, хранятся в jsonb и
 * дополняются значениями по умолчанию из docs/agent-architecture.md
 * (разделы 2.4, 3.2, 3.8). Диапазон означает случайное значение внутри него.
 */

export interface Range {
  min: number;
  max: number;
}

export interface Timings {
  /** Окно тишины после входящего, с. */
  quietWindowSec: Range;
  /** На сколько «печатает» продлевает окно тишины, с. */
  typingExtendSec: number;
  /** Верхняя граница ожидания тишины, с. */
  quietMaxSec: number;
  /** Первый ответ новому лиду, с. */
  newLeadReplySec: Range;
  /** Ответ, пока практик «в чате» после своего сообщения, с. */
  inChatReplySec: Range;
  /** Сколько минут после своего сообщения практик считается «в чате». */
  inChatWindowMin: number;
  /** Ответ, если клиент написал спустя `inChatWindowMin`…`recentWindowMin` минут, мин. */
  recentReplyMin: Range;
  recentWindowMin: number;
  /** Ответ, если клиент вернулся позже `recentWindowMin`, мин. */
  awayReplyMin: Range;
  /** Скорость «печатает», символов в секунду, и потолок на часть, с. */
  typingCharsPerSec: number;
  typingMaxSec: number;
  /** «Печатает» перед вехой (вставка из заметок), с. */
  blockTypingSec: Range;
  /** Пауза между частями ответа, с. */
  partPauseSec: Range;
  /** Диагностика после ссылок, мин. */
  diagnosticDelayMin: Range;
  /** Напоминание о данных рождения, мин. */
  birthDataReminderMin: Range;
  /** Вопрос-отклик после прочтения диагностики, мин. */
  returnQuestionMin: Range;
  /** Ступени лестницы молчания после диагностики, ч. */
  stepHours: Range;
  /** Напоминание о непрочитанном, ч. */
  unreadReminderHours: number;
  /** Напоминаний на чат, не больше. */
  maxReminders: number;
  /** Сколько ходов подряд можно пропускать подталкивание. */
  maxTurnsWithoutNudge: number;
}

export const DEFAULT_TIMINGS: Timings = {
  quietWindowSec: { min: 25, max: 45 },
  typingExtendSec: 15,
  quietMaxSec: 180,
  newLeadReplySec: { min: 60, max: 240 },
  inChatReplySec: { min: 10, max: 40 },
  inChatWindowMin: 5,
  recentReplyMin: { min: 1, max: 4 },
  recentWindowMin: 60,
  awayReplyMin: { min: 3, max: 12 },
  typingCharsPerSec: 6,
  typingMaxSec: 25,
  blockTypingSec: { min: 5, max: 10 },
  partPauseSec: { min: 3, max: 10 },
  diagnosticDelayMin: { min: 45, max: 75 },
  birthDataReminderMin: { min: 60, max: 90 },
  returnQuestionMin: { min: 45, max: 75 },
  stepHours: { min: 12, max: 16 },
  unreadReminderHours: 24,
  maxReminders: 3,
  maxTurnsWithoutNudge: 2,
};

type RangeKey = {
  [K in keyof Timings]: Timings[K] extends Range ? K : never;
}[keyof Timings];
type NumberKey = Exclude<keyof Timings, RangeKey>;

const RANGE_KEYS = Object.keys(DEFAULT_TIMINGS).filter(
  (key) => typeof DEFAULT_TIMINGS[key as keyof Timings] === 'object',
) as RangeKey[];
const NUMBER_KEYS = Object.keys(DEFAULT_TIMINGS).filter(
  (key) => typeof DEFAULT_TIMINGS[key as keyof Timings] === 'number',
) as NumberKey[];

/** Частично заданные тайминги (jsonb из базы или тело запроса). */
export type TimingsPatch = {
  [K in keyof Timings]?: Timings[K] extends Range ? Partial<Range> : Timings[K];
};

/**
 * Тайминги из jsonb поверх значений по умолчанию. Незнакомые ключи и
 * значения не того типа отбрасываются — база не должна ломать агента.
 */
export function readTimings(raw: unknown): Timings {
  return mergeTimings(DEFAULT_TIMINGS, (raw ?? {}) as TimingsPatch);
}

export function mergeTimings(base: Timings, patch: TimingsPatch): Timings {
  const result: Timings = { ...base };
  for (const key of RANGE_KEYS) {
    const value = patch[key];
    if (!value || typeof value !== 'object') continue;
    const min = typeof value.min === 'number' ? value.min : base[key].min;
    const max = typeof value.max === 'number' ? value.max : base[key].max;
    result[key] = { min, max };
  }
  for (const key of NUMBER_KEYS) {
    const value = patch[key];
    if (typeof value === 'number') result[key] = value;
  }
  return result;
}

/** Ошибки валидации, по одной строке на поле; пустой список — всё в порядке. */
export function validateTimings(timings: Timings): string[] {
  const errors: string[] = [];
  for (const key of RANGE_KEYS) {
    const { min, max } = timings[key];
    if (!isNonNegativeInt(min) || !isNonNegativeInt(max)) {
      errors.push(`${key}: ожидаются целые неотрицательные min и max`);
    } else if (min > max) {
      errors.push(`${key}: min больше max`);
    }
  }
  for (const key of NUMBER_KEYS) {
    if (!isNonNegativeInt(timings[key])) {
      errors.push(`${key}: ожидается целое неотрицательное число`);
    }
  }
  if (timings.typingCharsPerSec === 0)
    errors.push('typingCharsPerSec: не может быть 0');
  if (timings.quietMaxSec < timings.quietWindowSec.max) {
    errors.push('quietMaxSec: не меньше quietWindowSec.max');
  }
  return errors;
}

function isNonNegativeInt(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}
