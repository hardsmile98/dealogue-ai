import type { Stage } from '../library/kinds.js';
import type { DelayPlan } from './delivery.js';
import type { FinalPart, HistoryMessage, SentPart } from './types.js';

/**
 * Точка фиксации хода (`bot_turns.delivery`): текст собран и прошёл
 * проверки — дальше ход только доставляется. Пока записи нет, прерванный
 * ход ничего не отправил и просто повторяется целиком. С записью —
 * досылается с того места, где остановился: без нового обращения к модели
 * и без повторов уже ушедшего. Прогресс — в `bot_turns.sent`.
 */
export interface DeliveryRecord {
  parts: FinalPart[];
  delays: DelayPlan;
  /** Не раньше этого момента уходит первая часть (ISO) — после перезапуска ждём только остаток. */
  firstPartAt: string;
  /** Последнее сообщение чата, которое видел ход: всё новее, кроме своих частей, значит — разговор ушёл вперёд. */
  baselineMessageId: number;
  /** Аргументы плейбука из ответа ответчика — для реестра сказанного. */
  writerArguments: string[];
  /** Вместо текста ответчика — веха сама или запасная фраза. */
  fallback: boolean;
  /** Этап на момент хода. */
  stage: Stage;
  markRead: boolean;
  /** Часть, отправка которой началась, но не записана; null — сейчас ничего не уходит. */
  sending: number | null;
}

export interface ResumeInput {
  delivery: DeliveryRecord;
  /** Что записано как ушедшее. */
  sent: readonly SentPart[];
  /** История чата по возрастанию. */
  history: readonly HistoryMessage[];
  now: Date;
}

export interface ResumePoint {
  /** Ушедшее с учётом части, которая дошла до Telegram, но не успела записаться. */
  sent: SentPart[];
  /**
   * После хода в чате появилось чужое сообщение — клиент дописал, менеджер
   * ответил или ушёл другой ход. Досылать поздно: ход закрывается с тем,
   * что успело уйти.
   */
  movedOn: boolean;
  /** План задержек для досылки: до первой части — только остаток исходной паузы. */
  delays: DelayPlan;
}

/**
 * С чего продолжить прерванную доставку. Решение только по id и тексту
 * своих сообщений: часть, которая уходила в момент остановки, считается
 * ушедшей, если в истории после хода есть наше исходящее с тем же текстом
 * (Telegram его принял, а записать мы не успели) — повторно она не уйдёт.
 */
export function resumePoint(input: ResumeInput): ResumePoint {
  const { delivery, history } = input;
  const sent = [...input.sent];
  const own = new Set(sent.map((part) => part.messageId));

  const index = delivery.sending;
  const inFlight =
    index !== null && index === sent.length ? delivery.parts[index] : undefined;
  if (inFlight) {
    const echo = history.find(
      (message) =>
        message.direction === 'out' &&
        message.id > delivery.baselineMessageId &&
        !own.has(message.id) &&
        message.text.trim() === inFlight.text.trim(),
    );
    if (echo) {
      sent.push({
        text: inFlight.text,
        block: inFlight.block,
        messageId: echo.id,
        delayMs: 0,
        typingMs: 0,
        sentAt: echo.sentAt,
      });
      own.add(echo.id);
    }
  }

  const movedOn = history.some(
    (message) =>
      message.id > delivery.baselineMessageId && !own.has(message.id),
  );
  const initialMs =
    sent.length === 0
      ? Math.max(0, Date.parse(delivery.firstPartAt) - input.now.getTime())
      : 0;
  return { sent, movedOn, delays: { ...delivery.delays, initialMs } };
}
