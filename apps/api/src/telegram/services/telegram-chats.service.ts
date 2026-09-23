import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { SelectQueryBuilder } from 'typeorm';
import type {
  ListChatsQueryDto,
  ListMessagesQueryDto,
} from '../dto/chats.dto.js';
import type { TelegramAccountEntity } from '../entities/telegram-account.entity.js';
import { TelegramChatEntity } from '../entities/telegram-chat.entity.js';
import { TelegramMessageEntity } from '../entities/telegram-message.entity.js';
import { decodeChatCursor, encodeChatCursor } from '../lib/chat-cursor.js';
import type { ChatCursor } from '../lib/chat-cursor.js';
import {
  decodeMessageCursor,
  encodeMessageCursor,
} from '../lib/message-cursor.js';
import { toChatDto, toMessageDto } from '../telegram.types.js';
import type {
  ChatsPageDto,
  MessageDto,
  MessagesPageDto,
} from '../telegram.types.js';
import { TelegramEventsService } from './telegram-events.service.js';
import { TelegramIngestService } from './telegram-ingest.service.js';
import { TelegramOutboundService } from './telegram-outbound.service.js';

/**
 * Ключ сортировки списка — выражение из индекса IDX_telegram_chats_account_last_id
 * (должно совпадать с ним дословно). Чаты без сообщений получают
 * -infinity и уходят в конец; сам ключ никогда не NULL, поэтому курсор —
 * одно row-сравнение, которое Postgres использует как границу индекса.
 */
const SORT_KEY = `COALESCE(chat.last_message_at, CAST('-infinity' AS timestamptz))`;

/**
 * Диалоги аккаунта для веба: постраничный список, переписка и ответ
 * менеджера. Аккаунт и чат приходят уже проверенными AccountAccessGuard.
 */
@Injectable()
export class TelegramChatsService {
  constructor(
    @InjectRepository(TelegramChatEntity)
    private readonly chats: Repository<TelegramChatEntity>,
    @InjectRepository(TelegramMessageEntity)
    private readonly messages: Repository<TelegramMessageEntity>,
    private readonly outbound: TelegramOutboundService,
    private readonly ingest: TelegramIngestService,
    private readonly events: TelegramEventsService,
  ) {}

  /**
   * Страница списка: сначала диалоги со свежими сообщениями, чаты без
   * сообщений — в конце. Порядок и курсор совпадают с индексом
   * IDX_telegram_chats_account_last_id: страница читается прямо с места
   * курсора, сколько бы страниц ни было до неё.
   */
  async listPage(
    account: TelegramAccountEntity,
    query: ListChatsQueryDto,
  ): Promise<ChatsPageDto> {
    const cursor =
      query.cursor === undefined ? null : decodeChatCursor(query.cursor);
    if (query.cursor !== undefined && cursor === null) {
      throw new BadRequestException('Некорректный курсор страницы');
    }

    const filtered = this.filteredChats(account.id, query);
    const page = filtered
      .clone()
      .orderBy(SORT_KEY, 'DESC')
      .addOrderBy('chat.id', 'DESC')
      // Одна строка сверх лимита отвечает на вопрос «есть ли следующая страница».
      .limit(query.limit + 1);
    if (cursor) afterCursor(page, cursor);

    const [rows, total] = await Promise.all([
      page.getMany(),
      filtered.getCount(),
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
   * Ключ (sent_at, telegram_message_id) совпадает с индексом
   * IDX_telegram_messages_chat_sent_id — страница читается с места курсора.
   */
  async listMessages(
    chat: TelegramChatEntity,
    query: ListMessagesQueryDto,
  ): Promise<MessagesPageDto> {
    const cursor =
      query.cursor === undefined ? null : decodeMessageCursor(query.cursor);
    if (query.cursor !== undefined && cursor === null) {
      throw new BadRequestException('Некорректный курсор страницы');
    }

    const page = this.messages
      .createQueryBuilder('message')
      .where('message.chat_id = :chatId', { chatId: chat.id })
      .orderBy('message.sent_at', 'DESC')
      .addOrderBy('message.telegram_message_id', 'DESC')
      // Одна строка сверх лимита отвечает на вопрос «есть ли что-то старше».
      .limit(query.limit + 1);
    if (cursor) {
      page.andWhere(
        '(message.sent_at, message.telegram_message_id) < (CAST(:sentAt AS timestamptz), CAST(:telegramMessageId AS integer))',
        cursor,
      );
    }

    const rows = await page.getMany();
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
   * самого Telegram.
   */
  async sendMessage(
    account: TelegramAccountEntity,
    chat: TelegramChatEntity,
    text: string,
  ): Promise<MessageDto> {
    if (!this.outbound.isOnline(account.id)) {
      throw new ServiceUnavailableException('Аккаунт не подключён к Telegram');
    }
    const sent = await this.outbound.sendText(account.id, chat, text);
    const row = await this.ingest.storeOwnOutgoing(chat, sent);
    this.events.emit({
      kind: 'message',
      accountId: account.id,
      chat,
      message: sent,
      direction: 'out',
    });
    return toMessageDto(row);
  }

  /** Чаты аккаунта с фильтрами из запроса — общая часть страницы и счётчика. */
  private filteredChats(
    accountId: string,
    { search, code }: ListChatsQueryDto,
  ): SelectQueryBuilder<TelegramChatEntity> {
    const query = this.chats
      .createQueryBuilder('chat')
      .where('chat.account_id = :accountId', { accountId });

    // «@name» ищем как «name»: username хранится без собаки.
    const term = search?.replace(/^@/, '');
    if (term) {
      query.andWhere(
        `(chat.peer_name ILIKE :pattern
          OR chat.peer_username ILIKE :pattern
          OR chat.peer_phone ILIKE :pattern
          OR chat.last_message_text ILIKE :pattern)`,
        { pattern: `%${escapeLike(term)}%` },
      );
    }

    if (code === 'with') query.andWhere('chat.lead_code IS NOT NULL');
    if (code === 'without') query.andWhere('chat.lead_code IS NULL');
    return query;
  }
}

/** Строки строго после курсора в порядке `SORT_KEY DESC, id DESC`. */
function afterCursor(
  query: SelectQueryBuilder<TelegramChatEntity>,
  cursor: ChatCursor,
): void {
  query.andWhere(
    `(${SORT_KEY}, chat.id) < (CAST(:cursorAt AS timestamptz), CAST(:cursorId AS uuid))`,
    { cursorAt: cursor.lastMessageAt ?? '-infinity', cursorId: cursor.id },
  );
}

/** Экранирует спецсимволы LIKE, чтобы «50%» искалось буквально. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
