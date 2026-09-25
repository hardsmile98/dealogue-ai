/**
 * Контракт backend-API ИИ-агента — зеркало apps/api/src/bot/bot.types.ts
 * и справочников apps/api/src/bot/library/kinds.ts. Менять синхронно.
 */

export const MILESTONES = ['links', 'diagnostic', 'offer', 'prices'] as const
export type Milestone = (typeof MILESTONES)[number]

/** Этап = последняя доставленная веха; `intake` — ничего ещё не доставлено. */
export const STAGES = ['intake', ...MILESTONES] as const
export type Stage = (typeof STAGES)[number]

export const STAGE_LABELS: Record<Stage, string> = {
  intake: 'Знакомство',
  links: 'Ссылки отправлены',
  diagnostic: 'Диагностика отправлена',
  offer: 'Предложение отправлено',
  prices: 'Цены отправлены',
}

export const LIBRARY_KINDS = [
  'greeting',
  'ask_birth_data',
  'no_birth_data',
  'ask_request',
  'empathy',
  'wait',
  'links',
  'diagnostic',
  'return_question',
  'offer',
  'prices',
  'nudge',
  'price_deflect',
  'objection',
  'about',
] as const
export type LibraryKind = (typeof LIBRARY_KINDS)[number]

export const LIBRARY_KIND_LABELS: Record<LibraryKind, string> = {
  greeting: 'Приветствие',
  ask_birth_data: 'Просьба о дате и месте',
  no_birth_data: 'Нет данных рождения',
  ask_request: 'Вопрос о запросе',
  empathy: 'Эмпатия',
  wait: 'Ожидание диагностики',
  links: 'Ссылки',
  diagnostic: 'Диагностики',
  return_question: 'Вопрос после диагностики',
  offer: 'Описание услуг',
  prices: 'Цены',
  nudge: 'Подталкивания',
  price_deflect: 'Цена раньше времени',
  objection: 'Возражения',
  about: 'О себе и о работе',
}

export const GENDERS = ['f', 'm'] as const
export type Gender = (typeof GENDERS)[number]

export const LANGUAGES = ['ru', 'en'] as const
export type Language = (typeof LANGUAGES)[number]

export type ChatMode = 'auto' | 'manager' | 'off'
/** Что владелец может выставить руками; `manager` ставит только система. */
export type ManualChatMode = 'auto' | 'off'
export type ChatLabel = 'needs_reply' | 'prices_silent' | 'agent_unavailable'
export type HandoffReason =
  | 'media'
  | 'risk'
  | 'no_language_materials'
  | 'reply_after_prices'
  | 'prices_sent'
  | 'foreign_outgoing'
  | 'agent_unavailable'

export interface PersonaLink {
  title: string
  url: string
}

export interface Persona {
  name: string
  gender: Gender
  bio: string
  links: PersonaLink[]
}

export interface Range {
  min: number
  max: number
}

/** Смысл полей — apps/api/src/bot/library/timings.ts. */
export interface Timings {
  quietWindowSec: Range
  typingExtendSec: number
  quietMaxSec: number
  newLeadReplySec: Range
  inChatReplySec: Range
  inChatWindowMin: number
  recentReplyMin: Range
  recentWindowMin: number
  awayReplyMin: Range
  typingCharsPerSec: number
  typingMaxSec: number
  blockTypingSec: Range
  partPauseSec: Range
  diagnosticDelayMin: Range
  birthDataReminderMin: Range
  returnQuestionMin: Range
  stepHours: Range
  unreadReminderHours: number
  maxReminders: number
  maxTurnsWithoutNudge: number
}

export interface BotSettingsDto {
  accountId: string
  enabled: boolean
  enabledAt: string | null
  persona: Persona
  timings: Timings
  model: string
  library: { total: number; byKind: Partial<Record<LibraryKind, number>> }
}

/** Тело PUT …/bot: меняется только присланное. */
export interface UpdateBotSettingsBody {
  persona?: Partial<Persona>
  timings?: Partial<{ [K in keyof Timings]: Timings[K] extends Range ? Partial<Range> : Timings[K] }>
  model?: string
}

export type LibraryImportMode = 'keep' | 'replace'

export interface LibraryImportResultDto {
  inserted: number
  updated: number
  skipped: number
  total: number
}

