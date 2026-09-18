/**
 * Ход агента: состояние чата, журнал ходов, обзор аккаунта, песочница.
 */

import type {
  ChatMode,
  FunnelStage,
  Gender,
  HandoffReason,
  TouchKind,
  TurnMessageDto,
  TurnOutcome,
  TurnTrigger,
} from './common'
import type { DraftDto } from './drafts'

export interface ChatAiSlotsDto {
  birthDate: string | null
  birthDateText: string | null
  birthPlace: string | null
  age: number | null
  isMinor: boolean
  gender: Gender | null
  language: string
  requestCategoryKey: string | null
  requestSummary: string | null
  manualSlots: string[]
  /** Открытые нитки разговора: неотвеченные вопросы, возражения, обещания. */
  openThreads: string[]
  /** Откуда взялось поле карточки и на каких словах клиента это основано. */
  sources: Record<string, { source: string; evidence: string | null; at: string }>
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
  /** Сколько похожих случаев подмешали в промпт хода. */
  similarCases: number
  /** Клиент ответил на этот ход в течение суток. */
  repliedAt: string | null
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
  /** Похожие прошлые случаи, подмешанные в промпт. */
  similarCases: { source: string; clientText: string; answerText: string }[]
  usage: { tokensIn: number; tokensOut: number; durationMs: number; model: string }
  prompts: { system: string; user: string } | null
}
