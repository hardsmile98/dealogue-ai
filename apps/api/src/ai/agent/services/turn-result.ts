import type { TouchKind, TurnOutcome, TurnTrigger } from '../../domain/types.js';
import type { Rng } from '../lib/random.js';

/** Что просят у агента: один ход в одном чате. */
export interface RunTurnParams {
  accountId: string;
  chatId: string;
  trigger: TurnTrigger;
  touchKind: TouchKind | null;
  /** Попытка job'а: на последней провайдерская ошибка становится передачей. */
  attempt?: { current: number; max: number } | null;
  /** Продолжить отправку хода после сбоя посередине. */
  resume?: { turnId: string; nextIndex: number } | null;
  onProgress?: (patch: Record<string, unknown>) => Promise<void>;
  rng?: Rng;
}

/**
 * Итог хода для очереди: закончили, перенести без списания попытки или
 * дослать остаток сообщений (раздел 7 ТЗ).
 */
export type TurnRunResult =
  | { kind: 'done'; outcome: TurnOutcome | 'skip'; turnId: string | null; detail: string }
  | { kind: 'postpone'; runAt: Date; reason: string }
  | { kind: 'retry_resume'; turnId: string; nextIndex: number; error: string };

export function done(outcome: TurnOutcome | 'skip', turnId: string | null, detail: string): TurnRunResult {
  return { kind: 'done', outcome, turnId, detail };
}

export function postpone(runAt: Date, reason: string): TurnRunResult {
  return { kind: 'postpone', runAt, reason };
}
