import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMINGS } from '../../domain/defaults.js';
import type { FunnelStage, TouchKind } from '../../domain/types.js';
import { stageAfterTurn } from '../planner/planner.js';
import { planNextTouch } from './touch-planner.js';

/**
 * Симуляция воронки молчащего лида (раздел 5.2 + 5.4 ТЗ) на чистых модулях:
 * после каждого касания считаем этап и следующее касание, пока цепочка не
 * закончится. Время — детерминированное (rng = 0.5).
 */
function simulate(options: { birthKnown: boolean; hasDiscountBlock: boolean; maxReminders?: number }) {
  const timings = { ...DEFAULT_TIMINGS, maxReminders: options.maxReminders ?? DEFAULT_TIMINGS.maxReminders };
  const rng = () => 0.5;
  let now = new Date('2026-09-17T09:00:00Z');
  const start = now;
  let stage: FunnelStage = 'collect_birth';
  let remindersSent = 0;
  let lastInterval: number | null = null;
  const chain: { kind: TouchKind; hoursFromStart: number; stageAfter: FunnelStage }[] = [];

  // Первый ход (ответ на приветствие) уже был: этап collect_birth, дальше — только таймеры.
  let next = planNextTouch({ stage, trigger: 'inbound', touchKind: null, birthKnown: options.birthKnown, remindersSent, lastIntervalHours: null, diagnosticsReadAt: null, hasDiscountBlock: options.hasDiscountBlock, timings, now, rng });
  if (!next && options.birthKnown) {
    // Дата известна, запроса нет: бот спросил о запросе → collect_request → диагностика по таймеру.
    stage = 'collect_request';
    next = planNextTouch({ stage, trigger: 'inbound', touchKind: null, birthKnown: true, remindersSent, lastIntervalHours: null, diagnosticsReadAt: null, hasDiscountBlock: options.hasDiscountBlock, timings, now, rng });
  }
  let guard = 0;
  while (next && guard < 20) {
    guard += 1;
    now = next.at;
    const kind = next.kind;
    stage = stageAfterTurn(stage, 'touch', kind, 'stay', { birthKnown: options.birthKnown, requestKnown: false, hasDiscountBlock: options.hasDiscountBlock });
    if (kind === 'reminder') {
      remindersSent += 1;
      if (remindersSent >= timings.maxReminders) stage = 'closed_silent';
    }
    if (next.intervalHours) lastInterval = next.intervalHours;
    chain.push({ kind, hoursFromStart: Math.round(((now.getTime() - start.getTime()) / 3_600_000) * 10) / 10, stageAfter: stage });
    next = planNextTouch({ stage, trigger: 'touch', touchKind: kind, birthKnown: options.birthKnown, remindersSent, lastIntervalHours: lastInterval, diagnosticsReadAt: null, hasDiscountBlock: options.hasDiscountBlock, timings, now, rng });
  }
  return { chain, stage };
}

describe('воронка молчащего лида', () => {
  it('без даты рождения и без скидки: напоминание → диагностика → reengage → offer → … → 3 напоминания → closed_silent', () => {
    const { chain, stage } = simulate({ birthKnown: false, hasDiscountBlock: false });
    expect(chain.map((c) => c.kind)).toEqual([
      'birth_nudge',
      'diagnostics',
      'reengage',
      'offer',
      'offer_question',
      'price',
      'price_question',
      'reminder',
      'reminder',
      'reminder',
    ]);
    expect(stage).toBe('closed_silent');
    // Тайминги: напоминание через 30 мин, диагностика ещё через час, reengage через сутки, дальше по 14 ч.
    expect(chain[0].hoursFromStart).toBe(0.5);
    expect(chain[1].hoursFromStart).toBe(1.5);
    expect(chain[2].hoursFromStart).toBe(25.5);
    expect(chain[3].hoursFromStart).toBe(39.5);
    // Семь интервалов после reengage; при постоянном rng интервалы чередуются 14/13 ч (соседние отличаются ≥ 1 ч).
    expect(chain[chain.length - 1].hoursFromStart).toBe(25.5 + 14 * 4 + 13 * 3);
    expect(chain.map((c) => c.stageAfter)).toEqual([
      'collect_birth',
      'post_diagnostics',
      'post_diagnostics',
      'offer',
      'offer',
      'price',
      'price',
      'reminders',
      'reminders',
      'closed_silent',
    ]);
  });

  it('со скидкой: после вопроса по ценам идёт скидка, потом напоминания', () => {
    const { chain } = simulate({ birthKnown: true, hasDiscountBlock: true, maxReminders: 1 });
    expect(chain.map((c) => c.kind)).toEqual(['diagnostics', 'reengage', 'offer', 'offer_question', 'price', 'price_question', 'discount', 'reminder']);
    expect(chain.find((c) => c.kind === 'discount')?.stageAfter).toBe('discount');
  });
});
