import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { SelectQueryBuilder } from 'typeorm';
import { execute, hydrate } from '../../database/sql.js';
import type { ChatCodeFilter } from '../dto/chats.dto.js';
import { TelegramChatEntity } from '../entities/telegram-chat.entity.js';
import type { MessageDirection } from '../entities/telegram-chat.entity.js';
import type { ChatCursor } from '../lib/chat-cursor.js';
import type { PeerFields } from '../lib/telegram-objects.js';

/**
 * Ключ сортировки списка — выражение из индекса IDX_telegram_chats_account_last_id
 * (должно совпадать с ним дословно). Чаты без сообщений получают
 * -infinity и уходят в конец; сам ключ никогда не NULL, поэтому курсор —
 * одно row-сравнение, которое Postgres использует как границу индекса.
 */
const SORT_KEY = `COALESCE(chat.last_message_at, CAST('-infinity' AS timestamptz))`;

export interface ChatListFilter {
  /** Подстрока имени, @username, телефона или текста последнего сообщения. */
  search?: string;
  code?: ChatCodeFilter;
}

/** Что меняет в строке чата приём сообщений (см. applyIngest). */
export interface ChatIngestUpdate {
  /** Сколько сообщений реально вставлено (дубликаты не считаются). */
  inserted: number;
  /** Самое свежее из вставленных — кандидат в «последнее сообщение» чата. */
  newest: {
    text: string;
    sentAt: Date;
    direction: MessageDirection;
  } | null;
  /** Наибольший id Telegram среди вставленных (0 — ничего не вставлено). */
  maxTelegramMessageId: number;
  /** Сколько сообщений в диалоге по данным Telegram, если известно (иначе 0). */
  total: number;
  /** Первое сообщение диалога, если синхронизация его только что определила. */
  first: {
    at: Date;
    telegramMessageId: number;
    direction: MessageDirection;
    leadCode: string | null;
  } | null;
}

/**
 * Таблица telegram_chats: поиск, страницы списка и атомарные обновления.
 * Счётчики и «последнее сообщение» меняются выражениями от текущих значений
 * в самом UPDATE — событие и синхронизация одного чата могут идти
 * параллельно и не затирают друг друга.
 */
@Injectable()
export class TelegramChatsRepository {
  constructor(
    @InjectRepository(TelegramChatEntity)
    private readonly chats: Repository<TelegramChatEntity>,
  ) {}

  /** Чат внутри аккаунта или null. */
  findOwned(
    accountId: string,
    chatId: string,
  ): Promise<TelegramChatEntity | null> {
    return this.chats.findOne({ where: { id: chatId, accountId } });
  }

  findByPeer(
    accountId: string,
    peerId: string,
  ): Promise<TelegramChatEntity | null> {
    return this.chats.findOne({ where: { accountId, peerId } });
  }

  findByPeers(
    accountId: string,
    peerIds: string[],
  ): Promise<TelegramChatEntity[]> {
    if (peerIds.length === 0) return Promise.resolve([]);
    return this.chats.find({ where: { accountId, peerId: In(peerIds) } });
  }

  /**
   * Страница списка: сначала диалоги со свежими сообщениями, чаты без
   * сообщений — в конце. Порядок и курсор совпадают с индексом
   * IDX_telegram_chats_account_last_id: страница читается прямо с места
   * курсора, сколько бы страниц ни было до неё.
   */
  page(
    accountId: string,
    filter: ChatListFilter,
    cursor: ChatCursor | null,
    limit: number,
  ): Promise<TelegramChatEntity[]> {
    const query = this.filtered(accountId, filter)
      .orderBy(SORT_KEY, 'DESC')
      .addOrderBy('chat.id', 'DESC')
      .limit(limit);
    if (cursor) {
      query.andWhere(
        `(${SORT_KEY}, chat.id) < (CAST(:cursorAt AS timestamptz), CAST(:cursorId AS uuid))`,
        { cursorAt: cursor.lastMessageAt ?? '-infinity', cursorId: cursor.id },
      );
    }
    return query.getMany();
  }

  /** Сколько чатов подходит под фильтры (COUNT(*), а не COUNT(DISTINCT id) из getCount). */
  async count(accountId: string, filter: ChatListFilter): Promise<number> {
    const row = await this.filtered(accountId, filter)
      .select('COUNT(*)::int', 'total')
      .getRawOne<{ total: number }>();
    return row?.total ?? 0;
  }

