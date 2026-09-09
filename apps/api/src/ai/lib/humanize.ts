import type { Timing } from '../learning/style-profile.schema.js';

export interface DelayPlan {
  /** Сколько ждать до первого сообщения, мс. */
  initialMs: number;
  /** Паузы между сообщениями, мс (длина = messages.length − 1). */
  betweenMs: number[];
}

const MIN_DELAY_SEC = 15;
const TYPING_MS_PER_CHAR = 50;
const TYPING_CAP_MS = 8_000;
const BETWEEN_MIN_MS = 2_000;
const BETWEEN_MAX_MS = 6_000;

/**
 * Задержка «как у менеджера»: сэмплируем из его распределения времени
 * ответа (p25–p90), добавляем время «на печать», обрезаем потолком.
 * Для дожимов начальная задержка не нужна — job уже пришёл по расписанию.
 */
export function planDelay(
  messages: string[],
  timing: Timing | null,
  capSec: number,
  trigger: 'inbound' | 'followup' | 'test',
  random: () => number = Math.random,
): DelayPlan {
  const typingMs = Math.min(TYPING_CAP_MS, (messages[0]?.length ?? 0) * TYPING_MS_PER_CHAR);
  let initialSec: number;
  if (trigger !== 'inbound') {
    initialSec = 0;
  } else if (timing) {
    initialSec = sampleDelay(timing, random);
  } else {
    initialSec = MIN_DELAY_SEC + random() * 45;
  }
  initialSec = Math.min(capSec, Math.max(trigger === 'inbound' ? MIN_DELAY_SEC : 0, initialSec));

  const betweenMs = messages.slice(1).map((m) => {
    const typing = Math.min(TYPING_CAP_MS, m.length * TYPING_MS_PER_CHAR);
    return BETWEEN_MIN_MS + random() * (BETWEEN_MAX_MS - BETWEEN_MIN_MS) + typing;
  });

  return { initialMs: Math.round(initialSec * 1000 + typingMs), betweenMs: betweenMs.map(Math.round) };
}

/** Кусочно-линейная выборка по квартилям: p25/p50/p75/p90. */
export function sampleDelay(timing: Timing, random: () => number): number {
  const { p25, p50, p75, p90 } = timing.responseDelaySec;
  const u = random();
  if (u < 0.25) return lerp(Math.min(p25, MIN_DELAY_SEC), p25, u / 0.25);
  if (u < 0.5) return lerp(p25, p50, (u - 0.25) / 0.25);
  if (u < 0.75) return lerp(p50, p75, (u - 0.5) / 0.25);
  if (u < 0.9) return lerp(p75, p90, (u - 0.75) / 0.15);
  return p90 * (1 + (u - 0.9)); // редкие «долгие» ответы, не дальше 1.1×p90
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}
