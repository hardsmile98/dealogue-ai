/**
 * Паузы «по-человечески» (раздел 7 ТЗ). Всё в миллисекундах, случайность
 * через rng — в тестах подменяется.
 */

import type { TimingsConfig } from '../../domain/types.js';
import { uniform } from '../lib/random.js';
import type { Rng } from '../lib/random.js';

/** Пауза «на чтение» входящего: 2–6 с + 20 мс на символ, потолок 20 с. */
export function readingPauseMs(inboundChars: number, rng: Rng): number {
  return Math.min(20_000, Math.round(uniform(rng, 2000, 6000) + inboundChars * 20));
}

/** «Печатает»: 35 мс на символ ±30 %, потолок 25 с. */
export function typingMs(chars: number, rng: Rng): number {
  const base = chars * 35;
  return Math.min(25_000, Math.max(800, Math.round(base * uniform(rng, 0.7, 1.3))));
}

/** Пауза между сообщениями одного хода: 3–8 с. */
export function betweenMessagesMs(rng: Rng): number {
  return Math.round(uniform(rng, 3000, 8000));
}

/** Задержка первого ответа лиду после дебаунса. */
export function firstReplyDelayMs(timings: TimingsConfig, rng: Rng): number {
  return Math.round(uniform(rng, timings.firstReplyDelayMinSec, timings.firstReplyDelayMaxSec) * 1000);
}
