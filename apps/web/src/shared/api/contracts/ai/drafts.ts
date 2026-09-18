/**
 * Черновики менеджера: то, что бот предлагает отправить, когда решает человек.
 */

import type { ChatMode, FunnelStage, HandoffReason, PhraseKind, TurnMessageDto } from './common'

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

/** Похожий прошлый случай, на который опирался черновик. */
export interface SimilarCaseDto {
  id: string
  source: 'draft' | 'turn'
  clientText: string
  answerText: string
  createdAt: string
}

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
  /** На что опирался черновик. */
  similarCases: SimilarCaseDto[]
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
