import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { DeepPartial } from 'typeorm';
import { execute, hydrate } from '../../database/sql.js';
import type {
  HistoryMessage,
  IncomingMessage,
  SentPart,
} from '../core/types.js';
import type { BotChatStateEntity } from '../entities/bot-chat-state.entity.js';
import { BotSandboxMessageEntity } from '../entities/bot-sandbox-message.entity.js';
import { BotSandboxSessionEntity } from '../entities/bot-sandbox-session.entity.js';

/** Строка списка сессий: сессия, режим чата, доставленные вехи, число сообщений. */
export interface SandboxSummaryRow {
  session: BotSandboxSessionEntity;
  state: Pick<BotChatStateEntity, 'mode' | 'label'>;
  milestones: string[];
  messageCount: number;
}

/** Сообщение, которое копируется в песочницу из реального чата. */
export type SandboxMessageRow = Omit<HistoryMessage, 'id'>;

interface SummaryQueryRow extends Record<string, unknown> {
  state_mode: BotChatStateEntity['mode'];
  state_label: BotChatStateEntity['label'];
  milestones: string[];
  message_count: number;
}

/**
 * Сессии песочницы и их переписка (bot_sandbox_sessions,
 * bot_sandbox_messages). Состояние, память и журнал сессии — общие таблицы
 * агента по `chat_id`, их пишут свои репозитории.
 */
@Injectable()
export class BotSandboxRepository {
  constructor(
    @InjectRepository(BotSandboxSessionEntity)
    private readonly sessions: Repository<BotSandboxSessionEntity>,
    @InjectRepository(BotSandboxMessageEntity)
    private readonly messages: Repository<BotSandboxMessageEntity>,
  ) {}

  /**
   * Сессии аккаунта, свежие первыми, — одним запросом вместе с режимом
   * чата, вехами (этап) и числом сообщений.
   */
  async listSummaries(
    accountId: string,
    limit: number,
  ): Promise<SandboxSummaryRow[]> {
    const { rows } = await execute<SummaryQueryRow>(
      this.sessions.manager,
      `SELECT session.*,
              state.mode AS state_mode,
              state.label AS state_label,
              ARRAY(SELECT said.key FROM bot_chat_said said
                    WHERE said.chat_id = session.chat_id AND said.kind = 'milestone'
                    ORDER BY said.at) AS milestones,
              (SELECT COUNT(*)::int FROM bot_sandbox_messages message
               WHERE message.session_id = session.id) AS message_count
       FROM bot_sandbox_sessions session
       JOIN bot_chat_state state ON state.chat_id = session.chat_id
       WHERE session.account_id = $1::uuid
       ORDER BY session.created_at DESC
       LIMIT $2::int`,
      [accountId, limit],
    );
    return rows.map((row) => ({
      session: hydrate(this.sessions, row),
      state: { mode: row.state_mode, label: row.state_label },
      milestones: row.milestones,
      messageCount: row.message_count,
    }));
  }

  findOwned(
    accountId: string,
    sessionId: string,
  ): Promise<BotSandboxSessionEntity | null> {
    return this.sessions.findOne({ where: { id: sessionId, accountId } });
  }

  findById(sessionId: string): Promise<BotSandboxSessionEntity | null> {
    return this.sessions.findOne({ where: { id: sessionId } });
  }

  create(
    fields: DeepPartial<BotSandboxSessionEntity>,
  ): Promise<BotSandboxSessionEntity> {
    return this.sessions.save(this.sessions.create(fields));
  }

  async setVirtualNow(sessionId: string, at: Date): Promise<void> {
    await this.sessions.update(sessionId, { virtualNow: at });
  }

  /** Переписка по порядку; возвращает id вставленных — в том же порядке. */
  async insertMessages(
    sessionId: string,
    rows: readonly SandboxMessageRow[],
  ): Promise<number[]> {
    if (rows.length === 0) return [];
    const result = await this.messages.insert(
      rows.map((row) => ({
        sessionId,
        direction: row.direction,
        text: row.text,
        mediaKind: row.mediaKind as BotSandboxMessageEntity['mediaKind'],
        sentAt: row.sentAt,
        readAt: row.readAt,
      })),
    );
    return result.identifiers.map((identifier) => Number(identifier.id));
  }

  /** Последние `limit` сообщений сессии, от старых к новым. */
  async latest(
    sessionId: string,
    limit: number,
  ): Promise<BotSandboxMessageEntity[]> {
    const rows = await this.messages.find({
      where: { sessionId },
      order: { id: 'DESC' },
      take: limit,
    });
    return rows.reverse();
  }

  /** Сообщения клиента после обработанного — на них агент ещё не отвечал. */
  async pendingIncoming(
    sessionId: string,
    handledMessageId: number,
  ): Promise<IncomingMessage[]> {
    const rows = await this.messages
      .createQueryBuilder('message')
      .where(
        'message.session_id = :sessionId AND message.direction = :direction AND message.id > :handled',
        { sessionId, direction: 'in', handled: handledMessageId },
      )
      .orderBy('message.id', 'ASC')
      .getMany();
    return rows.map((row) => ({
      id: row.id,
      text: row.text,
      mediaKind: row.mediaKind,
      sentAt: row.sentAt,
    }));
  }

  /** Клиент прочитал всё, что агент отправил. */
  async markAllRead(sessionId: string, at: Date): Promise<void> {
    await execute(
      this.messages.manager,
      `UPDATE bot_sandbox_messages SET read_at = $2::timestamptz
       WHERE session_id = $1::uuid AND direction = 'out' AND read_at IS NULL`,
      [sessionId, at],
    );
  }

  /** Отправленное ходом: чья это часть, веха ли, с какими задержками — одним UPDATE. */
  async recordSent(
    sessionId: string,
    turnId: string | null,
    parts: readonly SentPart[],
  ): Promise<void> {
    if (parts.length === 0) return;
    await execute(
      this.messages.manager,
      `UPDATE bot_sandbox_messages message
       SET block = p.block, delay_ms = p.delay_ms, typing_ms = p.typing_ms, turn_id = $2::uuid
       FROM unnest($3::int[], $4::boolean[], $5::int[], $6::int[])
         AS p(id, block, delay_ms, typing_ms)
       WHERE message.id = p.id AND message.session_id = $1::uuid`,
      [
        sessionId,
        turnId,
        parts.map((part) => part.messageId),
        parts.map((part) => part.block),
        parts.map((part) => Math.round(part.delayMs)),
        parts.map((part) => Math.round(part.typingMs)),
      ],
    );
  }
}
