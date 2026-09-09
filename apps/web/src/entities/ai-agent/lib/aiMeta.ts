import type { AiPausedReason, AttentionReason, PhraseIntent } from '@/shared/api'

export interface ReasonMeta {
  label: string
  description: string
  color: 'default' | 'warning' | 'error' | 'info' | 'success'
}

/** Почему ИИ в чате остановлен — подпись для переключателя. */
export const AI_PAUSED_REASON_META: Record<AiPausedReason, ReasonMeta> = {
  manual_reply: {
    label: 'менеджер ответил вручную',
    description: 'ИИ выключился, потому что в чат написали из Telegram. Включите снова, когда захотите вернуть его.',
    color: 'info',
  },
  handoff: {
    label: 'клиент готов к оплате',
    description: 'ИИ передал клиента менеджеру и остановился.',
    color: 'success',
  },
  needs_human: {
    label: 'нужен менеджер',
    description: 'ИИ не смог ответить сам и попросил подключиться.',
    color: 'warning',
  },
  limit: {
    label: 'достигнут лимит сообщений',
    description: 'ИИ отправил максимум сообщений в этом чате. Включите снова, чтобы продолжить.',
    color: 'warning',
  },
  error: {
    label: 'ошибка ИИ',
    description: 'Несколько попыток ответить закончились ошибкой провайдера.',
    color: 'error',
  },
}

export const ATTENTION_REASON_META: Record<AttentionReason, ReasonMeta> = {
  ready_to_pay: { label: 'Готов к оплате', description: 'Клиент готов оформлять — подключитесь и закройте сделку.', color: 'success' },
  needs_human: { label: 'Нужен менеджер', description: 'ИИ попросил подключить человека.', color: 'warning' },
  ai_error: { label: 'Ошибка ИИ', description: 'ИИ не смог ответить из-за ошибки провайдера.', color: 'error' },
}

export const PHRASE_INTENT_LABELS: Record<PhraseIntent, string> = {
  greeting: 'Приветствие',
  qualify: 'Выяснение потребности',
  price: 'Цена и условия',
  materials: 'Материалы',
  call_offer: 'Предложение созвона',
  objection: 'Возражения',
  close: 'Закрытие',
  payment: 'Оплата',
  followup: 'Напоминание',
  other: 'Прочее',
}

export const WEEKDAY_LABELS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

/** Секунды → «2 мин», «1 ч 20 мин». */
export function formatDurationSec(sec: number): string {
  if (sec < 60) return `${Math.round(sec)} с`
  const minutes = Math.round(sec / 60)
  if (minutes < 60) return `${minutes} мин`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest > 0 ? `${hours} ч ${rest} мин` : `${hours} ч`
}
