import { DRAFT_STATUS_META } from '@/entities/ai-draft'
import type { DraftStatus } from '@/shared/api'

/** Доля в процентах; нет выборки — прочерк. */
export function percent(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${Math.round(value * 100)} %`
}

/** Минуты в «1 ч 20 мин». */
export function duration(minutes: number | null): string {
  if (minutes === null) return '—'
  const total = Math.max(0, Math.round(minutes))
  if (total < 60) return `${total} мин`
  const hours = Math.floor(total / 60)
  const rest = total % 60
  return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`
}

export function thousands(value: number): string {
  return value.toLocaleString('ru-RU')
}

export function draftStatusLabel(status: string): string {
  return DRAFT_STATUS_META[status as DraftStatus]?.label ?? status
}