  /**
   * Заводит чаты новым собеседникам одним запросом. Уже существующие
   * (гонка события и синхронизации) пропускаются — вернутся только созданные.
   */
  async insertMissing(
    accountId: string,
    peers: PeerFields[],
  ): Promise<TelegramChatEntity[]> {
    if (peers.length === 0) return [];
    const { rows } = await execute(
      this.chats.manager,
      `INSERT INTO telegram_chats (account_id, peer_id, peer_name, peer_username, peer_phone, peer_access_hash)
       SELECT $1::uuid, p.peer_id, p.peer_name, p.peer_username, p.peer_phone, p.peer_access_hash
       FROM unnest($2::bigint[], $3::varchar[], $4::varchar[], $5::varchar[], $6::varchar[])
         AS p(peer_id, peer_name, peer_username, peer_phone, peer_access_hash)
       ON CONFLICT (account_id, peer_id) DO NOTHING
       RETURNING *`,
      [
        accountId,
        peers.map((peer) => peer.peerId),
        peers.map((peer) => peer.peerName),
        peers.map((peer) => peer.peerUsername),
        peers.map((peer) => peer.peerPhone),
        peers.map((peer) => peer.peerAccessHash),
      ],
    );
    return rows.map((row) => hydrate(this.chats, row));
  }

  /** Имя, username или телефон собеседника поменялись; access hash не затираем пустым. */
  async updatePeer(
    chatId: string,
    peer: PeerFields,
  ): Promise<TelegramChatEntity | null> {
    const { rows } = await execute(
      this.chats.manager,
      `UPDATE telegram_chats
       SET peer_name = $2::varchar,
           peer_username = $3::varchar,
           peer_phone = $4::varchar,
           peer_access_hash = COALESCE($5::varchar, peer_access_hash),
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        chatId,
        peer.peerName,
        peer.peerUsername,
        peer.peerPhone,
        peer.peerAccessHash,
      ],
    );
    return rows[0] ? hydrate(this.chats, rows[0]) : null;
  }

  /**
   * Итог приёма сообщений одним UPDATE: счётчик растёт на число вставленных
   * (но не ниже total от Telegram), «последнее сообщение» меняется, только
   * если вставленное не старше текущего, первое сообщение и код пишутся,
   * когда их определила синхронизация. Все выражения считаются от значений
   * строки в момент UPDATE — без чтения и перезаписи целиком.
   * Возвращает строку после обновления или null, если чат уже удалён.
   */
  async applyIngest(
    chatId: string,
    update: ChatIngestUpdate,
  ): Promise<TelegramChatEntity | null> {
    const { newest, first } = update;
    const { rows } = await execute(
      this.chats.manager,
      `UPDATE telegram_chats SET
         messages_count = GREATEST(messages_count + $2::int, $3::int),
         last_telegram_message_id = GREATEST(last_telegram_message_id, $4::int),
         last_message_text = CASE WHEN $6::timestamptz >= COALESCE(last_message_at, '-infinity')
                                  THEN $5::text ELSE last_message_text END,
         last_message_direction = CASE WHEN $6::timestamptz >= COALESCE(last_message_at, '-infinity')
                                       THEN $7::varchar ELSE last_message_direction END,
         last_message_at = GREATEST(last_message_at, $6::timestamptz),
         first_message_at = CASE WHEN $8::boolean THEN $9::timestamptz ELSE first_message_at END,
         first_message_id = CASE WHEN $8::boolean THEN $10::int ELSE first_message_id END,
         first_message_direction = CASE WHEN $8::boolean THEN $11::varchar ELSE first_message_direction END,
         lead_code = CASE WHEN $8::boolean THEN $12::varchar ELSE lead_code END,
         history_synced = history_synced OR $8::boolean,
         updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        chatId,
        update.inserted,
        update.total,
        update.maxTelegramMessageId,
        newest?.text ?? null,
        newest?.sentAt ?? null,
        newest?.direction ?? null,
        first !== null,
        first?.at ?? null,
        first?.telegramMessageId ?? null,
        first?.direction ?? null,
        first?.leadCode ?? null,
      ],
    );
    return rows[0] ? hydrate(this.chats, rows[0]) : null;
  }

  /**
   * Сдвигает границу прочитанного собеседником вперёд — и только вперёд.
   * true, если граница действительно сдвинулась (иначе событие уже учтено).
   */
  async advanceReadOutbox(chatId: string, maxId: number): Promise<boolean> {
    const { affected } = await execute(
      this.chats.manager,
      `UPDATE telegram_chats
       SET read_outbox_max_id = $2::int, updated_at = now()
       WHERE id = $1 AND read_outbox_max_id < $2::int`,
      [chatId, maxId],
    );
    return affected > 0;
  }

  /** Чаты аккаунта с фильтрами из запроса — общая часть страницы и счётчика. */
  private filtered(
    accountId: string,
    { search, code }: ChatListFilter,
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

/** Экранирует спецсимволы LIKE, чтобы «50%» искалось буквально. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
