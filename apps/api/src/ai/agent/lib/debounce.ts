/**
 * Дебаунс входящих (раздел 5.3 ТЗ): ждём тишины `debounceSec` после
 * последнего сообщения, но не дольше `maxSec` от первого сообщения пачки.
 * «Печатает» продлевает ожидание, тоже в пределах потолка.
 */

export interface DebounceInput {
  now: Date;
  /** Когда пришло первое сообщение текущей пачки. */
  batchStartedAt: Date;
  debounceSec: number;
  maxSec: number;
}

export function inboundRunAt({ now, batchStartedAt, debounceSec, maxSec }: DebounceInput): Date {
  const byDebounce = now.getTime() + debounceSec * 1000;
  const ceiling = batchStartedAt.getTime() + maxSec * 1000;
  return new Date(Math.max(now.getTime(), Math.min(byDebounce, ceiling)));
}

export interface TypingExtendInput {
  now: Date;
  currentRunAt: Date;
  batchStartedAt: Date;
  maxSec: number;
  extendSec?: number;
}

/** Клиент печатает: до запуска меньше `extendSec` → отодвигаем, но не дальше потолка. */
export function typingRunAt({ now, currentRunAt, batchStartedAt, maxSec, extendSec = 30 }: TypingExtendInput): Date | null {
  const wanted = now.getTime() + extendSec * 1000;
  if (currentRunAt.getTime() >= wanted) return null;
  const ceiling = batchStartedAt.getTime() + maxSec * 1000;
  const next = Math.min(wanted, ceiling);
  return next > currentRunAt.getTime() ? new Date(next) : null;
}
