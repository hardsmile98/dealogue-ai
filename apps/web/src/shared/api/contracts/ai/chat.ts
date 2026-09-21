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
  /** Что клиент рассказал о себе — свободные заметки модели. */
  facts: string[]
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

// --- песочница ---------------------------------------------------------------

/**
 * Песочница моделирует диалог целиком: состояние живёт в браузере и ходит в
 * каждом запросе, сервер между шагами ничего не помнит. Время виртуальное —
 * шаг «клиент молчит» двигает часы и выполняет наступившие касания.
 */
export interface SimMessage {
  role: 'client' | 'bot' | 'manager'
  text: string
  at: string
  readAt: string | null
  blockKind: string | null
}

export interface SimTurnSummary {
  stageBefore: FunnelStage
  stageAfter: FunnelStage
  clientIntent: string | null
  trigger: TurnTrigger
}

export interface SimState {
  now: string
  startedAt: string
  stage: FunnelStage
  stageEnteredAt: string
  card: ChatAiCardDto
  messages: SimMessage[]
  sentBlockIds: string[]
  usedExampleIds: string[]
  autoMessagesSinceClient: number
  remindersSent: number
  touchPostponedCount: number
  lastIntervalHours: number | null
  diagnosticsSentAt: string | null
  diagnosticsReadAt: string | null
  lastGreetingAt: string | null
  lastClientMessageAt: string | null
  lastBotMessageAt: string | null
  nextTouchKind: TouchKind | null
  nextTouchAt: string | null
  /** Чат передан менеджеру — бот молчит, пока его не вернут. */
  handoff: { reason: HandoffReason; detail: string; at: string } | null
  closedAt: string | null
  turns: SimTurnSummary[]
  turnCount: number
}

/** Карточка клиента в песочнице — те же поля, что ведёт модель в настоящем чате. */
export interface ChatAiCardDto {
  birthDate: string | null
  birthDateText: string | null
  birthPlace: string | null
  gender: Gender | null
  language: string
  requestSummary: string | null
  requestCategoryKey: string | null
  minorHint: boolean
  openThreads: string[]
  facts: string[]
}

/** Разбор одного хода: то же, что в настоящем чате видно в журнале ходов. */
export interface SimTurnInfo {
  trigger: TurnTrigger
  touchKind: TouchKind | null
  stageBefore: FunnelStage
  stageAfter: FunnelStage
  task: string | null
  analysis: Record<string, unknown> | null
  guardNotes: Record<string, unknown>[]
  guardOk: boolean
  examples: { kind: string; title: string }[]
  blocks: { kind: string; title: string }[]
  /** Похожие прошлые случаи, подмешанные в промпт. */
  similarCases: { source: string; outcome: string; clientText: string; answerText: string }[]
  usage: { tokensIn: number; tokensOut: number; durationMs: number; model: string }
  prompts: { system: string; user: string } | null
}

export type SimTouchState = 'fired' | 'planned' | 'postponed' | 'dropped'

export type SimEvent =
  | { kind: 'client'; at: string; text: string }
  | { kind: 'bot'; at: string; messages: { text: string; blockKind: string | null }[]; turn: SimTurnInfo }
  | { kind: 'silent'; at: string; text: string; turn: SimTurnInfo }
  | { kind: 'handoff'; at: string; reason: HandoffReason; text: string; turn: SimTurnInfo | null }
  | { kind: 'skip'; at: string; text: string }
  | { kind: 'stage'; at: string; from: FunnelStage; to: FunnelStage }
  | { kind: 'touch'; at: string; touchKind: TouchKind | null; touchAt: string | null; state: SimTouchState }
  | { kind: 'note'; at: string; text: string }

export interface SimStartSlots {
  birthDate?: string | null
  birthPlace?: string | null
  gender?: Gender | null
  language?: string | null
  requestSummary?: string | null
  requestCategoryKey?: string | null
}

export type SimAction =
  | { kind: 'start'; stage?: FunnelStage | null; slots?: SimStartSlots | null }
  | { kind: 'client'; text: string }
  | { kind: 'wait'; minutes: number; read?: boolean }
  | { kind: 'touch'; touchKind?: TouchKind | null }
  | { kind: 'resume' }

export interface SandboxRequest {
  action: SimAction
  state?: SimState | null
}

export interface SandboxResponse {
  state: SimState
  /** Что произошло на этом шаге — дописывается в конец ленты. */
  events: SimEvent[]
}
