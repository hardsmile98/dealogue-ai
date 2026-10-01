import type { Stage } from '../library/kinds.js';
import type { Range, Timings } from '../library/timings.js';
import {
  lastOutgoing,
  milestoneAt,
  milestoneMessageId,
  repliedAfter,
} from './history.js';
import { lastIntakeQuestion, nudgesSaid, objectionPending } from './memory.js';
import type { IntakeQuestionNudge } from './memory.js';
import type { HistoryMessage, JobKind, SaidEntry } from './types.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Как вопрос знакомства называется в причине ступени (журнал, песочница). */
const INTAKE_QUESTION_TITLES: Record<IntakeQuestionNudge, string> = {
  ask_birth_data: 'запрос даты, места и сферы',
  ask_birth_date: 'повторный запрос даты рождения',
  ask_sphere: 'вопрос о сфере',
  clarify_request: 'уточняющий вопрос',
};

/**
 * Задания лестницы — пересчёт заменяет все ожидающие этих видов. `offer` —
 * варианты по таймеру после молчания; `prices` она больше не ставит, но
 * держит в списке, чтобы снять старые.
 * `reply` (повтор ответа после сбоя) ей не принадлежит.
 */
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
  said: readonly SaidEntry[];
  /** История по возрастанию времени, с отметками прочтения. */
  history: readonly HistoryMessage[];
  /** Последнее сообщение клиента, которое агент уже обработал (ответил или сознательно промолчал). */
  lastHandledMessageId: number;
  remindersSent: number;
  timings: Timings;
  /**
   * Дата рождения известна (с годом) или её не будет. Тогда молчание на
   * знакомстве (вопрос о сфере, уточнение) ведёт сразу к диагностике, без
   * напоминания — как в реальной переписке (решение владельца 01.10.2026).
   */
  dateKnown: boolean;
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
  return (
    range.min + Math.floor(stableFraction(seed) * (range.max - range.min + 1))
  );
}

/**
 * Следующая ступень лестницы молчания (docs/agent-architecture.md, 2.4) —
 * одна, из текущего состояния чата. Чистая функция: её результат заменяет
 * все ожидающие ступени после каждого хода и каждого «прочитано», поэтому
 * отмена и перепостановка — это просто пересчёт.
 *
 * - `intake`: клиент молчит после вопроса знакомства. Даты ещё нет — одно
 *   напоминание, дальше диагностика по тому, что известно (без сферы —
 *   общая). Дата есть, а молчит на вопрос о том, что беспокоит, или на
 *   уточнение — диагностика сразу, без напоминания (решение 01.10.2026).
 * - `links`: обещанная диагностика уходит по таймеру, прочитано или нет.
 * - После диагностики: вопрос-отклик, а если клиент молчит и дальше —
 *   варианты по таймеру через `offerAfterSilenceHours` после диагностики
 *   (решение владельца 01.10.2026). Клиент уже отвечал после диагностики —
 *   напоминание по разговору (план выберет `follow_up`), вариантов по
 *   таймеру нет. После вариантов — только напоминания: цены уходят по
 *   реакции клиента.
 * - Последнее сообщение агента не прочитано — одно напоминание через
 *   `unreadReminderHours`, дальше ступени не ставятся.
 * - Напоминаний любого вида не больше `maxReminders` на чат; лимит
 *   кончился или клиента отпустили после повторных возражений — агент
 *   ждёт клиента.
 * - Последнее сообщение клиента без ответа, этап цен, агент ещё не писал —
 *   ступеней нет. Если агент на сообщения клиента сознательно промолчал
 *   («ок» во время ожидания), они обработаны: лестница идёт дальше, а
 *   молчание отсчитывается от последнего сообщения клиента.
 */
