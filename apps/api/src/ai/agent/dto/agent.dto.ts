import type {
  ChatMode,
  DecisionSource,
  DraftKind,
  DraftStatus,
  FunnelStage,
  Gender,
  HandoffReason,
  TouchKind,
  TurnOutcome,
  TurnRating,
  TurnTrigger,
} from '../../domain/types.js';
import type { AiChatStateEntity } from '../../entities/ai-chat-state.entity.js';
import type { AiDraftEntity } from '../../entities/ai-draft.entity.js';
import type { AiTurnEntity, TurnMessage } from '../../entities/ai-turn.entity.js';
import { clientCard } from '../card/turn-card.js';

/** DTO хода агента — зеркало apps/web/src/shared/api/contracts/ai.ts. */

export interface ChatAiSlotsDto {
  birthDate: string | null;
  birthDateText: string | null;
  birthPlace: string | null;
  age: number | null;
  isMinor: boolean;
  gender: Gender | null;
  language: string;
  requestCategoryKey: string | null;
  requestSummary: string | null;
  manualSlots: string[];
  /** Открытые нитки разговора: неотвеченные вопросы, возражения, обещания. */
  openThreads: string[];
  /** Что клиент рассказал о себе — свободные заметки модели. */
  facts: string[];
  /** Откуда взялось поле карточки: источник и слова клиента, из которых это следует. */
  sources: Record<string, { source: string; evidence: string | null; at: string }>;
}

export interface ChatAiStateDto {
  chatId: string;
  mode: ChatMode;
  stage: FunnelStage;
  stageEnteredAt: string | null;
  nextTouchKind: TouchKind | null;
  nextTouchAt: string | null;
  remindersSent: number;
  slots: ChatAiSlotsDto;
  handoffReason: HandoffReason | null;
  handoffAt: string | null;
  diagnosticsSentAt: string | null;
  diagnosticsReadAt: string | null;
  lastClientMessageAt: string | null;
  lastBotMessageAt: string | null;
  lastManagerMessageAt: string | null;
  manualNotes: string | null;
  funnelStartedAt: string | null;
  closedAt: string | null;
  /** Открытый черновик (передача или ход под контролем). */
  draft: DraftDto | null;
  updatedAt: string;
}

/** Короткая сводка для списка чатов. */
export interface ChatAiSummaryDto {
  chatId: string;
  mode: ChatMode;
  stage: FunnelStage;
  nextTouchKind: TouchKind | null;
  nextTouchAt: string | null;
  hasPendingDraft: boolean;
  handoffReason: HandoffReason | null;
}

/** Похожий прошлый случай, на который опирался черновик (раздел 9.3 ТЗ). */
export interface SimilarCaseDto {
  id: string;
  source: 'draft' | 'turn';
  clientText: string;
  answerText: string;
  createdAt: string;
}

export interface DraftDto {
  id: string;
  accountId: string;
  chatId: string;
  turnId: string | null;
  kind: DraftKind;
  status: DraftStatus;
  clientText: string;
  handoffReason: HandoffReason | null;
  messages: TurnMessage[];
  rationale: string | null;
  finalText: string | null;
  decisionSource: DecisionSource | null;
  /** На что опирался черновик; пусто, если похожих случаев не нашлось. */
  similarCases: SimilarCaseDto[];
  createdAt: string;
  decidedAt: string | null;
}

/** Строка очереди «Требуют внимания»: черновик плюс кто и где (раздел 12.3 ТЗ). */
export interface DraftListItemDto extends DraftDto {
  stage: FunnelStage | null;
  mode: ChatMode | null;
  chat: { peerName: string; peerUsername: string | null } | null;
  account: { displayName: string; phone: string } | null;
}

export interface TurnDto {
  id: string;
  chatId: string;
  trigger: TurnTrigger;
  touchKind: TouchKind | null;
  stageBefore: FunnelStage | null;
  stageAfter: FunnelStage | null;
  inputMessageIds: string[];
  model: string | null;
  analysis: Record<string, unknown> | null;
  messagesPlanned: TurnMessage[];
  messagesSent: TurnMessage[];
  guardNotes: Record<string, unknown>[];
  outcome: TurnOutcome;
  error: string | null;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  rating: TurnRating | null;
  ratingNote: string | null;
  /** Сколько похожих случаев подмешали в промпт этого хода. */
  similarCases: number;
  /** Клиент ответил на этот ход (в пределах суток). */
  repliedAt: string | null;
  createdAt: string;
}

