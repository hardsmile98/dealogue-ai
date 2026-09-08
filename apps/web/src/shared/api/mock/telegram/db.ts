import { eachDayKey, fromDayKey, toDayKey, addDays, daysBetween } from '@/shared/lib/date'
import type {
  AccountStatsDto,
  ChatDto,
  DailyStatsDto,
  MessageDto,
  SendCodeResponse,
  SignInResponse,
  StatsTotalsDto,
  SubmitPasswordResponse,
  TelegramAccountDto,
} from '../../contracts/telegram'
import { MockApiError } from '../runMock'
import { seedFreshAccount, seedTelegram } from './seed'
import type { SeededAccount } from './seed'

/**
 * In-memory «база» раздела Telegram. Живёт до перезагрузки страницы;
 * подключение и удаление аккаунтов меняют её как настоящий backend.
 *
 * Правила мока для подключения:
 * - телефон: не меньше 10 цифр;
 * - код: 5 цифр, «00000» считается неверным;
 * - если телефон оканчивается на 0 — у аккаунта «включена» 2FA и нужен пароль
 *   (подходит любой от 4 символов).
 */

interface LoginAttempt {
  id: string
  phone: string
  codeVerified: boolean
  passwordRequired: boolean
}

const accounts = new Map<string, SeededAccount>()
const attempts = new Map<string, LoginAttempt>()

for (const seeded of seedTelegram()) {
  accounts.set(seeded.account.id, seeded)
}

function requireAccount(accountId: string): SeededAccount {
  const seeded = accounts.get(accountId)
  if (!seeded) throw new MockApiError(404, 'Аккаунт не найден')
  return seeded
}

function withLiveCounters(seeded: SeededAccount, now = new Date()): TelegramAccountDto {
  const today = toDayKey(now)
  return {
    ...seeded.account,
    newChatsToday: seeded.chats.filter((chat) => toDayKey(chat.firstMessageAt) === today)
      .length,
  }
}

function emptyTotals(): StatsTotalsDto {
  return { total: 0, withCode: 0, withoutCode: 0 }
}

function summarize(chats: ChatDto[], fromKey: string, toKey: string) {
  const from = fromDayKey(fromKey)
  const to = addDays(fromDayKey(toKey), 1)
  const inRange = chats.filter((chat) => {
    const at = new Date(chat.firstMessageAt)
    return at >= from && at < to
  })

  const totals = emptyTotals()
  const byCode = new Map<string, number>()
  const byDay = new Map<string, DailyStatsDto>()
  for (const key of eachDayKey(fromKey, toKey)) {
    byDay.set(key, { date: key, total: 0, withoutCode: 0, byCode: {} })
  }

  for (const chat of inRange) {
    const day = byDay.get(toDayKey(chat.firstMessageAt))
    if (!day) continue
    day.total += 1
    totals.total += 1
    if (chat.leadCode === null) {
      day.withoutCode += 1
      totals.withoutCode += 1
    } else {
      day.byCode[chat.leadCode] = (day.byCode[chat.leadCode] ?? 0) + 1
      byCode.set(chat.leadCode, (byCode.get(chat.leadCode) ?? 0) + 1)
      totals.withCode += 1
    }
  }

  return { totals, byCode, days: [...byDay.values()] }
}

export const telegramMockDb = {
  listAccounts(): TelegramAccountDto[] {
    return [...accounts.values()]
      .map((seeded) => withLiveCounters(seeded))
      .sort((a, b) => a.connectedAt.localeCompare(b.connectedAt))
  },

  getAccount(accountId: string): TelegramAccountDto {
    return withLiveCounters(requireAccount(accountId))
  },

  deleteAccount(accountId: string): void {
    requireAccount(accountId)
    accounts.delete(accountId)
  },

  sendCode(phone: string): SendCodeResponse {
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 10) {
      throw new MockApiError(400, 'Укажите номер телефона в международном формате')
    }
    const normalized = `+${digits}`
    const duplicate = [...accounts.values()].find((s) => s.account.phone === normalized)
    // Переподключать можно только отвалившийся аккаунт; живой — уже подключён.
    if (duplicate && duplicate.account.status === 'connected') {
      throw new MockApiError(409, `Номер ${normalized} уже подключён`)
    }
    const attempt: LoginAttempt = {
      id: `attempt_${Date.now()}`,
      phone: normalized,
      codeVerified: false,
      passwordRequired: digits.endsWith('0'),
    }
    attempts.set(attempt.id, attempt)
    return { attemptId: attempt.id, phone: normalized }
  },

  signIn(attemptId: string, code: string): SignInResponse {
    const attempt = attempts.get(attemptId)
    if (!attempt) throw new MockApiError(404, 'Попытка входа устарела — начните заново')
    if (!/^\d{5}$/.test(code) || code === '00000') {
      throw new MockApiError(400, 'Неверный код. Проверьте сообщение от Telegram')
    }
    attempt.codeVerified = true
    if (attempt.passwordRequired) {
      return { status: 'password_required', account: null }
    }
    return { status: 'connected', account: finishAttempt(attempt) }
  },

  submitPassword(attemptId: string, password: string): SubmitPasswordResponse {
    const attempt = attempts.get(attemptId)
    if (!attempt) throw new MockApiError(404, 'Попытка входа устарела — начните заново')
    if (!attempt.codeVerified) throw new MockApiError(400, 'Сначала подтвердите код')
    if (password.length < 4) throw new MockApiError(400, 'Неверный облачный пароль')
    return { status: 'connected', account: finishAttempt(attempt) }
  },

  listChats(accountId: string): ChatDto[] {
    return [...requireAccount(accountId).chats].sort((a, b) =>
      b.lastMessage.sentAt.localeCompare(a.lastMessage.sentAt),
    )
  },

  listMessages(accountId: string, chatId: string): MessageDto[] {
    const seeded = requireAccount(accountId)
    if (!seeded.chats.some((chat) => chat.id === chatId)) {
      throw new MockApiError(404, 'Чат не найден')
    }
    return seeded.messages.filter((message) => message.chatId === chatId)
  },

  getStats(accountId: string, from: string, to: string): AccountStatsDto {
    const seeded = requireAccount(accountId)
    if (from > to) throw new MockApiError(400, 'Начало периода позже его конца')

    const current = summarize(seeded.chats, from, to)
    const length = daysBetween(from, to)
    const previousTo = toDayKey(addDays(fromDayKey(from), -1))
    const previousFrom = toDayKey(addDays(fromDayKey(from), -length))
    const previous = summarize(seeded.chats, previousFrom, previousTo)

    return {
      from,
      to,
      days: current.days,
      codes: [...current.byCode.entries()]
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count || Number(a.code) - Number(b.code)),
      totals: current.totals,
      previousTotals: previous.totals,
    }
  },
}

function finishAttempt(attempt: LoginAttempt): TelegramAccountDto {
  attempts.delete(attempt.id)

  // Переподключение: сохраняем историю, только оживляем статус.
  const existing = [...accounts.values()].find((s) => s.account.phone === attempt.phone)
  if (existing) {
    existing.account = {
      ...existing.account,
      status: 'connected',
      statusMessage: null,
      lastSyncAt: new Date().toISOString(),
    }
    return withLiveCounters(existing)
  }

  const id = `acc_${attempt.phone.replace(/\D/g, '')}`
  const seeded = seedFreshAccount(id, attempt.phone)
  accounts.set(id, seeded)
  return withLiveCounters(seeded)
}
