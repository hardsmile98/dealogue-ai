import type { ChatMode } from '@/shared/api'

export const MODE_LABELS: Record<ChatMode, string> = {
  auto: 'Ведёт агент',
  manager: 'У менеджера',
  off: 'Агент выключен',
}

export const TRIGGER_LABELS: Record<string, string> = {
  client: 'Ответ клиенту',
  schedule: 'По расписанию',
  restore: 'Восстановление памяти',
}

export const TURN_STATUS_LABELS: Record<string, { label: string; color: 'success' | 'warning' | 'error' | 'default' | 'info' }> = {
  running: { label: 'идёт', color: 'info' },
  sent: { label: 'отправлено', color: 'success' },
  done: { label: 'готово', color: 'success' },
  handoff: { label: 'менеджеру', color: 'warning' },
  skipped: { label: 'пропущен', color: 'default' },
  failed: { label: 'ошибка', color: 'error' },
}

export const JOB_STATUS_LABELS: Record<string, string> = {
  pending: 'ждёт',
  running: 'выполняется',
  done: 'выполнено',
  cancelled: 'отменено',
  failed: 'ошибка',
}

export const TOPIC_LABELS: Record<string, string> = {
  price: 'цена',
  practice: 'практики',
  diagnostic: 'диагностика',
  practitioner: 'о практике',
  client: 'о себе',
  other: 'другое',
}

export const CARD_LABELS: Record<string, string> = {
  name: 'Имя',
  gender: 'Пол',
  birthDate: 'Дата рождения',
  birthPlace: 'Место рождения',
  category: 'Запрос',
  language: 'Язык',
}

/** «3 мин 52 с», «15 с», «1 ч 5 мин» — задержки доставки в песочнице. */
export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds} с`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    const rest = seconds % 60
    return rest ? `${minutes} мин ${rest} с` : `${minutes} мин`
  }
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  return restMinutes ? `${hours} ч ${restMinutes} мин` : `${hours} ч`
}
