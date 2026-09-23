import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { execute, hydrate } from '../../database/sql.js';
import type { MessageDirection } from '../entities/telegram-chat.entity.js';
import { TelegramMessageEntity } from '../entities/telegram-message.entity.js';
import type { MediaKind } from '../entities/telegram-message.entity.js';
import type { MessageCursor } from '../lib/message-cursor.js';

/** Сообщение из Telegram, готовое к записи. */
export interface MessageRow {
  telegramMessageId: number;
  direction: MessageDirection;
  text: string;
  mediaKind: MediaKind | null;
  sentAt: Date;
}

/**
 * Таблица telegram_messages. Запись идемпотентна: уникальный ключ
 * (chat_id, telegram_message_id) + ON CONFLICT DO NOTHING, так что гонка
 * события и синхронизации безопасна.
 */
@Injectable()
export class TelegramMessagesRepository {
  constructor(
    @InjectRepository(TelegramMessageEntity)
    private readonly messages: Repository<TelegramMessageEntity>,
  ) {}

  /**
   * Пачка сообщений одного чата — одним INSERT из массивов (число параметров
   * не растёт с размером пачки). Уже сохранённые пропускаются; возвращаются
   * только реально вставленные — по ним считаются агрегаты чата.
   * Исходящее, которое собеседник уже прочитал (граница лежит на чате),
   * сразу получает read_at.
   */
  async insertMany(chatId: string, rows: MessageRow[]): Promise<TelegramMessageEntity[]> {
    if (rows.length === 0) return [];
    const { rows: inserted } = await execute(
      this.messages.manager,
      `INSERT INTO telegram_messages (chat_id, telegram_message_id, direction, text, media_kind, sent_at, read_at)
       SELECT c.id, m.telegram_message_id, m.direction, m.text, m.media_kind, m.sent_at,
              CASE WHEN m.direction = 'out' AND m.telegram_message_id <= c.read_outbox_max_id THEN now() END
       FROM telegram_chats c
       CROSS JOIN unnest($2::int[], $3::varchar[], $4::text[], $5::varchar[], $6::timestamptz[])
         AS m(telegram_message_id, direction, text, media_kind, sent_at)
       WHERE c.id = $1
       ON CONFLICT (chat_id, telegram_message_id) DO NOTHING
       RETURNING *`,
      [
        chatId,
        rows.map((row) => row.telegramMessageId),
        rows.map((row) => row.direction),
        rows.map((row) => row.text),
        rows.map((row) => row.mediaKind),
        rows.map((row) => row.sentAt),
      ],
    );
    return inserted.map((row) => hydrate(this.messages, row));
  }

  findByTelegramId(chatId: string, telegramMessageId: number): Promise<TelegramMessageEntity | null> {
    return this.messages.findOne({ where: { chatId, telegramMessageId } });
  }

  /**
   * Страница переписки от новых к старым. Ключ (sent_at, telegram_message_id)
   * совпадает с индексом IDX_telegram_messages_chat_sent_id — страница
   * читается прямо с места курсора.
   */
  page(chatId: string, cursor: MessageCursor | null, limit: number): Promise<TelegramMessageEntity[]> {
    const query = this.messages
      .createQueryBuilder('message')
      .where('message.chat_id = :chatId', { chatId })
      .orderBy('message.sent_at', 'DESC')
      .addOrderBy('message.telegram_message_id', 'DESC')
      .limit(limit);
    if (cursor) {
      query.andWhere(
        '(message.sent_at, message.telegram_message_id) < (CAST(:sentAt AS timestamptz), CAST(:telegramMessageId AS integer))',
        cursor,
      );
    }
    return query.getMany();
  }

  /** Отмечает прочитанными наши исходящие до maxId включительно (индекс IDX_telegram_messages_unread_out). */
  async markReadUpTo(chatId: string, maxId: number): Promise<void> {
    await execute(
      this.messages.manager,
      `UPDATE telegram_messages
       SET read_at = now()
       WHERE chat_id = $1 AND direction = 'out' AND read_at IS NULL AND telegram_message_id <= $2::int`,
      [chatId, maxId],
    );
  }
}
