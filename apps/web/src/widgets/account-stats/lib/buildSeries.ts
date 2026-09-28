import {
  CHART_NEUTRAL_COLOR,
  CHART_OTHER_COLOR,
  chartSeriesColor,
} from '@/shared/config';
import {
  formatDayMonth,
  formatWeekdayDayMonth,
  fromDayKey,
} from '@/shared/lib';
import type { ChartColumn, ChartSeries } from '@/shared/ui';
import type { AccountStats } from '@/entities/telegram-account';

/**
 * Код с меньшей долей от всех новых диалогов за период — скорее погрешность
 * (опечатка, случайное число), чем реклама: он уходит в «Остальные коды».
 */
export const MIN_CODE_SHARE = 0.02;

/** Больше кодов отдельными сериями не показываем, даже если они проходят порог. */
export const MAX_CODE_SERIES = 15;

export const OTHER_CODES_KEY = '__other';
export const NO_CODE_KEY = '__none';

export interface StatsSeriesModel {
  series: ChartSeries[];
  columns: ChartColumn[];
  /** Цвет каждой серии по ключу — для плиток и таблиц. */
  colorByKey: Record<string, string>;
  /** Коды, свёрнутые в «Остальные». */
  otherCodes: string[];
  /** В «Остальные» попали и коды выше порога — не хватило MAX_CODE_SERIES. */
  capped: boolean;
}

/**
 * Превращает ответ API в серии графика. Цвет закрепляется за кодом по его
 * числовому порядку среди показанных, а не по рангу, поэтому при смене
 * периода код не меняет цвет, пока остаётся среди показанных.
 */
export function buildStatsSeries(stats: AccountStats): StatsSeriesModel {
  // Коды отсортированы по убыванию числа диалогов, поэтому прошедшие порог
  // идут подряд с начала списка.
  const minCount = stats.totals.total * MIN_CODE_SHARE;
  const aboveShare = stats.codes.filter((c) => c.count >= minCount);
  const topCodes = aboveShare.slice(0, MAX_CODE_SERIES).map((c) => c.code);
  const shown = [...topCodes].sort((a, b) => Number(a) - Number(b));
  const otherCodes = stats.codes.slice(topCodes.length).map((c) => c.code);
  const capped = aboveShare.length > MAX_CODE_SERIES;

  const series: ChartSeries[] = shown.map((code, index) => ({
    key: code,
    label: `Код ${code}`,
    color: chartSeriesColor(index),
  }));
  if (otherCodes.length > 0) {
    series.push({
      key: OTHER_CODES_KEY,
      label: 'Остальные коды',
      color: CHART_OTHER_COLOR,
    });
  }
  series.push({
    key: NO_CODE_KEY,
    label: 'Без кода',
    color: CHART_NEUTRAL_COLOR,
  });

  const columns: ChartColumn[] = stats.days.map((day) => {
    const date = fromDayKey(day.date);
    const values: Record<string, number> = { [NO_CODE_KEY]: day.withoutCode };
    let other = 0;
    for (const [code, count] of Object.entries(day.byCode)) {
      if (shown.includes(code)) values[code] = count;
      else other += count;
    }
    if (otherCodes.length > 0) values[OTHER_CODES_KEY] = other;
    return {
      key: day.date,
      label: formatDayMonth(date),
      title: formatWeekdayDayMonth(date),
      values,
    };
  });

  const colorByKey = Object.fromEntries(series.map((s) => [s.key, s.color]));

  return { series, columns, colorByKey, otherCodes, capped };
}

/** Пояснение под графиком: почему и какие коды свёрнуты в «Остальные». */
export function otherCodesNote({
  otherCodes,
  capped,
}: StatsSeriesModel): string {
  const reason = `у которых меньше ${MIN_CODE_SHARE * 100}% новых диалогов${
    capped ? ` или которые не вошли в ${MAX_CODE_SERIES} самых частых` : ''
  }`;
  const list = otherCodes.map((code) => `код ${code}`).join(', ');
  return `В «Остальные коды» собраны коды, ${reason}: ${list}.`;
}

/** Относительное изменение в процентах; null, если раньше было пусто. */
export function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
