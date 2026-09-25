import type { BotChatStateEntity } from '../entities/bot-chat-state.entity.js';
import type { BotSandboxMessageEntity } from '../entities/bot-sandbox-message.entity.js';
import type { BotSandboxSessionEntity } from '../entities/bot-sandbox-session.entity.js';
import type {
  ChatLabel,
  ChatMode,
  HandoffReason,
  Stage,
} from '../library/kinds.js';
import type { BotMemoryDto, SandboxJobDto, SandboxTurnDto } from './journal.js';

export interface SandboxSummaryDto {
  id: string;
  accountId: string;
  title: string;
  /** Реальный чат, из которого скопирована переписка. */
  sourceChatId: string | null;
  virtualNow: string;
  stage: Stage;
  mode: ChatMode;
  label: ChatLabel | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SandboxMessageDto {
  id: number;
  direction: 'in' | 'out';
  text: string;
  mediaKind: string | null;
  sentAt: string;
  readAt: string | null;
  /** Тело вехи из библиотеки. */
  block: boolean;
  delayMs: number | null;
  typingMs: number | null;
  turnId: string | null;
}

export interface SandboxSessionDto extends SandboxSummaryDto {
  /** Идёт ход или перемотка — веб опрашивает, пока true. */
  running: boolean;
  /** Ошибка последнего фонового запуска (сеть, модель), если была. */
  lastError: string | null;
  handoffReason: HandoffReason | null;
  /** Сообщения клиента, на которые агент ещё не отвечал. */
  pendingCount: number;
  messages: SandboxMessageDto[];
  memory: BotMemoryDto;
  jobs: SandboxJobDto[];
  nextJob: SandboxJobDto | null;
  turns: SandboxTurnDto[];
}

export function toSandboxSummaryDto(
  session: BotSandboxSessionEntity,
  state: Pick<BotChatStateEntity, 'mode' | 'label'>,
  stage: Stage,
  messageCount: number,
): SandboxSummaryDto {
  return {
    id: session.id,
    accountId: session.accountId,
    title: session.title,
    sourceChatId: session.sourceChatId,
    virtualNow: session.virtualNow.toISOString(),
    stage,
    mode: state.mode,
    label: state.label,
    messageCount,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

export function toSandboxMessageDto(
  message: BotSandboxMessageEntity,
): SandboxMessageDto {
  return {
    id: message.id,
    direction: message.direction,
    text: message.text,
    mediaKind: message.mediaKind,
    sentAt: message.sentAt.toISOString(),
    readAt: message.readAt?.toISOString() ?? null,
    block: message.block,
    delayMs: message.delayMs,
    typingMs: message.typingMs,
    turnId: message.turnId,
  };
}
