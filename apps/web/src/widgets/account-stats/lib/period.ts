import { addDays, toDayKey } from '@/shared/lib'

export interface DateRange {
  from: string
  to: string
}

export type PeriodPresetKey = 'today' | 'yesterday' | '7d' | '30d'

export interface PeriodPreset {
  key: PeriodPresetKey
  label: string
  range: (now: Date) => DateRange
}

/** Последние `days` дней, включая сегодня. */
export function lastDaysRange(days: number, now = new Date()): DateRange {
  return { from: toDayKey(addDays(now, -(days - 1))), to: toDayKey(now) }
}

export const PERIOD_PRESETS: PeriodPreset[] = [
  {
    key: 'today',
    label: 'Сегодня',
    range: (now) => ({ from: toDayKey(now), to: toDayKey(now) }),
  },
  {
    key: 'yesterday',
    label: 'Вчера',
    range: (now) => {
      const day = toDayKey(addDays(now, -1))
      return { from: day, to: day }
    },
  },
  { key: '7d', label: '7 дней', range: (now) => lastDaysRange(7, now) },
  { key: '30d', label: '30 дней', range: (now) => lastDaysRange(30, now) },
]

export const DEFAULT_PERIOD: PeriodPresetKey = '7d'

export function presetRange(key: PeriodPresetKey, now = new Date()): DateRange {
  const preset = PERIOD_PRESETS.find((item) => item.key === key) ?? PERIOD_PRESETS[2]
  return preset.range(now)
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

export function isDayKey(value: string | null): value is string {
  return value !== null && DAY_KEY.test(value)
}

/** Какой пресет соответствует диапазону; null — произвольный период. */
export function matchPreset(range: DateRange, now = new Date()): PeriodPresetKey | null {
  const match = PERIOD_PRESETS.find((preset) => {
    const expected = preset.range(now)
    return expected.from === range.from && expected.to === range.to
  })
  return match?.key ?? null
}
