/**
 * Планирование касаний по таймеру (раздел 5.4 ТЗ). Чистая функция:
 * состояние после хода → какое касание и когда. Джиттер — из rng.
 */

import type { FunnelStage, TimingsConfig, TouchKind, TurnTrigger } from '../../domain/types.js';
import { uniform } from '../lib/random.js';
import type { Rng } from '../lib/random.js';

export interface TouchPlanInput {
  /** Этап после хода. */
  stage: FunnelStage;
  trigger: TurnTrigger;
  /** Касание, которое только что выполнено (или null для inbound). */
  touchKind: TouchKind | null;
  birthKnown: boolean;
  remindersSent: number;
  /** Часы предыдущего интервала — следующий должен отличаться хотя бы на час. */
  lastIntervalHours: number | null;
  diagnosticsReadAt: Date | null;
  hasDiscountBlock: boolean;
  timings: TimingsConfig;
  now: Date;
  rng: Rng;
}

export interface TouchPlan {
  kind: TouchKind;
  at: Date;
  /** Для длинных интервалов — сколько часов выбрали. */
  intervalHours: number | null;
}

export function planNextTouch(input: TouchPlanInput): TouchPlan | null {
  const { stage, trigger, touchKind, timings, now, rng } = input;
  const minutes = (base: number, jitter: number): Date => new Date(now.getTime() + uniform(rng, base - jitter, base + jitter) * 60_000);
  const hours = (base: number, jitter: number): Date => new Date(now.getTime() + uniform(rng, base - jitter, base + jitter) * 3_600_000);
  const interval = (): TouchPlan['intervalHours'] => pickInterval(input);
  const afterInterval = (kind: TouchKind): TouchPlan => {
    const h = interval() as number;
    return { kind, at: new Date(now.getTime() + h * 3_600_000), intervalHours: h };
  };

  switch (stage) {
    case 'greeting':
      return null;
    case 'collect_birth':
      if (touchKind === 'birth_nudge') {
        // Напоминание уже было, клиент молчит — идём к диагностике с тем, что есть.
        return { kind: 'diagnostics', at: minutes(timings.diagnosticsDelayMin, 10), intervalHours: null };
      }
      return input.birthKnown ? null : { kind: 'birth_nudge', at: minutes(timings.birthNudgeAfterMin, 5), intervalHours: null };
    case 'collect_request':
    case 'ack_request':
      return { kind: 'diagnostics', at: minutes(timings.diagnosticsDelayMin, 10), intervalHours: null };
    case 'diagnostics':
      return null;
    case 'post_diagnostics':
      if (touchKind === 'diagnostics') {
        return input.diagnosticsReadAt
          ? { kind: 'reengage', at: minutes(timings.reengageAfterReadMin, 15), intervalHours: null }
          : { kind: 'reengage', at: hours(timings.reengageIfUnreadHours, 2), intervalHours: null };
      }
      return afterInterval('offer');
    case 'offer':
      return touchKind === 'offer_question' ? afterInterval('price') : afterInterval('offer_question');
    case 'price':
      if (touchKind === 'price_question') return afterInterval(input.hasDiscountBlock ? 'discount' : 'reminder');
      return afterInterval('price_question');
    case 'discount':
      return afterInterval('reminder');
    case 'reminders':
      return input.remindersSent >= timings.maxReminders ? null : afterInterval('reminder');
    case 'closed_silent':
      return null;
    default:
      return trigger === 'inbound' ? null : null;
  }
}

/** Прочтение диагностики: касание reengage переносится на «после прочтения». */
export function reengageAfterRead(readAt: Date, timings: TimingsConfig, rng: Rng): Date {
  return new Date(readAt.getTime() + uniform(rng, timings.reengageAfterReadMin - 15, timings.reengageAfterReadMin + 15) * 60_000);
}

/** Интервал 12–16 ч, отличающийся от предыдущего хотя бы на час. */
export function pickInterval(input: Pick<TouchPlanInput, 'timings' | 'lastIntervalHours' | 'rng'>): number {
  const { timings, lastIntervalHours, rng } = input;
  const min = timings.touchIntervalMinHours;
  const max = timings.touchIntervalMaxHours;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const value = Math.round(uniform(rng, min, max) * 4) / 4;
    if (lastIntervalHours === null || Math.abs(value - lastIntervalHours) >= 1 || max - min < 2) return value;
  }
  return lastIntervalHours !== null && lastIntervalHours - 1 >= min ? lastIntervalHours - 1 : max;
}
