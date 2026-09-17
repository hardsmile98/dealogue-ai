import type { ChatMode, FunnelStage, TouchKind, TurnOutcome, TurnTrigger } from '@/shared/api'

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

export const TOUCH_KIND_META: Record<TouchKind, string> = {
  first_reply: 'первый ответ',
  birth_nudge: 'напоминание о дате рождения',
  diagnostics: 'диагностика',
  reengage: 'вопрос после диагностики',
  offer: 'предложение услуг',
  offer_question: 'вопрос по предложению',
  price: 'цены',
  price_question: 'вопрос по ценам',
  discount: 'скидка',
  reminder: 'напоминание',
}

export const TURN_OUTCOME_META: Record<TurnOutcome, { label: string; color: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info' }> = {
  sent: { label: 'отправлено', color: 'success' },
  dry_run: { label: 'отправил бы (dry-run)', color: 'info' },
  silent: { label: 'промолчал', color: 'default' },
  handoff: { label: 'передано менеджеру', color: 'warning' },
  cancelled: { label: 'отменено', color: 'default' },
  error: { label: 'ошибка', color: 'error' },
  awaiting_approval: { label: 'ждёт подтверждения', color: 'primary' },
}

export const TURN_TRIGGER_LABELS: Record<TurnTrigger, string> = {
  inbound: 'ответ клиенту',
  touch: 'касание',
  manual: 'ручной ход',
  manager_draft: 'черновик менеджеру',
}
