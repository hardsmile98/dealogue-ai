import type {
  TelegramAccountEntity,
  TelegramAccountStatus,
} from './entities/telegram-account.entity.js';
import type {
  AttentionReason,
  MessageDirection,
  TelegramChatEntity,
} from './entities/telegram-chat.entity.js';
import type { MediaKind, TelegramMessageEntity } from './entities/telegram-message.entity.js';

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
  /** До какого id собеседник прочитал наши сообщения. */
  readOutboxMaxId: number;
  attention: ChatAttentionDto;
}

export interface ChatAttentionDto {
  needed: boolean;
  reason: AttentionReason | null;
  at: string | null;
}

export interface MessageDto {
  id: string;
  chatId: string;
  telegramMessageId: number;
  direction: MessageDirection;
  text: string;
  mediaKind: MediaKind | null;
  sentAt: string;
  /** Когда собеседник прочитал наше исходящее. */
  readAt: string | null;
  /** Сообщение отправил бот (ход ИИ-агента), а не человек. */
  byBot: boolean;
  aiTurnId: string | null;
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
    readOutboxMaxId: chat.readOutboxMaxId,
    attention: {
      needed: chat.needsAttention,
      reason: chat.attentionReason,
      at: chat.attentionAt?.toISOString() ?? null,
    },
  };
}

export function toMessageDto(message: TelegramMessageEntity): MessageDto {
  return {
    id: message.id,
    chatId: message.chatId,
    telegramMessageId: message.telegramMessageId,
    direction: message.direction,
    text: message.text,
    mediaKind: message.mediaKind ?? null,
    sentAt: message.sentAt.toISOString(),
    readAt: message.readAt?.toISOString() ?? null,
    byBot: message.aiTurnId !== null && message.aiTurnId !== undefined,
    aiTurnId: message.aiTurnId ?? null,
  };
}
