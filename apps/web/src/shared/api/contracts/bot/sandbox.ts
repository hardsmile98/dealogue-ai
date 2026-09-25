/** Песочница агента — зеркало apps/api/src/bot/bot.types.ts. */
import type { BotMemoryDto, SandboxJobDto, SandboxTurnDto } from './journal';
import type { ChatLabel, ChatMode, HandoffReason, Stage } from './kinds';

export interface SandboxSummaryDto {
  id: string;
  accountId: string;
  title: string;
  /** Реальный чат, из которого скопирована переписка. */
  sourceChatId: string | null;
  /** Виртуальное «сейчас» сессии. */
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
  /** Идёт ход или перемотка — пока true, сессию стоит опрашивать. */
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
