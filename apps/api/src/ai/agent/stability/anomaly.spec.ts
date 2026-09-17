import { describe, expect, it } from 'vitest';
import { detectAnomalies, leadingErrors } from './anomaly.js';
import type { AnomalyInput } from './anomaly.js';

function input(patch: Partial<AnomalyInput> = {}): AnomalyInput {
  return {
    turnsLastHour: 20,
    handoffsLastHour: 1,
    regenerationsLastHour: 1,
    recentOutcomes: ['sent', 'sent', 'sent'],
    chatsOverDailyLimit: [],
    dailyLimit: 12,
    ...patch,
  };
}

describe('аномалии', () => {
  it('спокойный час — ничего', () => {
    expect(detectAnomalies(input())).toEqual([]);
  });

  it('больше 30 % передач за час при десяти ходах', () => {
    const found = detectAnomalies(input({ turnsLastHour: 10, handoffsLastHour: 4 }));
    expect(found.map((a) => a.code)).toEqual(['handoff_rate']);
    expect(found[0].detail).toContain('40 %');
  });

  it('на малой выборке доли не считаются', () => {
    expect(detectAnomalies(input({ turnsLastHour: 9, handoffsLastHour: 9, regenerationsLastHour: 9 }))).toEqual([]);
  });

  it('больше 40 % регенераций за час', () => {
    const found = detectAnomalies(input({ turnsLastHour: 10, regenerationsLastHour: 5 }));
    expect(found.map((a) => a.code)).toEqual(['regeneration_rate']);
  });

  it('пять ошибок провайдера подряд; прерванная серия не считается', () => {
    const errors = Array.from({ length: 5 }, () => 'error');
    expect(detectAnomalies(input({ recentOutcomes: errors })).map((a) => a.code)).toEqual(['provider_errors']);
    expect(detectAnomalies(input({ recentOutcomes: ['sent', ...errors] }))).toEqual([]);
    expect(leadingErrors(['error', 'error', 'sent', 'error'])).toBe(2);
  });

  it('перебор сообщений бота в чат за сутки — аномалия по чату', () => {
    const found = detectAnomalies(input({ chatsOverDailyLimit: [{ chatId: 'chat-1', count: 15 }] }));
    expect(found[0]).toMatchObject({ code: 'chat_messages', chatId: 'chat-1' });
    expect(found[0].detail).toContain('15 сообщений');
  });
});
