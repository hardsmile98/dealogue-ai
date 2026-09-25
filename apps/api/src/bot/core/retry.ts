import type { RetryState } from './types.js';

/**
 * Ход, который не удался, повторяется заданием с нарастающей паузой,
 * минуты; дольше `RETRY_WINDOW_MS` — чат уходит менеджеру с ярлыком
 * «агент недоступен» (раздел 10). Для человека пауза в минуты естественна.
 */
export const TURN_RETRY_DELAYS_MIN = [1, 2, 5, 10, 12];
export const RETRY_WINDOW_MS = 30 * 60_000;

/**
 * Следующий повтор после сбоя или null, если окно повторов вышло.
 * Общий для хода, который упал до сборки текста (повторяется целиком), и
 * для досылки собранного хода.
 */
export function nextRetry(
  previous: RetryState | undefined,
  now: Date,
): { runAt: Date; retry: RetryState } | null {
  const firstFailedAt = previous ? new Date(previous.firstFailedAt) : now;
  const attempt = (previous?.attempt ?? 0) + 1;
  const delayMin = TURN_RETRY_DELAYS_MIN[attempt - 1];
  if (delayMin === undefined) return null;
  const runAt = new Date(now.getTime() + delayMin * 60_000);
  if (runAt.getTime() - firstFailedAt.getTime() > RETRY_WINDOW_MS) return null;
  return {
    runAt,
    retry: { firstFailedAt: firstFailedAt.toISOString(), attempt },
  };
}
