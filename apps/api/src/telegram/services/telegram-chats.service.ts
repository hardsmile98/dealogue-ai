import {
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
} from '@nestjs/common';
import { TimeoutError } from '../../common/async.js';
import type {
  ListChatsQueryDto,
  ListMessagesQueryDto,
} from '../dto/chats.dto.js';
import type { TelegramAccountEntity } from '../entities/telegram-account.entity.js';
import type { TelegramChatEntity } from '../entities/telegram-chat.entity.js';
import { decodeChatCursor, encodeChatCursor } from '../lib/chat-cursor.js';
import {
  decodeMessageCursor,
  encodeMessageCursor,
} from '../lib/message-cursor.js';
import { toHttpException } from '../lib/telegram-errors.js';
import { TelegramChatsRepository } from '../repositories/telegram-chats.repository.js';
import { TelegramMessagesRepository } from '../repositories/telegram-messages.repository.js';
import { TelegramEventsService } from '../runtime/telegram-events.service.js';
import { TelegramOutboundService } from '../runtime/telegram-outbound.service.js';
import { toChatDto, toMessageDto } from '../telegram.types.js';
import type {
  ChatsPageDto,
  MessageDto,
  MessagesPageDto,
} from '../telegram.types.js';
import { TelegramIngestService } from './telegram-ingest.service.js';

/**
 * Диалоги аккаунта для веба: постраничный список, переписка и ответ
 * менеджера. Аккаунт и чат приходят уже проверенными AccountAccessGuard.
 */
@Injectable()
export class TelegramChatsService {
  constructor(
    private readonly chats: TelegramChatsRepository,
    private readonly messages: TelegramMessagesRepository,
    private readonly outbound: TelegramOutboundService,
    private readonly ingest: TelegramIngestService,
    private readonly events: TelegramEventsService,
  ) {}

  /**
   * Страница списка по курсору (см. TelegramChatsRepository.page). Счётчик
   * под фильтры считается параллельно со страницей.
   */
  async listPage(
    account: TelegramAccountEntity,
    query: ListChatsQueryDto,
  ): Promise<ChatsPageDto> {
    const cursor = parseCursor(query.cursor, decodeChatCursor);
    const filter = { search: query.search, code: query.code };
    const [rows, total] = await Promise.all([
      // Одна строка сверх лимита отвечает на вопрос «есть ли следующая страница».
      this.chats.page(account.id, filter, cursor, query.limit + 1),
      this.chats.count(account.id, filter),
    ]);
    const items = rows.slice(0, query.limit);
    const hasMore = rows.length > query.limit;
    return {
      items: items.map(toChatDto),
      nextCursor: hasMore ? encodeChatCursor(items[items.length - 1]) : null,
      total,
    };
  }

  /**
   * Страница переписки. Первая — самые свежие сообщения, каждая следующая —
   * более старые, как при прокрутке чата вверх. Внутри страницы сообщения
   * идут по возрастанию времени, чтобы клиенту не пришлось их переворачивать.
   */
  async listMessages(
    chat: TelegramChatEntity,
    query: ListMessagesQueryDto,
  ): Promise<MessagesPageDto> {
    const cursor = parseCursor(query.cursor, decodeMessageCursor);
    // Одна строка сверх лимита отвечает на вопрос «есть ли что-то старше».
    const rows = await this.messages.page(chat.id, cursor, query.limit + 1);
    const newestFirst = rows.slice(0, query.limit);
    const oldest = newestFirst.at(-1);
    return {
      items: newestFirst.reverse().map(toMessageDto),
      nextCursor:
        rows.length > query.limit && oldest
          ? encodeMessageCursor(oldest)
          : null,
    };
  }

  /**
   * Сообщение от менеджера из веба. Пишется в базу сразу и публикуется в
   * шину как обычное исходящее — подписчики не отличают его от ответа из
   * самого Telegram. Отказы Telegram (собеседник заблокировал, аккаунт не
   * подключён и т. п.) уходят понятным статусом, а не 500.
   */
  async sendMessage(
    account: TelegramAccountEntity,
    chat: TelegramChatEntity,
    text: string,
  ): Promise<MessageDto> {
    let sent;
    try {
      sent = await this.outbound.sendText(account.id, chat, text);
    } catch (error) {
      if (error instanceof TimeoutError) {
        // Запрос мог дойти — повторять вслепую значит рискнуть дублем.
        throw new GatewayTimeoutException(
          'Telegram не подтвердил отправку вовремя — проверьте переписку, прежде чем отправлять повторно',
        );
      }
      throw toHttpException(error);
    }
    const row = await this.ingest.storeOwnOutgoing(chat, sent);
    this.events.emit({
      kind: 'message',
      accountId: account.id,
      userId: account.userId,
      chat,
      message: sent,
      direction: 'out',
    });
    return toMessageDto(row);
  }
}

/** Курсор из query: нет — первая страница, испорчен или подделан — 400. */
function parseCursor<T>(
  raw: string | undefined,
  decode: (raw: string) => T | null,
): T | null {
  if (raw === undefined) return null;
  const cursor = decode(raw);
  if (cursor === null)
    throw new BadRequestException('Некорректный курсор страницы');
  return cursor;
}