export function nextLadderStep(input: LadderInput): LadderStep | null {
  const { stage, said, history, timings } = input;
  if (stage === 'prices') return null;
  const latest = history[history.length - 1];
  if (!latest) return null;
  const clientLast = latest.direction === 'in';
  if (clientLast && latest.id > input.lastHandledMessageId) return null;
  const last = lastOutgoing(history);
  if (!last) return null;

  const step = (
    kind: JobKind,
    anchor: Date,
    range: Range,
    unit: number,
    reason: string,
  ): LadderStep => ({
    kind,
    runAt: new Date(
      anchor.getTime() +
        pick(`${input.chatId}:${kind}:${anchor.toISOString()}`, range) * unit,
    ),
    reason,
  });
  // Клиента отпустили после повторных возражений — напоминаний больше нет,
  // пока он не напишет сам (docs/agent-architecture.md, 2.5).
  const released =
    (stage === 'diagnostic' || stage === 'offer') &&
    objectionPending(said, stage) === 'release';
  const remindersLeft = input.remindersSent < timings.maxReminders && !released;

  if (stage === 'links') {
    const linksAt = milestoneAt(said, 'links');
    if (!linksAt) return null;
    return step(
      'diagnostic',
      linksAt,
      timings.diagnosticDelayMin,
      MINUTE,
      'после ссылок',
    );
  }

  // Клиент ответил после нашего сообщения — значит, прочитал; молчание — с его ответа.
  const readAt = clientLast ? latest.sentAt : last.readAt;
  if (!readAt) {
    const alreadyReminded = said.some(
      (entry) =>
        entry.kind === 'nudge' &&
        entry.key === 'unread_reminder' &&
        entry.messageId === last.id,
    );
    if (!remindersLeft || alreadyReminded) return null;
    return {
      kind: 'unread_reminder',
      runAt: new Date(
        last.sentAt.getTime() + timings.unreadReminderHours * HOUR,
      ),
      reason: 'последнее сообщение не прочитано',
    };
  }

  switch (stage) {
    case 'intake': {
      const question = lastIntakeQuestion(said);
      if (!question) return null;
      if (input.dateKnown) {
        return step(
          'diagnostic',
          readAt,
          timings.diagnosticDelayMin,
          MINUTE,
          `${INTAKE_QUESTION_TITLES[question.nudge]} прочитан, дата есть — диагностика по тому, что известно`,
        );
      }
      if (remindersLeft && !question.reminded) {
        return step(
          'birth_data_reminder',
          readAt,
          timings.birthDataReminderMin,
          MINUTE,
          `${INTAKE_QUESTION_TITLES[question.nudge]} прочитан, клиент молчит`,
        );
      }
      return step(
        'diagnostic',
        readAt,
        timings.diagnosticDelayMin,
        MINUTE,
        'клиент молчит и после напоминания — диагностика по тому, что известно',
      );
    }
    case 'diagnostic': {
      if (!remindersLeft) return null;
      // Клиент уже отвечал после диагностики — напоминание по разговору, через ступень.
      if (repliedAfter(history, milestoneMessageId(said, 'diagnostic'))) {
        return step(
          'return_question',
          readAt,
          timings.stepHours,
          HOUR,
          'клиент отвечал после диагностики и замолчал',
        );
      }
      // Первое касание после диагностики — вопрос-отклик; молчит и дальше —
      // варианты по таймеру, примерно через сутки после диагностики.
      if (nudgesSaid(said, 'ask_feedback') === 0) {
        return step(
          'return_question',
          readAt,
          timings.returnQuestionMin,
          MINUTE,
          'диагностика прочитана, клиент молчит',
        );
      }
      const diagnosticAt = milestoneAt(said, 'diagnostic');
      if (!diagnosticAt) return null;
      const timer = step(
        'offer',
        diagnosticAt,
        timings.offerAfterSilenceHours,
        HOUR,
        'клиент молчит после диагностики и напоминания — варианты по таймеру',
      );
      // Не раньше часа после прочтения напоминания: одно касание за раз.
      const earliest = readAt.getTime() + HOUR;
      return timer.runAt.getTime() >= earliest
        ? timer
        : { ...timer, runAt: new Date(earliest) };
    }
    case 'offer':
      if (!remindersLeft) return null;
      return step(
        'offer_nudge',
        readAt,
        timings.stepHours,
        HOUR,
        repliedAfter(history, milestoneMessageId(said, 'offer'))
          ? 'клиент отвечал после вариантов и замолчал'
          : 'варианты прочитаны, клиент молчит',
      );
    default:
      return null;
  }
}