export interface AiOverviewDto {
  enabled: boolean;
  dryRun: boolean;
  defaultChatMode: ChatMode;
  chatsByMode: Record<string, number>;
  chatsByStage: Record<string, number>;
  upcomingTouches: { chatId: string; peerName: string; kind: TouchKind; at: string; stage: FunnelStage }[];
  pendingDrafts: number;
  turnsToday: { total: number; sent: number; dryRun: number; handoff: number; error: number };
  provider: { name: string; model: string; ready: boolean; breakerOpen: boolean };
}

export function toChatAiStateDto(
  row: AiChatStateEntity,
  draft: AiDraftEntity | null,
  similarCases: SimilarCaseDto[] = [],
): ChatAiStateDto {
  const card = clientCard(row, row.language);
  return {
    chatId: row.chatId,
    mode: row.mode,
    stage: row.stage,
    stageEnteredAt: iso(row.stageEnteredAt),
    nextTouchKind: row.nextTouchKind,
    nextTouchAt: iso(row.nextTouchAt),
    remindersSent: row.remindersSent,
    slots: {
      birthDate: row.birthDate,
      birthDateText: row.birthDateText,
      birthPlace: row.birthPlace,
      age: row.age,
      isMinor: row.isMinor,
      gender: row.gender,
      language: row.language,
      requestCategoryKey: row.requestCategoryKey,
      requestSummary: row.requestSummary,
      manualSlots: row.manualSlots,
      openThreads: card.openThreads,
      facts: card.facts,
      sources: card.meta as Record<string, { source: string; evidence: string | null; at: string }>,
    },
    handoffReason: row.handoffReason,
    handoffAt: iso(row.handoffAt),
    diagnosticsSentAt: iso(row.diagnosticsSentAt),
    diagnosticsReadAt: iso(row.diagnosticsReadAt),
    lastClientMessageAt: iso(row.lastClientMessageAt),
    lastBotMessageAt: iso(row.lastBotMessageAt),
    lastManagerMessageAt: iso(row.lastManagerMessageAt),
    manualNotes: row.manualNotes,
    funnelStartedAt: iso(row.funnelStartedAt),
    closedAt: iso(row.closedAt),
    draft: draft ? toDraftDto(draft, similarCases) : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toChatAiSummaryDto(row: AiChatStateEntity, hasPendingDraft: boolean): ChatAiSummaryDto {
  return {
    chatId: row.chatId,
    mode: row.mode,
    stage: row.stage,
    nextTouchKind: row.nextTouchKind,
    nextTouchAt: iso(row.nextTouchAt),
    hasPendingDraft,
    handoffReason: row.handoffReason,
  };
}

export function toDraftDto(row: AiDraftEntity, similarCases: SimilarCaseDto[] = []): DraftDto {
  return {
    id: row.id,
    accountId: row.accountId,
    chatId: row.chatId,
    turnId: row.turnId,
    kind: row.kind,
    status: row.status,
    clientText: row.clientText,
    handoffReason: row.handoffReason,
    messages: row.draftMessages,
    rationale: row.draftRationale,
    finalText: row.finalText,
    decisionSource: row.decisionSource,
    similarCases,
    createdAt: row.createdAt.toISOString(),
    decidedAt: iso(row.decidedAt),
  };
}

export function toDraftListItemDto(
  row: AiDraftEntity,
  state: { stage: FunnelStage; mode: ChatMode } | null,
  chat: { peerName: string; peerUsername: string | null } | null,
  account: { displayName: string; phone: string } | null,
): DraftListItemDto {
  return {
    ...toDraftDto(row),
    stage: state?.stage ?? null,
    mode: state?.mode ?? null,
    chat,
    account,
  };
}

export function toTurnDto(row: AiTurnEntity): TurnDto {
  return {
    id: row.id,
    chatId: row.chatId,
    trigger: row.trigger,
    touchKind: row.touchKind,
    stageBefore: row.stageBefore,
    stageAfter: row.stageAfter,
    inputMessageIds: row.inputMessageIds,
    model: row.model,
    analysis: row.analysis,
    messagesPlanned: row.messagesPlanned,
    messagesSent: row.messagesSent,
    guardNotes: row.guardNotes,
    outcome: row.outcome,
    error: row.error,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    durationMs: row.durationMs,
    rating: row.rating,
    ratingNote: row.ratingNote,
    similarCases: row.similarCaseIds?.length ?? 0,
    repliedAt: iso(row.repliedAt),
    createdAt: row.createdAt.toISOString(),
  };
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}
