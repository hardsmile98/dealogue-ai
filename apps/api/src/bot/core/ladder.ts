import type { Stage } from '../library/kinds.js';
import type { Range, Timings } from '../library/timings.js';
import { milestoneAt } from './history.js';
import { hasBirthData, nudgesSaid } from './memory.js';
import type { ClientCard, HistoryMessage, JobKind, SaidEntry } from './types.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Задания, которые ставит лестница. `reply` (повтор ответа после сбоя) ей не принадлежит. */
export const LADDER_KINDS: readonly JobKind[] = [
  'birth_data_reminder',
  'diagnostic',
  'return_question',
  'offer',
  'offer_nudge',
  'prices',
  'unread_reminder',
];

export interface LadderInput {
  /** Зерно случайного интервала: один чат и одна точка отсчёта — одно время. */
  chatId: string;
  stage: Stage;
  card: ClientCard;
  said: readonly SaidEntry[];
  /** История по возрастанию времени, с отметками прочтения. */
  history: readonly HistoryMessage[];
  remindersSent: number;
  timings: Timings;
}

export interface LadderStep {
  kind: JobKind;
  runAt: Date;
  /** От чего отсчитано — для журнала и песочницы. */
  reason: string;
}

/**
 * Детерминированное «случайное» значение в [0, 1) по строке (FNV-1a).
 * Лестница пересчитывается после каждого хода и каждого прочтения — с
 * настоящим Math.random время ступени прыгало бы при каждом пересчёте.
 */
export function stableFraction(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

function pick(seed: string, range: Range): number {
  return range.min + Math.floor(stableFraction(seed) * (range.max - range.min + 1));
}

function lastSaidAt(said: readonly SaidEntry[], kind: SaidEntry['kind'], key: string): Date | null {
  for (let index = said.length - 1; index >= 0; index -= 1) {
    const entry = said[index] as SaidEntry;
    if (entry.kind === kind && entry.key === key) return entry.at;
  }
  return null;
}

/**
 * Следующая ступень лестницы молчания (docs/agent-architecture.md, 2.4) —
 * одна, из текущего состояния чата. Чистая функция: её результат заменяет
 * все ожидающие ступени после каждого хода и каждого «прочитано», поэтому
 * отмена и перепостановка — это просто пересчёт.
 *
 * - `links`: обещанная диагностика уходит по таймеру, прочитано или нет;
 *   после напоминания о данных таймер отсчитывается от напоминания.
 * - Последнее сообщение агента не прочитано — одно напоминание через
 *   `unreadReminderHours`, дальше ступени не ставятся.
 * - Прочитано — следующая ступень этапа от момента прочтения. Напоминаний
 *   не больше `maxReminders`; вехи в лимит не входят, поэтому при лимите
 *   ступень-напоминание пропускается и сразу идёт веха.
 * - Последнее сообщение клиента без ответа, этап цен, агент ещё не писал —
 *   ступеней нет.
 */
export function nextLadderStep(input: LadderInput): LadderStep | null {
  const { stage, said, history, timings } = input;
  if (stage === 'prices') return null;
  const last = history[history.length - 1];
  if (!last || last.direction !== 'out') return null;

  const step = (kind: JobKind, anchor: Date, range: Range, unit: number, reason: string): LadderStep => ({
    kind,
    runAt: new Date(anchor.getTime() + pick(`${input.chatId}:${kind}:${anchor.toISOString()}`, range) * unit),
    reason,
  });
  const remindersLeft = input.remindersSent < timings.maxReminders;

  if (stage === 'links') {
    const linksAt = milestoneAt(said, 'links');
    if (!linksAt) return null;
    const reminderAt = lastSaidAt(said, 'nudge', 'birth_data_reminder');
    return reminderAt && reminderAt > linksAt
      ? step('diagnostic', reminderAt, timings.diagnosticDelayMin, MINUTE, 'после напоминания о данных')
      : step('diagnostic', linksAt, timings.diagnosticDelayMin, MINUTE, 'после ссылок');
  }

  if (!last.readAt) {
    const alreadyReminded = said.some((entry) => entry.kind === 'nudge' && entry.key === 'unread_reminder' && entry.messageId === last.id);
    if (!remindersLeft || alreadyReminded) return null;
    return {
      kind: 'unread_reminder',
      runAt: new Date(last.sentAt.getTime() + timings.unreadReminderHours * HOUR),
      reason: 'последнее сообщение не прочитано',
    };
  }

  const readAt = last.readAt;
  switch (stage) {
    case 'intake': {
      const asked = nudgesSaid(said, 'ask_birth_data') > 0;
      const reminded = nudgesSaid(said, 'birth_data_reminder') > 0;
      if (hasBirthData(input.card) || !asked || reminded) return null;
      return step('birth_data_reminder', readAt, timings.birthDataReminderMin, MINUTE, 'просьба о данных прочитана');
    }
    case 'diagnostic':
      if (remindersLeft && nudgesSaid(said, 'ask_feedback') === 0) {
        return step('return_question', readAt, timings.returnQuestionMin, MINUTE, 'диагностика прочитана');
      }
      return step('offer', readAt, timings.stepHours, HOUR, 'клиент молчит после диагностики');
    case 'offer':
      if (remindersLeft && nudgesSaid(said, 'ask_offer_questions') === 0) {
        return step('offer_nudge', readAt, timings.stepHours, HOUR, 'описание практик прочитано');
      }
      return step('prices', readAt, timings.stepHours, HOUR, 'клиент молчит после предложения');
    default:
      return null;
  }
}
