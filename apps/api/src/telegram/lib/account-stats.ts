import type {
  AccountStatsDto,
  DailyStatsDto,
  StatsTotalsDto,
} from '../telegram.types.js';
import { eachDayKey } from './timezone.js';

/** Строка агрегата начал диалогов: локальный день, код (null — без кода), количество. */
export interface DayCodeRow {
  day: string;
  code: string | null;
  /** pg отдаёт COUNT строкой, если не привести к int. */
  count: number | string;
}

export interface AccountStatsInput {
  from: string;
  to: string;
  /** Начала диалогов за период по дням и кодам. */
  current: DayCodeRow[];
  /** То же за предыдущий период той же длины — только для итогов. */
  previous: DayCodeRow[];
}

/** Раскладывает сгруппированные начала диалогов по дням, кодам и итогам. */
export function buildAccountStats({
  from,
  to,
  current,
  previous,
}: AccountStatsInput): AccountStatsDto {
  const days = new Map<string, DailyStatsDto>(
    eachDayKey(from, to).map((date) => [
      date,
      { date, total: 0, withoutCode: 0, byCode: {} },
    ]),
  );
  const codes = new Map<string, number>();

  for (const row of current) {
    const day = days.get(row.day);
    if (!day) continue;
    const count = Number(row.count);
    day.total += count;
    if (row.code === null) {
      day.withoutCode += count;
    } else {
      day.byCode[row.code] = (day.byCode[row.code] ?? 0) + count;
      codes.set(row.code, (codes.get(row.code) ?? 0) + count);
    }
  }

  return {
    from,
    to,
    days: [...days.values()],
    codes: [...codes.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count || Number(a.code) - Number(b.code)),
    totals: sumTotals(current.filter((row) => days.has(row.day))),
    previousTotals: sumTotals(previous),
  };
}

function sumTotals(rows: DayCodeRow[]): StatsTotalsDto {
  const totals: StatsTotalsDto = { total: 0, withCode: 0, withoutCode: 0 };
  for (const row of rows) {
    const count = Number(row.count);
    totals.total += count;
    if (row.code === null) totals.withoutCode += count;
    else totals.withCode += count;
  }
  return totals;
}
