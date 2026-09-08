import type {
  TelegramAccountEntity,
  TelegramAccountStatus,
} from './entities/telegram-account.entity.js';
import type { MessageDirection, TelegramChatEntity } from './entities/telegram-chat.entity.js';
import type { TelegramMessageEntity } from './entities/telegram-message.entity.js';

/**
 * Формы ответов — зеркало контракта фронтенда
 * (apps/web/src/shared/api/contracts/telegram.ts). Менять синхронно.
 */

export interface TelegramAccountDto {
  id: string;
  phone: string;
  username: string | null;
  displayName: string;
  status: TelegramAccountStatus;
  statusMessage: string | null;
  connectedAt: string;
  lastSyncAt: string | null;
  newChatsToday: number;
}

export interface ChatDto {
  id: string;
  accountId: string;
  peer: {
    id: string;
    name: string;
    username: string | null;
    phone: string | null;
  };
  lastMessage: {
    text: string;
    sentAt: string;
    direction: MessageDirection;
  };
  messagesCount: number;
  firstMessageAt: string;
  leadCode: string | null;
}

export interface MessageDto {
  id: string;
  chatId: string;
  direction: MessageDirection;
  text: string;
  sentAt: string;
}

export interface DailyStatsDto {
  date: string;
  total: number;
  withoutCode: number;
  byCode: Record<string, number>;
}

export interface StatsTotalsDto {
  total: number;
  withCode: number;
  withoutCode: number;
}

export interface AccountStatsDto {
  from: string;
  to: string;
  days: DailyStatsDto[];
  codes: { code: string; count: number }[];
  totals: StatsTotalsDto;
  previousTotals: StatsTotalsDto;
}

export interface SendCodeResponse {
  attemptId: string;
  phone: string;
}

export type SignInResponse =
  | { status: 'connected'; account: TelegramAccountDto }
  | { status: 'password_required'; account: null };

export interface SubmitPasswordResponse {
  status: 'connected';
  account: TelegramAccountDto;
}

export function toAccountDto(
  account: TelegramAccountEntity,
  newChatsToday: number,
): TelegramAccountDto {
  return {
    id: account.id,
    phone: account.phone,
    username: account.username,
    displayName: account.displayName,
    status: account.status,
    statusMessage: account.statusMessage,
    connectedAt: account.connectedAt.toISOString(),
    lastSyncAt: account.lastSyncAt?.toISOString() ?? null,
    newChatsToday,
  };
}

export function toChatDto(chat: TelegramChatEntity): ChatDto {
  const lastAt = chat.lastMessageAt ?? chat.firstMessageAt ?? chat.createdAt;
  return {
    id: chat.id,
    accountId: chat.accountId,
    peer: {
      id: chat.peerId,
      name: chat.peerName,
      username: chat.peerUsername,
      phone: chat.peerPhone,
    },
    lastMessage: {
      text: chat.lastMessageText,
      sentAt: lastAt.toISOString(),
      direction: chat.lastMessageDirection ?? 'in',
    },
    messagesCount: chat.messagesCount,
    firstMessageAt: (chat.firstMessageAt ?? lastAt).toISOString(),
    leadCode: chat.leadCode,
  };
}

export function toMessageDto(message: TelegramMessageEntity): MessageDto {
  return {
    id: message.id,
    chatId: message.chatId,
    direction: message.direction,
    text: message.text,
    sentAt: message.sentAt.toISOString(),
  };
}
