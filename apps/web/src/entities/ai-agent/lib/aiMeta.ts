import type { ChatMode, FunnelStage } from '@/shared/api'

export interface ModeMeta {
  label: string
  description: string
  color: 'default' | 'primary' | 'warning' | 'info' | 'success'
}

export const CHAT_MODE_META: Record<ChatMode, ModeMeta> = {
  off: { label: 'Бот выключен', description: 'Бот ничего не делает в этом чате.', color: 'default' },
  auto: { label: 'Бот ведёт диалог', description: 'Бот отвечает и делает касания сам.', color: 'primary' },
  supervised: {
    label: 'Под контролем',
    description: 'Бот сочиняет каждый ход, но отправляет только после подтверждения менеджера.',
    color: 'info',
  },
  manager: {
    label: 'Ведёт менеджер',
    description: 'Пишет только человек; бот готовит черновики.',
    color: 'warning',
  },
}

export const FUNNEL_STAGE_META: Record<FunnelStage, { label: string; short: string }> = {
  greeting: { label: 'Приветствие', short: 'привет' },
  collect_birth: { label: 'Дата и место рождения', short: 'дата' },
  collect_request: { label: 'Выясняем запрос', short: 'запрос' },
  ack_request: { label: 'Ссылки и ожидание диагностики', short: 'ожидание' },
  diagnostics: { label: 'Диагностика', short: 'диагностика' },
  post_diagnostics: { label: 'После диагностики', short: 'после диагн.' },
  offer: { label: 'Предложение', short: 'предложение' },
  price: { label: 'Цены', short: 'цены' },
  discount: { label: 'Скидка', short: 'скидка' },
  reminders: { label: 'Напоминания', short: 'напоминания' },
  closed_silent: { label: 'Воронка завершена', short: 'завершена' },
}
