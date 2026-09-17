import { describe, expect, it } from 'vitest';
import { average, emptyMetrics, median, mergeMetrics, rate, topEntries } from './metrics.js';
import type { DailyMetrics } from './metrics.js';

function day(patch: Partial<DailyMetrics>): DailyMetrics {
  return { ...emptyMetrics(), ...patch };
}

describe('метрики за период', () => {
  it('складывает счётчики ходов, причины передач и черновики', () => {
    const total = mergeMetrics([
      day({
        turns: { ...emptyMetrics().turns, total: 10, sent: 7, handoff: 2, tokensIn: 100, tokensOut: 50 },
        handoffReasons: { ready_to_pay: 1, media: 1 },
        drafts: { created: 3, sent_as_is: 2 },
      }),
      day({
        turns: { ...emptyMetrics().turns, total: 5, sent: 4, handoff: 1, tokensIn: 40, tokensOut: 20 },
        handoffReasons: { ready_to_pay: 2 },
        drafts: { created: 1, edited: 1 },
      }),
    ]);
    expect(total.turns.total).toBe(15);
    expect(total.turns.sent).toBe(11);
    expect(total.turns.tokensIn).toBe(140);
    expect(total.handoffReasons).toEqual({ ready_to_pay: 3, media: 1 });
    expect(total.drafts).toEqual({ created: 4, sent_as_is: 2, edited: 1 });
  });

  it('складывает отклик по касаниям и по вариантам библиотеки', () => {
    const total = mergeMetrics([
      day({ touches: { offer: { sent: 2, replied: 1 } }, library: { 'phrase-1': { sent: 2, replied: 1 } } }),
      day({ touches: { offer: { sent: 3, replied: 0 }, reminder: { sent: 1, replied: 1 } }, library: { 'phrase-1': { sent: 1, replied: 0 } } }),
    ]);
    expect(total.touches).toEqual({ offer: { sent: 5, replied: 1 }, reminder: { sent: 1, replied: 1 } });
    expect(total.library['phrase-1']).toEqual({ sent: 3, replied: 1 });
  });

  it('этапы и лиды: счётчики складываются, минуты до диагностики копятся', () => {
    const total = mergeMetrics([
      day({
        stages: { offer: { entered: 2, advanced: 1, handoff: 0 } },
        leads: { started: 2, diagnosticsSent: 1, diagnosticsRead: 1, minutesToDiagnostics: [60] },
      }),
      day({
        stages: { offer: { entered: 1, advanced: 0, handoff: 1 }, price: { entered: 1, advanced: 0, handoff: 0 } },
        leads: { started: 1, diagnosticsSent: 1, diagnosticsRead: 0, minutesToDiagnostics: [120, 30] },
      }),
    ]);
    expect(total.stages.offer).toEqual({ entered: 3, advanced: 1, handoff: 1 });
    expect(total.stages.price.entered).toBe(1);
    expect(total.leads.started).toBe(3);
    expect(median(total.leads.minutesToDiagnostics)).toBe(60);
  });

  it('битые значения из базы не ломают сумму', () => {
    const broken = { turns: { total: 'много' }, drafts: { created: null }, leads: { minutesToDiagnostics: ['нет'] } } as unknown as DailyMetrics;
    const total = mergeMetrics([broken, day({ turns: { ...emptyMetrics().turns, total: 2 } })]);
    expect(total.turns.total).toBe(2);
    expect(total.drafts.created).toBe(0);
    expect(total.leads.minutesToDiagnostics).toEqual([]);
  });

  it('доли: без выборки — null', () => {
    expect(rate(1, 4)).toBe(0.25);
    expect(rate(0, 0)).toBeNull();
    expect(average(3, 2)).toBe(1.5);
    expect(average(0, 0)).toBeNull();
  });

  it('медиана по чётному и нечётному числу значений', () => {
    expect(median([30, 10, 20])).toBe(20);
    expect(median([10, 20, 30, 40])).toBe(25);
    expect(median([])).toBeNull();
  });

  it('пары по убыванию, нули отбрасываются', () => {
    expect(topEntries({ media: 1, ready_to_pay: 3, unsure: 0 })).toEqual([
      { key: 'ready_to_pay', count: 3 },
      { key: 'media', count: 1 },
    ]);
  });
});
