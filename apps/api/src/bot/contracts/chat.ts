import type { BotChatStateEntity } from '../entities/bot-chat-state.entity.js';
import type {
  ChatLabel,
  ChatMode,
  HandoffReason,
  Stage,
} from '../library/kinds.js';
import type { HandoffRow } from '../repositories/bot-chat-state.repository.js';
import type { BotMemoryDto, BotTurnDto, SandboxJobDto } from './journal.js';

export interface ChatBotStateDto {
  chatId: string;
  accountId: string;
  mode: ChatMode;
  /** Вычисляется по доставленным вехам. */
  stage: Stage;
  label: ChatLabel | null;
  handoffReason: HandoffReason | null;
  handoffAt: string | null;
  card: Record<string, unknown>;
  summary: string;
  turnsWithoutNudge: number;
  remindersSent: number;
  updatedAt: string;
}

/** Состояние чата или null, если агент этот чат не вёл и режим руками не ставили. */
export interface ChatBotStateResponse {
  state: ChatBotStateDto | null;
}

/** Журнал агента в реальном чате. */
export interface ChatJournalDto {
  memory: BotMemoryDto;
  jobs: SandboxJobDto[];
  turns: BotTurnDto[];
}

/** null — агент этот чат не вёл (обёртка: голый null ушёл бы пустым телом). */
export interface ChatJournalResponse {
  journal: ChatJournalDto | null;
}

/** Чат у менеджера — строка списка «у менеджера». */
export interface HandoffChatDto {
  chatId: string;
  peerName: string;
  peerUsername: string | null;
  stage: Stage;
  label: ChatLabel | null;
  handoffReason: HandoffReason | null;
  handoffAt: string | null;
  /** С какого сообщения клиента он ждёт ответа; null — последнее слово за нами. */
  waitingSince: string | null;
  lastMessageAt: string | null;
  lastMessageText: string;
  lastMessageDirection: 'in' | 'out' | null;
}

export function toChatStateDto(
  state: BotChatStateEntity,
  stage: Stage,
): ChatBotStateDto {
  return {
    chatId: state.chatId,
    accountId: state.accountId,
    mode: state.mode,
    stage,
    label: state.label,
    handoffReason: state.handoffReason,
    handoffAt: state.handoffAt?.toISOString() ?? null,
    card: state.card,
    summary: state.summary,
    turnsWithoutNudge: state.turnsWithoutNudge,
    remindersSent: state.remindersSent,
    updatedAt: state.updatedAt.toISOString(),
  };
}

export function toHandoffChatDto(
  row: HandoffRow,
  stage: Stage,
): HandoffChatDto {
  return {
    chatId: row.chat_id,
    peerName: row.peer_name,
    peerUsername: row.peer_username,
    stage,
    label: row.label,
    handoffReason: row.handoff_reason,
    handoffAt: isoOrNull(row.handoff_at),
    waitingSince: isoOrNull(row.waiting_since),
    lastMessageAt: isoOrNull(row.last_message_at),
    lastMessageText: row.last_message_text,
    lastMessageDirection: row.last_message_direction,
  };
}

/** Сырой SQL отдаёт timestamptz как Date; строку тоже примем. */
function isoOrNull(value: Date | string | null): string | null {
  return value ? new Date(value).toISOString() : null;
}
