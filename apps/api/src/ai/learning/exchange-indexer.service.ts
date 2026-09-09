import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TelegramChatEntity } from '../../telegram/entities/telegram-chat.entity.js';
import { TelegramMessageEntity } from '../../telegram/entities/telegram-message.entity.js';
import { AiExchangeEntity } from '../entities/ai-exchange.entity.js';
import { buildExchanges } from './exchange-builder.js';

const CHAT_MESSAGES_LIMIT = 5000;

/**
 * Строит и обновляет ai_exchanges по telegram_messages. Переиндексация чата
 * идемпотентна: уникальный ключ (chat_id, client_message_id) + upsert.
 */
@Injectable()
export class ExchangeIndexerService {
  private readonly logger = new Logger(ExchangeIndexerService.name);
  /** Когда последний раз индексировали аккаунт (инкремент по last_message_at). */
  private readonly lastRun = new Map<string, Date>();

  constructor(
    @InjectRepository(TelegramChatEntity)
    private readonly chats: Repository<TelegramChatEntity>,
    @InjectRepository(TelegramMessageEntity)
    private readonly messages: Repository<TelegramMessageEntity>,
    @InjectRepository(AiExchangeEntity)
    private readonly exchanges: Repository<AiExchangeEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /** Переиндексировать все чаты аккаунта (после импорта / перед обучением). */
  async indexAccount(accountId: string, onProgress?: (done: number, total: number) => Promise<void>): Promise<number> {
    const chats = await this.chats.find({ where: { accountId }, select: { id: true } });
    let total = 0;
    for (const [i, chat] of chats.entries()) {
      total += await this.indexChat(accountId, chat.id);
      if (onProgress && i % 20 === 0) await onProgress(i + 1, chats.length);
    }
    this.lastRun.set(accountId, new Date());
    this.logger.log(`Аккаунт ${accountId}: проиндексировано обменов ${total} в ${chats.length} чатах`);
    return total;
  }

  /** Только чаты, где что-то изменилось с прошлого прогона. */
  async indexRecent(accountId: string): Promise<number> {
    const since = this.lastRun.get(accountId) ?? new Date(Date.now() - 24 * 3600_000);
    const chats = await this.chats
      .createQueryBuilder('c')
      .select('c.id', 'id')
      .where('c.account_id = :accountId', { accountId })
      .andWhere('c.last_message_at > :since', { since })
      .getRawMany<{ id: string }>();
    let total = 0;
    for (const chat of chats) total += await this.indexChat(accountId, chat.id);
    this.lastRun.set(accountId, new Date());
    return total;
  }

  async indexChat(accountId: string, chatId: string): Promise<number> {
    const rows = await this.messages.find({
      where: { chatId },
      order: { sentAt: 'ASC', telegramMessageId: 'ASC' },
      take: CHAT_MESSAGES_LIMIT,
    });
    const built = buildExchanges(rows);
    if (built.length === 0) return 0;

    // Пачками по 200, чтобы не раздувать один INSERT.
    for (let i = 0; i < built.length; i += 200) {
      const slice = built.slice(i, i + 200);
      await this.exchanges
        .createQueryBuilder()
        .insert()
        .into(AiExchangeEntity)
        .values(
          slice.map((e) => ({
            accountId,
            chatId,
            clientMessageId: e.clientMessageId,
            clientText: e.clientText,
            managerText: e.managerText,
            managerParts: e.managerParts,
            clientAt: e.clientAt,
            managerAt: e.managerAt,
            delaySec: e.delaySec,
            quality: e.quality,
          })),
        )
        .orUpdate(
          ['client_text', 'manager_text', 'manager_parts', 'client_at', 'manager_at', 'delay_sec', 'quality'],
          ['chat_id', 'client_message_id'],
        )
        .execute();
    }
    // Обмены, которых больше нет (сообщение удалили/переклассифицировали).
    const keep = built.map((e) => e.clientMessageId);
    await this.dataSource.query(
      `DELETE FROM "ai_exchanges" WHERE "chat_id" = $1 AND NOT ("client_message_id" = ANY($2::int[]))`,
      [chatId, keep],
    );
    return built.length;
  }

  async countForAccount(accountId: string): Promise<{ exchanges: number; chats: number; from: Date | null; to: Date | null }> {
    const row = await this.exchanges
      .createQueryBuilder('e')
      .select('count(*)', 'exchanges')
      .addSelect('count(distinct e.chat_id)', 'chats')
      .addSelect('min(e.client_at)', 'from')
      .addSelect('max(e.client_at)', 'to')
      .where('e.account_id = :accountId', { accountId })
      .andWhere('e.quality > 0')
      .getRawOne<{ exchanges: string; chats: string; from: Date | null; to: Date | null }>();
    return {
      exchanges: Number(row?.exchanges ?? 0),
      chats: Number(row?.chats ?? 0),
      from: row?.from ? new Date(row.from) : null,
      to: row?.to ? new Date(row.to) : null,
    };
  }
}
