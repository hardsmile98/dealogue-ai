import { describe, expect, it } from 'vitest';
import { planDelay, sampleDelay } from './humanize.js';

const timing = {
  responseDelaySec: { p25: 60, p50: 180, p75: 600, p90: 1800 },
  activeHours: { from: 9, to: 21 },
  activeDays: [1, 2, 3, 4, 5],
  tz: 'Europe/Moscow',
};

describe('sampleDelay', () => {
  it('квантили распределения воспроизводятся', () => {
    expect(sampleDelay(timing, () => 0.25)).toBe(60);
    expect(sampleDelay(timing, () => 0.5)).toBe(180);
    expect(sampleDelay(timing, () => 0.75)).toBe(600);
    expect(sampleDelay(timing, () => 0.9)).toBe(1800);
  });
});

describe('planDelay', () => {
  it('ответ на входящее: задержка из профиля, но не выше потолка и не ниже минимума', () => {
    const plan = planDelay(['привет'], timing, 120, 'inbound', () => 0.9);
    expect(plan.initialMs).toBeLessThanOrEqual(120_000 + 8_000);
    const fast = planDelay(['привет'], timing, 120, 'inbound', () => 0);
    expect(fast.initialMs).toBeGreaterThanOrEqual(15_000);
  });

  it('дожим уходит без начальной задержки (только «печать»)', () => {
    const plan = planDelay(['напоминаю о себе'], timing, 120, 'followup', () => 0.5);
    expect(plan.initialMs).toBeLessThan(2_000);
  });

  it('паузы между сообщениями по числу сообщений', () => {
    const plan = planDelay(['раз', 'два', 'три'], null, 120, 'inbound', () => 0.5);
    expect(plan.betweenMs).toHaveLength(2);
    for (const ms of plan.betweenMs) expect(ms).toBeGreaterThanOrEqual(2_000);
  });
});
