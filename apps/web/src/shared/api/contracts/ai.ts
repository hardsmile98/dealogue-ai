/**
 * Контракт backend-API раздела ИИ-агента — зеркало
 * apps/api/src/ai/ai.types.ts, prompt/sales-script.schema.ts и
 * learning/style-profile.schema.ts. Менять синхронно.
 */

export interface StageDto {
  /** Технический ключ: латиница, цифры, подчёркивание. */
  key: string
  name: string
  goal: string
  templates: string[]
  advanceWhen?: string
}

export interface QaPairDto {
  q: string
  a: string
}

export interface ObjectionDto {
  objection: string
  answer: string
}

export interface SalesScriptDto {
  persona: string
  tone: string
  stages: StageDto[]
  handoffStageKey: string
  facts: string[]
  faq: QaPairDto[]
  objections: ObjectionDto[]
  forbidden: string[]
  handoffTemplate: string
  pinnedStyleExamples: string[]
}

export interface FollowupStepDto {
  /** Через сколько дней молчания клиента слать касание (дробные — для тестов). */
  afterDays: number
  goal: string
  template?: string
}

export interface WorkingHoursDto {
  tz: string
  /** 1 = понедельник … 7 = воскресенье. */
  days: number[]
  from: string
  to: string
}

export interface AiSettingsDto {
  accountId: string
  enabled: boolean
  provider: string | null
  model: string | null
  script: SalesScriptDto
  workingHours: WorkingHoursDto | null
  debounceSec: number
  replyDelayCapSec: number
  maxAiMessagesPerChat: number
  maxAiMessagesPerDay: number
  contextMessages: number
  pauseOnHandoff: boolean
  notifyTelegram: boolean
  handoffPeer: string | null
  markRead: boolean
  followupsEnabled: boolean
  followups: FollowupStepDto[]
  useLearnedStyle: boolean
  retrievalExamples: number
  updatedAt: string
}

export type UpdateAiSettingsRequest = Partial<Omit<AiSettingsDto, 'accountId' | 'updatedAt'>>

export interface AiProviderInfoDto {
  name: string
  models: string[]
  configured: boolean
  isDefault: boolean
}

export interface AiProvidersResponse {
  providers: AiProviderInfoDto[]
  defaultModel: string
  enabled: boolean
}

export type PhraseIntent =
  | 'greeting'
  | 'qualify'
  | 'price'
  | 'materials'
  | 'call_offer'
  | 'objection'
  | 'close'
  | 'payment'
  | 'followup'
  | 'other'

export interface StyleHabitsDto {
  avgMessageLen: number
  multiMessageShare: number
  emojiTop: string[]
  greetingPatterns: string[]
  signoffPatterns: string[]
  usesVoice: boolean
  lowercaseStartShare: number
  noTrailingPeriodShare: number
  messageLenP90: number
}

export interface StyleTimingDto {
  responseDelaySec: { p25: number; p50: number; p75: number; p90: number }
  activeHours: { from: number; to: number }
  activeDays: number[]
  tz: string
}

export interface StyleProfileContentDto {
  styleGuide: string
  habits: StyleHabitsDto
  timing: StyleTimingDto | null
  phrasebook: { intent: PhraseIntent; phrases: string[] }[]
  faq: { q: string; a: string; seen: number }[]
  objections: { objection: string; answer: string; seen: number }[]
  facts: string[]
  dialogExemplars: { chatId: string; summary: string; outcome: 'won' | 'lost' | 'unknown' }[]
}

export type StyleProfileOverridesDto = Partial<StyleProfileContentDto>

export type StyleProfileStatus = 'empty' | 'building' | 'ready' | 'error'

export interface StyleProfileDto {
  accountId: string
  version: number
  status: StyleProfileStatus
  progress: { dialogsTotal: number; dialogsDone: number; stage: string } | null
  builtAt: string | null
  sourceStats: {
    dialogs: number
    exchanges: number
    managerMessages: number
    from: string | null
    to: string | null
    thin: boolean
  } | null
  /** Выученное как есть. */
  profile: StyleProfileContentDto
  overrides: StyleProfileOverridesDto | null
  /** Выученное с правками — то, что видит модель. */
  effective: StyleProfileContentDto
  error: string | null
}

export type AiJobType = 'reply' | 'followup' | 'digest' | 'import'
export type AiJobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'

export interface AiJobDto {
  id: string
  type: AiJobType
  status: AiJobStatus
  runAt: string
  attempts: number
  maxAttempts: number
  payload: { progress?: { chatsTotal?: number; chatsDone?: number; messages?: number } }
  lastError: string | null
  updatedAt: string
}

export interface LearningStatusDto {
  deepHistoryStatus: 'none' | 'running' | 'done' | 'error'
  importJob: AiJobDto | null
  digestJob: AiJobDto | null
  profile: StyleProfileDto
  estimate: { dialogs: number; chars: number; exchanges: number; thin: boolean } | null
}

export type AiRunTrigger = 'inbound' | 'followup' | 'test' | 'manual'
export type AiRunStatus = 'sent' | 'silent' | 'skipped' | 'error' | 'draft'

export interface AiDecisionDto {
  messages: string[]
  stage: string
  confidence: number
  ready_to_pay: boolean
  needs_human: boolean
  silent: boolean
  reason: string
}

export interface AiGuardDto {
  messages: string[]
  stage: string | null
  silent: boolean
  readyToPay: boolean
  needsHuman: boolean
  notes: string[]
}

export interface AiRunDto {
  id: string
  chatId: string
  trigger: AiRunTrigger
  followupStep: number | null
  status: AiRunStatus
  skipReason: string | null
  decision: (AiDecisionDto & { guard?: AiGuardDto }) | null
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheHitTokens: number
  latencyMs: number
  error: string | null
  createdAt: string
}

export interface TestGenerateRequest {
  accountId: string
  chatId: string
  scriptOverride?: SalesScriptDto
  followupStep?: number
}

export interface TestGenerateResponse {
  runId: string
  decision: AiDecisionDto
  guard: AiGuardDto
  prompt: { system: string; messages: { role: string; content: string }[] }
  exchanges: { clientText: string; managerText: string; similarity: number; intent: string | null }[]
  usage: { inputTokens: number; outputTokens: number; cacheHitTokens: number }
  latencyMs: number
  provider: string
  model: string
  actualManagerReply: string | null
}

export interface SetChatAiRequest {
  accountId: string
  chatId: string
  enabled: boolean
}

export interface ChatAiQuery {
  accountId: string
  chatId: string
}
