import { describe, expect, it } from 'vitest';
import { inWindow, localParts, shiftForNightWindow } from './night-window.js';

const MOSCOW = { enabled: true, from: '01:00', to: '08:00', tz: 'Europe/Moscow' };
const zero = () => 0;
const one = () => 0.999;

describe('shiftForNightWindow', () => {
  it('вне окна и при выключенном окне ничего не меняет', () => {
    const noon = new Date('2026-09-17T09:00:00Z'); // 12:00 МСК
    expect(shiftForNightWindow(noon, MOSCOW, zero)).toEqual(noon);
    const night = new Date('2026-09-17T00:30:00Z'); // 03:30 МСК
    expect(shiftForNightWindow(night, { ...MOSCOW, enabled: false }, zero)).toEqual(night);
  });

  it('ночь по Москве сдвигается на 08:00–10:00 того же дня', () => {
    const night = new Date('2026-09-17T00:30:00Z'); // 03:30 МСК
    const early = shiftForNightWindow(night, MOSCOW, zero);
    expect(localParts(early, 'Europe/Moscow')).toMatchObject({ day: 17, hour: 8, minute: 0 });
    expect(early.toISOString()).toBe('2026-09-17T05:00:00.000Z');
    const late = shiftForNightWindow(night, MOSCOW, one);
    expect(localParts(late, 'Europe/Moscow')).toMatchObject({ day: 17, hour: 10, minute: 0 });
  });

  it('окно через полночь: вечер уходит на утро следующего дня', () => {
    const config = { ...MOSCOW, from: '23:00', to: '07:00' };
    const evening = new Date('2026-09-17T20:30:00Z'); // 23:30 МСК
    expect(localParts(shiftForNightWindow(evening, config, zero), 'Europe/Moscow')).toMatchObject({ day: 18, hour: 7, minute: 0 });
    const morning = new Date('2026-09-17T02:00:00Z'); // 05:00 МСК
    expect(localParts(shiftForNightWindow(morning, config, zero), 'Europe/Moscow')).toMatchObject({ day: 17, hour: 7 });
  });

  it('неверная зона — считаем по UTC, неверное время — не сдвигаем', () => {
    const at = new Date('2026-09-17T03:00:00Z');
    expect(shiftForNightWindow(at, { ...MOSCOW, tz: 'Mars/Olympus' }, zero).toISOString()).toBe('2026-09-17T08:00:00.000Z');
    expect(shiftForNightWindow(at, { ...MOSCOW, from: 'abc' }, zero)).toEqual(at);
  });
});

describe('inWindow', () => {
  it('обычное и переходящее через полночь окно', () => {
    expect(inWindow(3 * 60, 60, 8 * 60)).toBe(true);
    expect(inWindow(8 * 60, 60, 8 * 60)).toBe(false);
    expect(inWindow(23 * 60 + 30, 23 * 60, 7 * 60)).toBe(true);
    expect(inWindow(12 * 60, 23 * 60, 7 * 60)).toBe(false);
  });
});
