/**
 * Контракт backend-API раздела Telegram — зеркало
 * apps/api/src/telegram/telegram.types.ts. Менять синхронно.
 *
 * Все даты — ISO-строки; дни статистики — `YYYY-MM-DD`.
 */

export type TelegramAccountStatus =
  | 'connected'
  /** Авторизация начата, но код или пароль ещё не подтверждены. */
  | 'pending'
  /** Сессия завершена на стороне Telegram — нужно переподключить. */
  | 'disconnected'
  | 'error'

export interface TelegramAccountDto {
  id: string
  phone: string
  username: string | null
  displayName: string
  status: TelegramAccountStatus
  /** Пояснение к статусу для disconnected / error, иначе null. */
  statusMessage: string | null
  connectedAt: string
  lastSyncAt: string | null
  /** Сколько новых диалогов (первых входящих сообщений) появилось сегодня. */
  newChatsToday: number
}

export type MessageDirection = 'in' | 'out'

/** Вид вложения; null — обычный текст. */
export type MediaKind = 'photo' | 'voice' | 'video' | 'video_note' | 'audio' | 'document' | 'sticker' | 'other'

export interface ChatPeerDto {
  id: string
  name: string
  username: string | null
  phone: string | null
}

/** Причина пометки «требует внимания» — тип открытого алерта. */
export type AttentionReason =
  | 'handoff'
  | 'minor'
  | 'media'
  | 'stale_lead'
  | 'library_incomplete'
  | 'ai_error'
  | 'anomaly'

export interface ChatAttentionDto {
  needed: boolean
  reason: AttentionReason | null
  at: string | null
}

export interface ChatDto {
  id: string
  accountId: string
  peer: ChatPeerDto
  lastMessage: {
    text: string
    sentAt: string
    direction: MessageDirection
  }
  messagesCount: number
  /** Когда собеседник написал первое сообщение — по нему считается статистика. */
  firstMessageAt: string
  /** Код, вычлененный из первого входящего сообщения («Код: 5» → "5"), или null. */
  leadCode: string | null
  /** До какого id собеседник прочитал наши сообщения. */
  readOutboxMaxId: number
  attention: ChatAttentionDto
}

export interface MessageDto {
  id: string
  chatId: string
  telegramMessageId: number
  direction: MessageDirection
  text: string
  mediaKind: MediaKind | null
  sentAt: string
  /** Когда собеседник прочитал наше исходящее. */
  readAt: string | null
  /** Сообщение отправил бот (ход ИИ-агента), а не человек. */
  byBot: boolean
  aiTurnId: string | null
}

export interface SendMessageRequest {
  accountId: string
  chatId: string
  text: string
}

export interface DailyStatsDto {
  /** `YYYY-MM-DD` */
  date: string
  total: number
  withoutCode: number
  byCode: Record<string, number>
}

export interface CodeStatsDto {
  code: string
  count: number
}

export interface StatsTotalsDto {
  total: number
  withCode: number
  withoutCode: number
}

export interface AccountStatsDto {
  from: string
  to: string
  days: DailyStatsDto[]
  /** По убыванию количества. */
  codes: CodeStatsDto[]
  totals: StatsTotalsDto
  /** Те же итоги за предыдущий период той же длины — для дельты. */
  previousTotals: StatsTotalsDto
}

export interface AccountStatsQuery {
  accountId: string
  from: string
  to: string
  /** IANA-зона, в которой считать «день» (по умолчанию — зона браузера). */
  tz?: string
}

export interface ChatsQuery {
  accountId: string
}

export interface ChatQuery {
  accountId: string
  chatId: string
}

// --- Подключение аккаунта (MTProto-логин пользователя) -----------------

export interface SendCodeRequest {
  phone: string
}

export interface SendCodeResponse {
  /** Идентификатор попытки входа — передаётся вместе с кодом. */
  attemptId: string
  phone: string
}

export interface SignInRequest {
  attemptId: string
  code: string
}

export type SignInResponse =
  | { status: 'connected'; account: TelegramAccountDto }
  /** Включена двухэтапная аутентификация — нужен облачный пароль. */
  | { status: 'password_required'; account: null }

export interface SubmitPasswordRequest {
  attemptId: string
  password: string
}

export interface SubmitPasswordResponse {
  status: 'connected'
  account: TelegramAccountDto
}
