import { describe, expect, it } from 'vitest';
import { buildAccountStats } from './account-stats.js';

describe('buildAccountStats', () => {
  it('раскладывает строки по дням, кодам и итогам', () => {
    const stats = buildAccountStats({
      from: '2026-09-01',
      to: '2026-09-02',
      current: [
        { day: '2026-09-01', code: '5', count: '2' },
        { day: '2026-09-01', code: null, count: 1 },
        { day: '2026-09-02', code: '12', count: 3 },
        { day: '2026-09-02', code: '5', count: 3 },
      ],
      previous: [
        { day: '2026-08-31', code: '5', count: 4 },
        { day: '2026-08-30', code: null, count: 1 },
      ],
    });

    expect(stats.days).toEqual([
      { date: '2026-09-01', total: 3, withoutCode: 1, byCode: { '5': 2 } },
      {
        date: '2026-09-02',
        total: 6,
        withoutCode: 0,
        byCode: { '12': 3, '5': 3 },
      },
    ]);
    // По убыванию количества, при равенстве — по числовому значению кода.
    expect(stats.codes).toEqual([
      { code: '5', count: 5 },
      { code: '12', count: 3 },
    ]);
    expect(stats.totals).toEqual({ total: 9, withCode: 8, withoutCode: 1 });
    expect(stats.previousTotals).toEqual({
      total: 5,
      withCode: 4,
      withoutCode: 1,
    });
  });

  it('возвращает пустые дни, если начал диалогов не было', () => {
    const stats = buildAccountStats({
      from: '2026-09-01',
      to: '2026-09-03',
      current: [],
      previous: [],
    });
    expect(stats.days.map((day) => day.date)).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
    ]);
    expect(stats.totals).toEqual({ total: 0, withCode: 0, withoutCode: 0 });
  });

  it('не считает строки за пределами периода', () => {
    const stats = buildAccountStats({
      from: '2026-09-01',
      to: '2026-09-01',
      current: [{ day: '2026-08-31', code: '1', count: 7 }],
      previous: [],
    });
    expect(stats.totals.total).toBe(0);
    expect(stats.codes).toEqual([]);
  });
});