export interface LibraryItemDto {
  id: string
  accountId: string
  kind: LibraryKind
  language: string
  gender: Gender | null
  category: string | null
  title: string
  text: string
  sort: number
  enabled: boolean
  seedKey: string | null
  createdAt: string
  updatedAt: string
}

export interface ExampleDto {
  id: string
  accountId: string
  stage: Stage
  situation: string
  client: string
  practitioner: string
  enabled: boolean
  sort: number
  createdAt: string
  updatedAt: string
}

export interface ChatBotStateDto {
  chatId: string
  accountId: string
  mode: ChatMode
  stage: Stage
  label: ChatLabel | null
  handoffReason: HandoffReason | null
  handoffAt: string | null
  card: Record<string, unknown>
  summary: string
  turnsWithoutNudge: number
  remindersSent: number
  updatedAt: string
}

/** null — агент этот чат не вёл и режим руками не ставили. */
export interface ChatBotStateResponse {
  state: ChatBotStateDto | null
}

// ── Песочница ──────────────────────────────────────────────────────────

/** Задания планировщика — подписи для песочницы. */
export const JOB_KIND_LABELS: Record<string, string> = {
  diagnostic: 'Отправить диагностику',
  birth_data_reminder: 'Напомнить о дате рождения',
  return_question: 'Вопрос после диагностики',
  offer: 'Отправить предложение',
  offer_nudge: 'Вопрос после предложения',
  prices: 'Отправить цены',
  unread_reminder: 'Напомнить о себе',
  reply: 'Повторить ответ клиенту',
}

export const HANDOFF_REASON_LABELS: Record<HandoffReason, string> = {
  media: 'Клиент прислал медиа',
  risk: 'Риск: агрессия, кризис, просьба позвать человека или вопрос «вы бот?»',
  no_language_materials: 'Нет материалов на языке клиента',
  reply_after_prices: 'Клиент ответил после цен',
  prices_sent: 'Цены отправлены',
  foreign_outgoing: 'В чат написал человек',
  agent_unavailable: 'Агент недоступен',
}

export interface SandboxSummaryDto {
  id: string
  accountId: string
  title: string
  /** Реальный чат, из которого скопирована переписка. */
  sourceChatId: string | null
  /** Виртуальное «сейчас» сессии. */
  virtualNow: string
  stage: Stage
  mode: ChatMode
  label: ChatLabel | null
  messageCount: number
  createdAt: string
  updatedAt: string
}

export interface SandboxMessageDto {
  id: number
  direction: 'in' | 'out'
  text: string
  mediaKind: string | null
  sentAt: string
  readAt: string | null
  /** Тело вехи из библиотеки. */
  block: boolean
  delayMs: number | null
  typingMs: number | null
  turnId: string | null
}

export interface SandboxJobDto {
  id: string
  kind: string
  runAt: string
  status: string
  /** Почему поставлено: от чего отсчитана ступень или «повтор N после сбоя». */
  note: string | null
}

export interface SandboxViolationDto {
  code: string
  severity: string
  detail: string
}

/** Ход из журнала агента — в песочнице и в реальном чате. */
export interface BotTurnDto {
  id: string
  /** Сообщения, ушедшие этим ходом (telegram_message_id или id песочницы). */
  messageIds: number[]
  /** client | schedule | restore */
  trigger: string
  /** running | sent | handoff | skipped | failed | done */
  status: string
  startedAt: string
  finishedAt: string | null
  error: string | null
  analysis: {
    summary: string
    language: string | null
    intents: string[]
    risk: string[]
    mood: string
    interest: number
    objection: string | null
    answerPoints: { text: string; topic: string; skip: boolean }[]
  } | null
  plan: {
    goal: string
    milestone: string | null
    nudge: string | null
    handoff: string | null
    idle: string | null
  } | null
  draft: string | null
  review: {
    violations: SandboxViolationDto[]
    rewritten: boolean
    final: SandboxViolationDto[] | null
  } | null
  final: {
    removed: { part: string; reason: string }[]
    fallback: boolean
  } | null
}

export type SandboxTurnDto = BotTurnDto

export interface BotMemoryDto {
  card: Record<string, unknown>
  summary: string
  facts: { kind: string; text: string; confidence: number }[]
  said: { kind: string; key: string; at: string }[]
  turnsWithoutNudge: number
  remindersSent: number
}

/** Журнал агента в реальном чате. */
export interface ChatJournalDto {
  memory: BotMemoryDto
  jobs: SandboxJobDto[]
  turns: BotTurnDto[]
}

