import type { WorkingHours } from '../prompt/sales-script.schema.js';

/** Единый вид окна активности: часы (0–23) и дни (1 = пн … 7 = вс) в зоне tz. */
export interface ActiveWindow {
  tz: string;
  days: number[];
  fromMinutes: number;
  toMinutes: number;
}

export function windowFromWorkingHours(hours: WorkingHours): ActiveWindow {
  return {
    tz: hours.tz,
    days: hours.days,
    fromMinutes: toMinutes(hours.from),
    toMinutes: toMinutes(hours.to),
  };
}

export function windowFromActiveHours(from: number, to: number, days: number[], tz: string): ActiveWindow {
  return { tz, days, fromMinutes: from * 60, toMinutes: to * 60 + 59 };
}

interface LocalTime {
  day: number;
  minutes: number;
  /** Смещение зоны в минутах на этот момент. */
  offsetMinutes: number;
}

export function localTime(date: Date, tz: string): LocalTime {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
      weekday: 'short',
      timeZoneName: 'longOffset',
    }).formatToParts(date);
  } catch {
    return { day: ((date.getUTCDay() + 6) % 7) + 1, minutes: date.getUTCHours() * 60 + date.getUTCMinutes(), offsetMinutes: 0 };
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const hourRaw = Number(get('hour'));
  const hour = hourRaw === 24 ? 0 : hourRaw;
  const minutes = hour * 60 + Number(get('minute'));
  const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday')) + 1 || 1;
  const offset = /GMT([+-])(\d{2}):?(\d{2})?/.exec(get('timeZoneName'));
  const offsetMinutes = offset ? (offset[1] === '-' ? -1 : 1) * (Number(offset[2]) * 60 + Number(offset[3] ?? 0)) : 0;
  return { day, minutes, offsetMinutes };
}

export function isWithinWindow(date: Date, window: ActiveWindow): boolean {
  const { day, minutes } = localTime(date, window.tz);
  if (!window.days.includes(day)) return false;
  if (window.fromMinutes <= window.toMinutes) {
    return minutes >= window.fromMinutes && minutes <= window.toMinutes;
  }
  // Окно через полночь (например 22:00–06:00).
  return minutes >= window.fromMinutes || minutes <= window.toMinutes;
}

/**
 * Ближайший момент внутри окна, не раньше `date`. Если сейчас внутри — сама `date`.
 * Ищем по дням вперёд (до 8), чтобы учесть выходные.
 */
export function nextWindowStart(date: Date, window: ActiveWindow): Date {
  if (isWithinWindow(date, window)) return date;
  const { day, minutes, offsetMinutes } = localTime(date, window.tz);
  // Начало текущих локальных суток в UTC.
  const startOfLocalDayUtc = date.getTime() - minutes * 60_000 - date.getUTCSeconds() * 1000 - date.getUTCMilliseconds();
  for (let add = 0; add <= 8; add += 1) {
    const candidateDay = ((day - 1 + add) % 7) + 1;
    if (!window.days.includes(candidateDay)) continue;
    const candidate = new Date(startOfLocalDayUtc + add * 86_400_000 + window.fromMinutes * 60_000);
    // Поправка на возможную смену смещения (переход на летнее время).
    const drift = localTime(candidate, window.tz).offsetMinutes - offsetMinutes;
    const adjusted = new Date(candidate.getTime() - drift * 60_000);
    if (adjusted.getTime() > date.getTime()) return adjusted;
  }
  return new Date(date.getTime() + 3600_000);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
