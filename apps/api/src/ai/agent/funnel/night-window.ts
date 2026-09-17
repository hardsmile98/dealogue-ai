/**
 * Ночное окно (раздел 5.4 ТЗ): касание, попадающее в тихие часы по таймзоне
 * аккаунта, сдвигается на утро — случайно в первые два часа после окна.
 * Первый ответ лиду под окно не подпадает (это решает вызывающий).
 */

import type { NightWindowConfig } from '../../domain/types.js';
import { uniform } from '../lib/random.js';
import type { Rng } from '../lib/random.js';

const MORNING_SPREAD_MIN = 120;

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** Локальные дата и время момента `at` в зоне `tz`. */
export function localParts(at: Date, tz: string): LocalParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(at)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour % 24, minute: parts.minute };
}

/** Смещение зоны в минутах в момент `at` (UTC = local − offset). */
function offsetMinutes(at: Date, tz: string): number {
  const local = localParts(at, tz);
  const asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  const truncated = Math.floor(at.getTime() / 60_000) * 60_000;
  return Math.round((asUtc - truncated) / 60_000);
}

function parseTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** Попадает ли локальное время (минуты от полуночи) в окно, которое может переходить через полночь. */
export function inWindow(localMinutes: number, from: number, to: number): boolean {
  if (from === to) return false;
  return from < to ? localMinutes >= from && localMinutes < to : localMinutes >= from || localMinutes < to;
}

/** Момент касания с учётом ночного окна; вне окна или при выключенном окне — как есть. */
export function shiftForNightWindow(at: Date, config: NightWindowConfig, rng: Rng): Date {
  if (!config.enabled) return at;
  const from = parseTime(config.from);
  const to = parseTime(config.to);
  if (from === null || to === null) return at;
  let tz = config.tz;
  try {
    localParts(at, tz);
  } catch {
    tz = 'UTC';
  }
  const local = localParts(at, tz);
  const minutes = local.hour * 60 + local.minute;
  if (!inWindow(minutes, from, to)) return at;

  // Окно через полночь и мы ещё до неё — утро наступит на следующий локальный день.
  const nextDay = from > to && minutes >= from ? 1 : 0;
  const targetMinutes = to + Math.round(uniform(rng, 0, MORNING_SPREAD_MIN));
  const targetLocalUtc = Date.UTC(local.year, local.month - 1, local.day + nextDay, 0, targetMinutes);
  const offset = offsetMinutes(new Date(targetLocalUtc), tz);
  return new Date(targetLocalUtc - offset * 60_000);
}
