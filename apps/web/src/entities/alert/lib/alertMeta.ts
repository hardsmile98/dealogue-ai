import type { AlertStatus, AlertType } from '@/shared/api'

export interface AlertTypeMeta {
  label: string
  description: string
  color: 'success' | 'warning' | 'error'
}

export const ALERT_TYPE_META: Record<AlertType, AlertTypeMeta> = {
  ready_to_pay: {
    label: 'Готов к оплате',
    description: 'Клиент готов оформлять. Подключитесь и закройте сделку.',
    color: 'success',
  },
  needs_human: {
    label: 'Нужен менеджер',
    description: 'ИИ не может ответить сам: вопрос вне фактов, просьба позвать человека или низкая уверенность.',
    color: 'warning',
  },
  ai_error: {
    label: 'Ошибка ИИ',
    description: 'Провайдер ИИ недоступен или ключ неверен. Ответы не отправляются.',
    color: 'error',
  },
}

export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
  open: 'Новый',
  acknowledged: 'Просмотрен',
  resolved: 'Закрыт',
}
