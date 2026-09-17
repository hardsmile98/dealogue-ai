/**
 * Контракт ИИ-агента v2 — зеркало apps/api/src/ai/ai.types.ts,
 * apps/api/src/ai/domain/types.ts и apps/api/src/ai/library/library.types.ts.
 * Менять синхронно.
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

export const FUNNEL_STAGES: FunnelStage[] = [
  'greeting',
  'collect_birth',
  'collect_request',
  'ack_request',
  'diagnostics',
  'post_diagnostics',
  'offer',
  'price',
  'discount',
  'reminders',
  'closed_silent',
]

export type Gender = 'f' | 'm'

export type PhraseUsage = 'example' | 'block'

export type PhraseKind =
  | 'greeting'
  | 'birth_nudge'
  | 'intro'
  | 'empathy'
  | 'ack_request'
  | 'links'
  | 'diag_closing'
  | 'reengage'
  | 'offer'
  | 'offer_question'
  | 'price'
  | 'price_question'
  | 'objection'
  | 'discount'
  | 'reminder'
  | 'quick_reply'

export const PHRASE_KINDS: PhraseKind[] = [
  'greeting',
  'birth_nudge',
  'intro',
  'empathy',
  'ack_request',
  'links',
  'diag_closing',
  'reengage',
  'offer',
  'offer_question',
  'price',
  'price_question',
  'objection',
  'discount',
  'reminder',
  'quick_reply',
]

export type FactGroup = 'service' | 'price' | 'link' | 'persona' | 'process' | 'faq'

export const FACT_GROUPS: FactGroup[] = ['service', 'price', 'link', 'persona', 'process', 'faq']

export type LibrarySource = 'seed' | 'manual' | 'copied'

// --- настройки ---------------------------------------------------------------

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
  breakers: Record<string, { failures: number; open: boolean; retryAfterMs: number }>
}

// --- библиотека ----------------------------------------------------------------

export interface CategoryDto {
  id: string
  key: string
  groupKey: string
  title: string
  description: string
  clarifyingFactKey: string | null
  clarifyingQuestion: string | null
  enabled: boolean
  sortOrder: number
  updatedAt: string
}

export type CategoryInput = Omit<CategoryDto, 'id' | 'updatedAt'>

export interface PhraseConditionsDto {
  requiresRequest?: boolean
  avoidIfPriceAsked?: boolean
}

export interface PhraseDto {
  id: string
  usage: PhraseUsage
  kind: PhraseKind
  categoryKey: string | null
  gender: Gender | null
  language: string
  title: string
  text: string
  conditions: PhraseConditionsDto
  enabled: boolean
  weight: number
  sortOrder: number
  sentCount: number
  repliedCount: number
  source: LibrarySource
  updatedAt: string
}

export type PhraseInput = Omit<PhraseDto, 'id' | 'updatedAt' | 'sentCount' | 'repliedCount' | 'source'>

export interface PhrasesQuery {
  usage?: PhraseUsage
  kind?: PhraseKind
  categoryKey?: string
  gender?: Gender
  language?: string
  enabled?: 'true' | 'false'
}

export interface FactDto {
  id: string
  group: FactGroup
  key: string
  title: string
  value: string
  enabled: boolean
  sortOrder: number
  updatedAt: string
}

export type FactInput = Omit<FactDto, 'id' | 'updatedAt'>

export interface DiagnosticDto {
  id: string
  key: string
  title: string
  categoryKey: string | null
  gender: Gender | null
  language: string
  text: string
  /** На сколько сообщений разрежется текст. */
  messagesCount: number
  enabled: boolean
  weight: number
  sortOrder: number
  sentCount: number
  repliedCount: number
  source: LibrarySource
  updatedAt: string
}

export type DiagnosticInput = Omit<
  DiagnosticDto,
  'id' | 'updatedAt' | 'messagesCount' | 'sentCount' | 'repliedCount' | 'source'
>

export interface DiagnosticsQuery {
  categoryKey?: string
  gender?: Gender
  language?: string
  enabled?: 'true' | 'false'
}

