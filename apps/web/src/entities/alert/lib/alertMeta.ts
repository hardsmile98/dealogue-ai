import type { AlertStatus, AlertType } from '@/shared/api'

export interface AlertTypeMeta {
  label: string
  description: string
  color: 'success' | 'warning' | 'error' | 'info'
}

export const ALERT_TYPE_META: Record<AlertType, AlertTypeMeta> = {
  handoff: {
    label: 'Нужен менеджер',
    description: 'Бот передал чат: клиент готов платить, подозревает бота, спорит или задал вопрос вне фактов.',
    color: 'warning',
  },
  minor: {
    label: 'Несовершеннолетний',
    description: 'По дате рождения клиенту меньше 18 — бот остановился, решает менеджер.',
    color: 'error',
  },
  media: {
    label: 'Медиа от клиента',
    description: 'Клиент прислал голосовое, фото или файл — бот не может это прочитать.',
    color: 'info',
  },
  stale_lead: {
    label: 'Лид ждал слишком долго',
    description: 'Первое сообщение клиента осталось без ответа больше 6 часов — приветствие уже неуместно.',
    color: 'warning',
  },
  library_incomplete: {
    label: 'Библиотека не заполнена',
    description: 'В библиотеке нет обязательного блока, шаг воронки пропущен.',
    color: 'warning',
  },
  ai_error: {
    label: 'Ошибка ИИ',
    description: 'Провайдер ИИ недоступен или ключ неверен. Бот не делает ходов.',
    color: 'error',
  },
  anomaly: {
    label: 'Аномалия',
    description: 'Подозрительная статистика: слишком много передач, ошибок или сообщений бота.',
    color: 'error',
  },
}

/** Подписи причин передачи менеджеру (payload.reason у алерта handoff). */
export const HANDOFF_REASON_LABELS: Record<string, string> = {
  ready_to_pay: 'готов к оплате',
  suspects_bot: 'подозревает бота',
  wants_human: 'просит человека',
  aggression: 'агрессия или жалоба',
  crisis: 'кризисная ситуация',
  minor: 'несовершеннолетний',
  refusal: 'просит не писать',
  out_of_scope: 'вопрос вне фактов',
  unsure: 'бот не уверен',
  media: 'медиа-сообщение',
  guard_failed: 'ответ не прошёл проверку',
  provider_error: 'ошибка провайдера',
  loop: 'разговор по кругу',
  auto_limit: 'лимит сообщений без ответа',
  language: 'неподдерживаемый язык',
  stale_lead: 'лид ждал слишком долго',
  manual: 'вручную',
}

export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
  open: 'Новый',
  acknowledged: 'Просмотрен',
  resolved: 'Закрыт',
}
