/**
 * Контракт ИИ-агента v2 — зеркало apps/api/src/ai/ai.types.ts и
 * apps/api/src/ai/domain/types.ts. Менять синхронно.
 */

export type ChatMode = 'off' | 'auto' | 'supervised' | 'manager'

export type FunnelStage =
  | 'greeting'
  | 'collect_birth'
  | 'collect_request'
  | 'ack_request'
  | 'diagnostics'
  | 'post_diagnostics'
  | 'offer'
  | 'price'
  | 'discount'
  | 'reminders'
  | 'closed_silent'

export type Gender = 'f' | 'm'

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

export interface NightWindowDto {
  enabled: boolean
  from: string
  to: string
  tz: string
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
  nightWindow: NightWindowDto
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
  nightWindow?: Partial<NightWindowDto>
  markRead?: boolean
  notifyTelegram?: boolean
  handoffPeer?: string | null
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
  breakers: Record<string, string>
}