export interface PlaybookDto {
  id: string
  stage: FunnelStage
  goal: string
  instructions: string
  requiredBlockKinds: PhraseKind[]
  allowedBlockKinds: PhraseKind[]
  exampleKinds: PhraseKind[]
  noQuestions: boolean
  enabled: boolean
  updatedAt: string
}

export type PlaybookInput = Partial<Omit<PlaybookDto, 'id' | 'stage' | 'updatedAt'>>

export interface NoteDto {
  id: string
  text: string
  scope: string
  source: string
  enabled: boolean
  createdAt: string
}

export interface NoteInput {
  text: string
  scope: string
  enabled: boolean
}

export interface LibraryOverviewDto {
  counts: {
    categories: number
    phrases: number
    blocks: number
    facts: number
    diagnostics: number
    notes: number
  }
  missingBlocks: { stage: FunnelStage; kind: PhraseKind }[]
  missingExamples: { stage: FunnelStage; kind: PhraseKind }[]
  diagnosticsByLanguage: Record<string, { total: number; universal: number }>
  seededAt: string | null
}

export interface UpsertStatsDto {
  created: number
  updated: number
  skipped: number
}

export interface SeedResultDto {
  categories: UpsertStatsDto
  phrases: UpsertStatsDto
  facts: UpsertStatsDto
  diagnostics: UpsertStatsDto
  playbooks: UpsertStatsDto
  notes?: UpsertStatsDto
}

export interface CopyLibraryRequest {
  categories: boolean
  phrases: boolean
  facts: boolean
  diagnostics: boolean
  playbooks: boolean
  notes: boolean
  mode: 'skip' | 'replace'
}

export interface PreviewSplitResponse {
  messages: string[]
  lengths: number[]
}

// --- ход агента: состояние чата, журнал, обзор, песочница ---------------------------

export type TouchKind =
  | 'first_reply'
  | 'birth_nudge'
  | 'diagnostics'
  | 'reengage'
  | 'offer'
  | 'offer_question'
  | 'price'
  | 'price_question'
  | 'discount'
  | 'reminder'

export type TurnTrigger = 'inbound' | 'touch' | 'manual' | 'manager_draft'

export type TurnOutcome = 'sent' | 'silent' | 'dry_run' | 'handoff' | 'cancelled' | 'error' | 'awaiting_approval'

export type HandoffReason =
  | 'ready_to_pay'
  | 'suspects_bot'
  | 'wants_human'
  | 'aggression'
  | 'crisis'
  | 'minor'
  | 'refusal'
  | 'out_of_scope'
  | 'unsure'
  | 'media'
  | 'guard_failed'
  | 'provider_error'
  | 'loop'
  | 'auto_limit'
  | 'language'
  | 'stale_lead'
  | 'manual'

export interface TurnMessageDto {
  text: string
  blockId?: string | null
  telegramMessageId?: number | null
  sentAt?: string | null
}

export interface ChatAiSlotsDto {
  birthDate: string | null
  birthDateText: string | null
  birthPlace: string | null
  age: number | null
  isMinor: boolean
  gender: Gender | null
  genderSource: string | null
  language: string
  requestCategoryKey: string | null
  requestSummary: string | null
  manualSlots: string[]
}

export type DraftKind = 'handoff' | 'supervised'

export type DraftStatus =
  | 'pending'
  | 'pending_classification'
  | 'sent_as_is'
  | 'edited'
  | 'replaced'
  | 'dismissed'
  | 'superseded'

export type DecisionSource = 'web' | 'telegram'

export interface DraftDto {
  id: string
  accountId: string
  chatId: string
  turnId: string | null
  kind: DraftKind
  status: DraftStatus
  clientText: string
  handoffReason: HandoffReason | null
  messages: TurnMessageDto[]
  rationale: string | null
  finalText: string | null
  decisionSource: DecisionSource | null
  createdAt: string
  decidedAt: string | null
}

/** Строка очереди «Требуют внимания»: черновик плюс кто и где. */
export interface DraftListItemDto extends DraftDto {
  stage: FunnelStage | null
  mode: ChatMode | null
  chat: { peerName: string; peerUsername: string | null } | null
  account: { displayName: string; phone: string } | null
}

