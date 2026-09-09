import { describe, expect, it } from 'vitest';
import { isWithinWindow, localTime, nextWindowStart, windowFromWorkingHours } from './working-hours.js';

const window = windowFromWorkingHours({ tz: 'Europe/Moscow', days: [1, 2, 3, 4, 5], from: '09:00', to: '21:00' });

describe('working hours', () => {
  it('localTime переводит в зону', () => {
    // 2026-01-05 — понедельник; 06:30 UTC = 09:30 МСК.
    const t = localTime(new Date('2026-01-05T06:30:00Z'), 'Europe/Moscow');
    expect(t.day).toBe(1);
    expect(t.minutes).toBe(9 * 60 + 30);
    expect(t.offsetMinutes).toBe(180);
  });

  it('внутри окна в будни', () => {
    expect(isWithinWindow(new Date('2026-01-05T06:30:00Z'), window)).toBe(true);
  });

  it('ночью — вне окна, следующий старт в 09:00 того же дня', () => {
    const night = new Date('2026-01-05T02:00:00Z'); // 05:00 МСК, понедельник
    expect(isWithinWindow(night, window)).toBe(false);
    expect(nextWindowStart(night, window).toISOString()).toBe('2026-01-05T06:00:00.000Z');
  });

  it('в субботу — перенос на понедельник', () => {
    const saturday = new Date('2026-01-10T09:00:00Z');
    expect(isWithinWindow(saturday, window)).toBe(false);
    expect(nextWindowStart(saturday, window).toISOString()).toBe('2026-01-12T06:00:00.000Z');
  });

  it('после 21:00 — на следующий день', () => {
    const late = new Date('2026-01-05T19:30:00Z'); // 22:30 МСК
    expect(nextWindowStart(late, window).toISOString()).toBe('2026-01-06T06:00:00.000Z');
  });

  it('внутри окна возвращает саму дату', () => {
    const d = new Date('2026-01-06T10:00:00Z');
    expect(nextWindowStart(d, window)).toBe(d);
  });
});