/** null — агент этот чат не вёл. */
export interface ChatJournalResponse {
  journal: ChatJournalDto | null
}

export interface HandoffChatDto {
  chatId: string
  peerName: string
  peerUsername: string | null
  stage: Stage
  label: ChatLabel | null
  handoffReason: HandoffReason | null
  handoffAt: string | null
  /** С какого сообщения клиента он ждёт ответа; null — последнее слово за нами. */
  waitingSince: string | null
  lastMessageAt: string | null
  lastMessageText: string
  lastMessageDirection: 'in' | 'out' | null
}

export const CHAT_LABEL_LABELS: Record<ChatLabel, string> = {
  needs_reply: 'Нужен ответ',
  prices_silent: 'Цены отправлены, молчит',
  agent_unavailable: 'Агент недоступен',
}

export const OBJECTION_CATEGORIES = ['expensive', 'think_about_it', 'dont_believe', 'no_time', 'ask_partner', 'tried_before', 'later'] as const
export const OBJECTION_LABELS: Record<(typeof OBJECTION_CATEGORIES)[number], string> = {
  expensive: 'Дорого',
  think_about_it: 'Подумаю',
  dont_believe: 'Не верю',
  no_time: 'Нет времени',
  ask_partner: 'Посоветуюсь с партнёром',
  tried_before: 'Уже пробовал',
  later: 'Потом',
}

/** Категории запроса — зеркало REQUEST_CATEGORIES из apps/api/src/bot/library/kinds.ts. */
export const REQUEST_CATEGORIES: readonly { key: string; title: string }[] = [
  { key: 'relationships.breakup', title: 'Расставание' },
  { key: 'relationships.psych_astro', title: 'Психология и астрология' },
  { key: 'relationships.single', title: 'Нет отношений, не получается построить' },
  { key: 'relationships.ex_conflict', title: 'Бывший партнёр или конфликт' },
  { key: 'relationships.triangle', title: 'Любовный треугольник, измены' },
  { key: 'relationships.couple', title: 'Отношения в паре' },
  { key: 'money.love', title: 'Финансы и любовь' },
  { key: 'money.work', title: 'Финансы и работа' },
  { key: 'money.sudden_loss', title: 'Резкая потеря денег' },
  { key: 'money.instability', title: 'Финансовая нестабильность' },
  { key: 'money.more', title: 'Хочет больше денег' },
  { key: 'money.second_business', title: 'Второй бизнес' },
  { key: 'money.relationships', title: 'Финансы и отношения в паре' },
  { key: 'money.health', title: 'Финансы и здоровье' },
  { key: 'health.own', title: 'Здоровье' },
  { key: 'health.child', title: 'Здоровье ребёнка' },
  { key: 'family.child', title: 'Семья, ребёнок' },
  { key: 'family.childbearing', title: 'Деторождение' },
  { key: 'universal.general', title: 'Универсальная' },
  { key: 'universal.seven_roads', title: '7 дорог' },
  { key: 'universal.chakras', title: 'Заблокированы чакры' },
  { key: 'future.general', title: 'На будущее' },
  { key: 'future.3m', title: 'На будущее, 3 месяца' },
  { key: 'request.card_reading', title: 'Карта и разбор по запросу' },
  { key: 'other.phobia_insects', title: 'Боязнь насекомых' },
  { key: 'other.relocation', title: 'Переезд' },
]

/** Тело POST/PUT элемента библиотеки. */
export interface LibraryItemBody {
  kind: LibraryKind
  language: Language
  gender: Gender | null
  category: string | null
  title: string
  text: string
  enabled: boolean
}

/** Тело POST/PUT примера диалога. */
export interface ExampleBody {
  stage: Stage
  situation: string
  client: string
  practitioner: string
  enabled: boolean
}

export interface SandboxSessionDto extends SandboxSummaryDto {
  /** Идёт ход или перемотка — пока true, сессию стоит опрашивать. */
  running: boolean
  lastError: string | null
  handoffReason: HandoffReason | null
  /** Сообщения клиента, на которые агент ещё не отвечал. */
  pendingCount: number
  messages: SandboxMessageDto[]
  memory: BotMemoryDto
  jobs: SandboxJobDto[]
  nextJob: SandboxJobDto | null
  turns: SandboxTurnDto[]
}