export interface DraftsQuery {
  /** Через запятую; `all` — любые. По умолчанию — открытые. */
  status?: string
  kind?: DraftKind
  limit?: number
  cursor?: string
}

export interface SendDraftRequest {
  messages: string[]
  /** Менеджер написал свой ответ, а не правил предложенный. */
  own?: boolean
}

export interface DraftToExampleRequest {
  kind: PhraseKind
  title?: string
  text: string
}

export interface DraftToNoteRequest {
  text: string
  scope?: string
}

export interface ChatAiStateDto {
  chatId: string
  mode: ChatMode
  stage: FunnelStage
  stageEnteredAt: string | null
  nextTouchKind: TouchKind | null
  nextTouchAt: string | null
  remindersSent: number
  slots: ChatAiSlotsDto
  handoffReason: HandoffReason | null
  handoffAt: string | null
  diagnosticsSentAt: string | null
  diagnosticsReadAt: string | null
  lastClientMessageAt: string | null
  lastBotMessageAt: string | null
  lastManagerMessageAt: string | null
  manualNotes: string | null
  funnelStartedAt: string | null
  closedAt: string | null
  draft: DraftDto | null
  updatedAt: string
}

export interface ChatAiSummaryDto {
  chatId: string
  mode: ChatMode
  stage: FunnelStage
  nextTouchKind: TouchKind | null
  nextTouchAt: string | null
  hasPendingDraft: boolean
  handoffReason: HandoffReason | null
}

export interface PatchChatAiRequest {
  mode?: ChatMode
  slots?: Partial<{
    birthDate: string | null
    birthPlace: string | null
    gender: Gender | null
    language: string
    requestSummary: string | null
    requestCategoryKey: string | null
  }>
  manualNotes?: string | null
}

export interface ResumeChatAiRequest {
  mode: 'auto' | 'supervised'
  stage?: FunnelStage
  when: 'now' | 'interval'
}

export interface TurnDto {
  id: string
  chatId: string
  trigger: TurnTrigger
  touchKind: TouchKind | null
  stageBefore: FunnelStage | null
  stageAfter: FunnelStage | null
  inputMessageIds: string[]
  model: string | null
  analysis: Record<string, unknown> | null
  messagesPlanned: TurnMessageDto[]
  messagesSent: TurnMessageDto[]
  guardNotes: Record<string, unknown>[]
  outcome: TurnOutcome
  error: string | null
  tokensIn: number
  tokensOut: number
  durationMs: number
  rating: 'good' | 'bad' | null
  ratingNote: string | null
  createdAt: string
}

export interface RateTurnRequest {
  rating: 'good' | 'bad' | null
  note?: string | null
  createNote?: boolean
}

export interface AiOverviewDto {
  enabled: boolean
  dryRun: boolean
  defaultChatMode: ChatMode
  chatsByMode: Record<string, number>
  chatsByStage: Record<string, number>
  upcomingTouches: { chatId: string; peerName: string; kind: TouchKind; at: string; stage: FunnelStage }[]
  pendingDrafts: number
  turnsToday: { total: number; sent: number; dryRun: number; handoff: number; error: number }
  provider: { name: string; model: string; ready: boolean; breakerOpen: boolean }
}

export interface SandboxRequest {
  chatId?: string | null
  history?: { role: 'client' | 'bot' | 'manager'; text: string }[]
  message?: string | null
  touchKind?: TouchKind | null
  stage?: FunnelStage | null
  slots?: Partial<{
    birthDate: string | null
    birthPlace: string | null
    gender: Gender | null
    language: string
    requestSummary: string | null
    requestCategoryKey: string | null
  }> | null
}

export interface SandboxResponse {
  stage: FunnelStage
  stageAfter: FunnelStage
  task: string | null
  verdict: { kind: string; reason?: string; detail?: string }
  analysis: Record<string, unknown> | null
  messages: { text: string; blockKind: string | null }[]
  send: boolean
  silentReason: string | null
  guardNotes: Record<string, unknown>[]
  guardOk: boolean
  examples: { kind: string; title: string }[]
  blocks: { kind: string; title: string }[]
  usage: { tokensIn: number; tokensOut: number; durationMs: number; model: string }
  prompts: { system: string; user: string } | null
}
