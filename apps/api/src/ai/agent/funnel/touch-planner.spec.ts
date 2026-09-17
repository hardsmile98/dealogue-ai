import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMINGS } from '../../domain/defaults.js';
import { pickInterval, planNextTouch, reengageAfterRead } from './touch-planner.js';
import type { TouchPlanInput } from './touch-planner.js';

const NOW = new Date('2026-09-17T12:00:00Z');
const mid = () => 0.5;

function input(overrides: Partial<TouchPlanInput> = {}): TouchPlanInput {
  return {
    stage: 'collect_birth',
    trigger: 'inbound',
    touchKind: null,
    birthKnown: false,
    remindersSent: 0,
    lastIntervalHours: null,
    diagnosticsReadAt: null,
    hasDiscountBlock: false,
    timings: DEFAULT_TIMINGS,
    now: NOW,
    rng: mid,
    ...overrides,
  };
}

const minutesFromNow = (at: Date) => Math.round((at.getTime() - NOW.getTime()) / 60_000);
const hoursFromNow = (at: Date) => (at.getTime() - NOW.getTime()) / 3_600_000;

describe('planNextTouch', () => {
  it('после приветствия без даты — напоминание через ~30 мин, после напоминания — диагностика', () => {
    const nudge = planNextTouch(input());
    expect(nudge?.kind).toBe('birth_nudge');
    expect(minutesFromNow(nudge!.at)).toBe(30);
    expect(planNextTouch(input({ birthKnown: true }))).toBeNull();
    const diag = planNextTouch(input({ trigger: 'touch', touchKind: 'birth_nudge' }));
    expect(diag?.kind).toBe('diagnostics');
    expect(minutesFromNow(diag!.at)).toBe(60);
  });

  it('ack_request → диагностика через ~60 мин', () => {
    const plan = planNextTouch(input({ stage: 'ack_request' }));
    expect(plan?.kind).toBe('diagnostics');
    expect(minutesFromNow(plan!.at)).toBe(60);
  });

  it('после диагностики — reengage через 24 ч, если не прочитана', () => {
    const plan = planNextTouch(input({ stage: 'post_diagnostics', trigger: 'touch', touchKind: 'diagnostics' }));
    expect(plan?.kind).toBe('reengage');
    expect(hoursFromNow(plan!.at)).toBe(24);
    expect(minutesFromNow(reengageAfterRead(NOW, DEFAULT_TIMINGS, mid))).toBe(60);
  });

  it('цепочка offer → offer_question → price → price_question → reminder с интервалом 12–16 ч', () => {
    const offer = planNextTouch(input({ stage: 'post_diagnostics', trigger: 'touch', touchKind: 'reengage' }));
    expect(offer?.kind).toBe('offer');
    expect(offer?.intervalHours).toBe(14);
    expect(planNextTouch(input({ stage: 'offer', trigger: 'touch', touchKind: 'offer' }))?.kind).toBe('offer_question');
    expect(planNextTouch(input({ stage: 'offer', trigger: 'touch', touchKind: 'offer_question' }))?.kind).toBe('price');
    expect(planNextTouch(input({ stage: 'price', trigger: 'touch', touchKind: 'price' }))?.kind).toBe('price_question');
    expect(planNextTouch(input({ stage: 'price', trigger: 'touch', touchKind: 'price_question' }))?.kind).toBe('reminder');
    expect(planNextTouch(input({ stage: 'price', trigger: 'touch', touchKind: 'price_question', hasDiscountBlock: true }))?.kind).toBe('discount');
  });

  it('напоминания до лимита, потом ничего', () => {
    expect(planNextTouch(input({ stage: 'reminders', trigger: 'touch', touchKind: 'reminder', remindersSent: 2 }))?.kind).toBe('reminder');
    expect(planNextTouch(input({ stage: 'reminders', trigger: 'touch', touchKind: 'reminder', remindersSent: 3 }))).toBeNull();
    expect(planNextTouch(input({ stage: 'closed_silent' }))).toBeNull();
  });
});

describe('pickInterval', () => {
  it('отличается от прошлого интервала хотя бы на час', () => {
    let calls = 0;
    const rng = () => [0.5, 0.55, 0.05][calls++ % 3];
    const value = pickInterval({ timings: DEFAULT_TIMINGS, lastIntervalHours: 14, rng });
    expect(Math.abs(value - 14)).toBeGreaterThanOrEqual(1);
    expect(value).toBeGreaterThanOrEqual(12);
    expect(value).toBeLessThanOrEqual(16);
  });
});
