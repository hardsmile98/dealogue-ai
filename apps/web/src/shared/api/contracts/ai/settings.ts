/**
 * Настройки ИИ-агента аккаунта: персона, таймеры, лимиты, проверки, провайдер.
 */

import type { ChatMode, Gender } from './common'

export interface PersonaLinkDto {
  title: string
  url: string
}

export interface PersonaDto {
  name: string
  gender: Gender
  bio: string
  tone: string
  habits: string
  city: string
  language: string
  links: PersonaLinkDto[]
}

export interface TimingsDto {
  debounceSec: number
  debounceMaxSec: number
  greetingDebounceMaxSec: number
  firstReplyDelayMinSec: number
  firstReplyDelayMaxSec: number
  birthNudgeAfterMin: number
  diagnosticsDelayMin: number
  reengageAfterReadMin: number
  reengageIfUnreadHours: number
  touchIntervalMinHours: number
  touchIntervalMaxHours: number
  maxReminders: number
  superviseTimeoutHours: number
}

export interface LimitsDto {
  llmCallsPerHour: number
  llmCallsPerDay: number
  botMessagesPerHour: number
  botMessagesPerChatPerDay: number
  autoMessagesWithoutReply: number
}

export interface GuardDto {
  botAdmissionPhrases: string[]
  promisePhrases: string[]
  similarityThreshold: number
  confidenceThreshold: number
}

export interface AiSettingsDto {
  accountId: string
  enabled: boolean
  dryRun: boolean
  defaultChatMode: ChatMode
  assistantForExistingChats: boolean
  persona: PersonaDto
  timings: TimingsDto
  limits: LimitsDto
  guard: GuardDto
  /** IANA-зона аккаунта: в ней считаются дневные метрики. */
  tz: string
  markRead: boolean
  notifyTelegram: boolean
  handoffPeer: string | null
  updatedAt: string
}

/** Всё необязательно: присланное сливается с текущими настройками. */
export interface UpdateAiSettingsRequest {
  enabled?: boolean
  dryRun?: boolean
  defaultChatMode?: 'auto' | 'supervised'
  assistantForExistingChats?: boolean
  persona?: Partial<PersonaDto>
  timings?: Partial<TimingsDto>
  limits?: Partial<LimitsDto>
  guard?: Partial<GuardDto>
  tz?: string
  markRead?: boolean
  notifyTelegram?: boolean
  handoffPeer?: string | null
}

/** Сколько строк снёс сброс аккаунта — по разделам. */
export interface AiResetCountsDto {
  phrases: number
  facts: number
  diagnostics: number
  categories: number
  notes: number
  playbooks: number
  chatStates: number
  turns: number
  drafts: number
  events: number
  jobs: number
  stats: number
  alerts: number
}

/** Ответ `POST …/ai/reset`: свежие настройки и отчёт об удалённом. */
export interface AiResetResultDto {
  settings: AiSettingsDto
  deleted: AiResetCountsDto
}

export interface AiProviderInfoDto {
  name: string
  models: string[]
  configured: boolean
  isDefault: boolean
}

export interface AiProvidersResponse {
  providers: AiProviderInfoDto[]
  defaultModel: string
}

export interface AiHealthDto {
  enabled: boolean
  ready: boolean
  provider: string
  model: string
  breakers: Record<string, { failures: number; open: boolean; retryAfterMs: number }>
}
