import { CHART_NEUTRAL_COLOR, CHART_SERIES_COLORS } from '@/shared/config'
import { formatDayMonth, formatWeekdayDayMonth, fromDayKey } from '@/shared/lib'
import type { ChartColumn, ChartSeries } from '@/shared/ui'
import type { AccountStats } from '@/entities/telegram-account'

/** Сколько кодов показываем отдельными сериями; остальные — «Другие коды». */
const MAX_CODE_SERIES = 6

export const OTHER_CODES_KEY = '__other'
export const NO_CODE_KEY = '__none'

export interface StatsSeriesModel {
  series: ChartSeries[]
  columns: ChartColumn[]
  /** Цвет каждой серии по ключу — для плиток и таблиц. */
  colorByKey: Record<string, string>
  /** Коды, свёрнутые в «Другие». */
  otherCodes: string[]
}

/**
 * Превращает ответ API в серии графика. Цвет закрепляется за кодом по его
 * числовому порядку среди показанных, а не по рангу, поэтому при смене
 * периода код не меняет цвет, пока остаётся в топе.
 */
export function buildStatsSeries(stats: AccountStats): StatsSeriesModel {
  const topCodes = stats.codes.slice(0, MAX_CODE_SERIES).map((c) => c.code)
  const shown = [...topCodes].sort((a, b) => Number(a) - Number(b))
  const otherCodes = stats.codes.slice(MAX_CODE_SERIES).map((c) => c.code)

  const series: ChartSeries[] = shown.map((code, index) => ({
    key: code,
    label: `Код ${code}`,
    color: CHART_SERIES_COLORS[index],
  }))
  if (otherCodes.length > 0) {
    series.push({
      key: OTHER_CODES_KEY,
      label: 'Другие коды',
      color: CHART_SERIES_COLORS[MAX_CODE_SERIES],
    })
  }
  series.push({ key: NO_CODE_KEY, label: 'Без кода', color: CHART_NEUTRAL_COLOR })

  const columns: ChartColumn[] = stats.days.map((day) => {
    const date = fromDayKey(day.date)
    const values: Record<string, number> = { [NO_CODE_KEY]: day.withoutCode }
    let other = 0
    for (const [code, count] of Object.entries(day.byCode)) {
      if (shown.includes(code)) values[code] = count
      else other += count
    }
    if (otherCodes.length > 0) values[OTHER_CODES_KEY] = other
    return {
      key: day.date,
      label: formatDayMonth(date),
      title: formatWeekdayDayMonth(date),
      values,
    }
  })

  const colorByKey = Object.fromEntries(series.map((s) => [s.key, s.color]))

  return { series, columns, colorByKey, otherCodes }
}

/** Относительное изменение в процентах; null, если раньше было пусто. */
export function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / previous) * 100
}
