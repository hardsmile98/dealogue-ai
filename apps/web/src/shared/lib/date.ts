const LOCALE = 'ru-RU'

const dayMonth = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' })
const dayMonthYear = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const weekdayDayMonth = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})
const time = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' })
const dateTime = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

/** Локальный ключ дня `YYYY-MM-DD` — единый формат для статистики и фильтров. */
export function toDayKey(value: string | Date): string {
  const d = toDate(value)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Обратная операция: `YYYY-MM-DD` → Date в локальной полуночи. */
export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(value: string | Date, days: number): Date {
  const d = new Date(toDate(value))
  d.setDate(d.getDate() + days)
  return d
}

/** Количество календарных дней между ключами включительно. */
export function daysBetween(fromKey: string, toKey: string): number {
  const ms = fromDayKey(toKey).getTime() - fromDayKey(fromKey).getTime()
  return Math.round(ms / 86_400_000) + 1
}

/** Все дни отрезка `[from, to]` в виде ключей. */
export function eachDayKey(fromKey: string, toKey: string): string[] {
  const result: string[] = []
  let cursor = fromDayKey(fromKey)
  const end = fromDayKey(toKey)
  while (cursor <= end) {
    result.push(toDayKey(cursor))
    cursor = addDays(cursor, 1)
  }
  return result
}

/** «3 сент» */
export function formatDayMonth(value: string | Date): string {
  return dayMonth.format(toDate(value)).replace('.', '')
}

/** «3 сентября 2026 г.» */
export function formatDayMonthYear(value: string | Date): string {
  return dayMonthYear.format(toDate(value))
}

/** «вт, 3 сент» */
export function formatWeekdayDayMonth(value: string | Date): string {
  return weekdayDayMonth.format(toDate(value)).replace('.', '')
}

/** «14:05» */
export function formatTime(value: string | Date): string {
  return time.format(toDate(value))
}

/** «3 сент, 14:05» */
export function formatDateTime(value: string | Date): string {
  return dateTime.format(toDate(value)).replace('.', '')
}

/** Подпись для списка чатов: время, если сегодня; иначе день и месяц. */
export function formatChatListTime(value: string | Date, now = new Date()): string {
  const d = toDate(value)
  return toDayKey(d) === toDayKey(now) ? formatTime(d) : formatDayMonth(d)
}

/** «Сегодня», «Вчера» или «3 сентября 2026 г.» — для разделителей в переписке. */
export function formatDayDivider(dayKey: string, now = new Date()): string {
  if (dayKey === toDayKey(now)) return 'Сегодня'
  if (dayKey === toDayKey(addDays(now, -1))) return 'Вчера'
  return formatDayMonthYear(fromDayKey(dayKey))
}

/** «5 мин назад», «2 ч назад», «вчера», иначе дата. */
export function formatRelative(value: string | Date, now = new Date()): string {
  const diffMs = now.getTime() - toDate(value).getTime()
  const minutes = Math.round(diffMs / 60_000)
  if (minutes < 1) return 'только что'
  if (minutes < 60) return `${minutes} мин назад`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ч назад`
  const days = Math.round(hours / 24)
  if (days === 1) return 'вчера'
  if (days < 7) return `${days} дн. назад`
  return formatDayMonth(value)
}
