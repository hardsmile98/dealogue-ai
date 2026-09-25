/** Агент в реальном чате и список «у менеджера» — зеркало apps/api/src/bot/bot.types.ts. */
import type { BotMemoryDto, BotTurnDto, SandboxJobDto } from './journal';
import type { ChatLabel, ChatMode, HandoffReason, Stage } from './kinds';

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

/** null — агент этот чат не вёл и режим руками не ставили. */
export interface ChatBotStateResponse {
  state: ChatBotStateDto | null;
}

/** Журнал агента в реальном чате. */
export interface ChatJournalDto {
  memory: BotMemoryDto;
  jobs: SandboxJobDto[];
  turns: BotTurnDto[];
}

/** null — агент этот чат не вёл. */
export interface ChatJournalResponse {
  journal: ChatJournalDto | null;
}

/** Строка списка «у менеджера». */
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
