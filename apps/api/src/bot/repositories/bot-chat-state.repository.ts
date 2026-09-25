import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { execute, hydrate } from '../../database/sql.js';
import { BotChatSaidEntity } from '../entities/bot-chat-said.entity.js';
import { BotChatStateEntity } from '../entities/bot-chat-state.entity.js';
import type { ChatLabel, ChatMode, HandoffReason } from '../library/kinds.js';

export interface HandoffRow {
  chat_id: string;
  label: ChatLabel | null;
  handoff_reason: HandoffReason | null;
  handoff_at: Date | null;
  peer_name: string;
  peer_username: string | null;
  last_message_at: Date | null;
  last_message_text: string;
  last_message_direction: 'in' | 'out' | null;
  waiting_since: Date | null;
}

/**
 * Таблица bot_chat_state и реестр сказанного. Режим меняется точечным
 * UPSERT: ход агента и переключатель в вебе не затирают поля друг друга.
 */
@Injectable()
export class BotChatStateRepository {
  constructor(
    @InjectRepository(BotChatStateEntity)
    private readonly states: Repository<BotChatStateEntity>,
    @InjectRepository(BotChatSaidEntity)
    private readonly said: Repository<BotChatSaidEntity>,
  ) {}

  find(chatId: string): Promise<BotChatStateEntity | null> {
    return this.states.findOne({ where: { chatId } });
  }

  /**
   * Ставит режим руками. Строки ещё нет — заводит (владелец выключил агент
   * в чате заранее или вернул чат агенту). Возврат в `auto` снимает
   * передачу менеджеру и ярлык; `off` их сохраняет — видно, почему чат
   * ушёл менеджеру, даже если агент в нём выключен.
   */
  async setMode(chatId: string, accountId: string, mode: ChatMode): Promise<BotChatStateEntity> {
    const { rows } = await execute(
      this.states.manager,
      `INSERT INTO bot_chat_state (chat_id, account_id, mode)
       VALUES ($1::uuid, $2::uuid, $3::varchar)
       ON CONFLICT (chat_id) DO UPDATE SET
         mode = EXCLUDED.mode,
         handoff_reason = CASE WHEN EXCLUDED.mode = 'auto' THEN NULL ELSE bot_chat_state.handoff_reason END,
         handoff_at = CASE WHEN EXCLUDED.mode = 'auto' THEN NULL ELSE bot_chat_state.handoff_at END,
         label = CASE WHEN EXCLUDED.mode = 'auto' THEN NULL ELSE bot_chat_state.label END,
         updated_at = now()
       RETURNING *`,
      [chatId, accountId, mode],
    );
    return hydrate(this.states, rows[0] as Record<string, unknown>);
  }

  /**
   * Чаты аккаунта под агентом, где последнее сообщение клиента осталось без
   * ответа (API лежал, аккаунт был отключён) и повтор ещё не поставлен, —
   * их подхватывает канал, когда аккаунт снова в сети.
   */
  async awaitingReply(accountId: string): Promise<string[]> {
    const { rows } = await execute<{ chat_id: string }>(
      this.states.manager,
      `SELECT state.chat_id FROM bot_chat_state state
       WHERE state.account_id = $1::uuid AND state.mode = 'auto' AND NOT state.sandbox
         AND EXISTS (
           SELECT 1 FROM telegram_messages message
           WHERE message.chat_id = state.chat_id AND message.direction = 'in'
             AND message.telegram_message_id > state.last_handled_message_id
         )
         AND NOT EXISTS (
           SELECT 1 FROM bot_jobs job WHERE job.chat_id = state.chat_id AND job.kind = 'reply' AND job.status IN ('pending', 'running')
         )`,
      [accountId],
    );
    return rows.map((row) => row.chat_id);
  }

  /** Ярлык чата у менеджера: «нужен ответ» при сообщении клиента, снимается ответом менеджера. */
  async setLabel(chatId: string, label: ChatLabel | null): Promise<void> {
    await execute(this.states.manager, `UPDATE bot_chat_state SET label = $2::varchar, updated_at = now() WHERE chat_id = $1::uuid`, [
      chatId,
      label,
    ]);
  }

  /**
   * Чаты аккаунта у менеджера (не песочница): сначала ждущие ответа — дольше
   * всех ждущие выше, потом «цены отправлены, молчит», потом остальные.
   * `waiting_since` — первое сообщение клиента после нашего последнего.
   */
  async handoffs(accountId: string, limit = 200): Promise<HandoffRow[]> {
    const { rows } = await execute<HandoffRow>(
      this.states.manager,
      `SELECT * FROM (
         SELECT state.chat_id, state.label, state.handoff_reason, state.handoff_at,
                chat.peer_name, chat.peer_username, chat.last_message_at, chat.last_message_text, chat.last_message_direction,
                (SELECT min(incoming.sent_at) FROM telegram_messages incoming
                 WHERE incoming.chat_id = state.chat_id AND incoming.direction = 'in'
                   AND incoming.sent_at > COALESCE(
                     (SELECT max(outgoing.sent_at) FROM telegram_messages outgoing WHERE outgoing.chat_id = state.chat_id AND outgoing.direction = 'out'),
                     'epoch'::timestamptz)) AS waiting_since
         FROM bot_chat_state state
         JOIN telegram_chats chat ON chat.id = state.chat_id
         WHERE state.account_id = $1::uuid AND state.mode = 'manager' AND NOT state.sandbox
       ) handoff
       ORDER BY
         CASE WHEN label IN ('needs_reply', 'agent_unavailable') THEN 0 WHEN label = 'prices_silent' THEN 1 ELSE 2 END,
         COALESCE(waiting_since, handoff_at) ASC NULLS LAST
       LIMIT $2::int`,
      [accountId, limit],
    );
    return rows;
  }

  /** Доставленные вехи по чатам разом — этап для списка. */
  async milestonesByChat(chatIds: readonly string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (chatIds.length === 0) return result;
    const { rows } = await execute<{ chat_id: string; keys: string[] }>(
      this.said.manager,
      `SELECT chat_id, array_agg(key ORDER BY at) AS keys FROM bot_chat_said
       WHERE kind = 'milestone' AND chat_id = ANY($1::uuid[]) GROUP BY chat_id`,
      [chatIds],
    );
    for (const row of rows) result.set(row.chat_id, row.keys);
    return result;
  }

  /** Ключи доставленных вех — по ним вычисляется этап. */
  async deliveredMilestones(chatId: string): Promise<string[]> {
    const rows = await this.said.find({
      where: { chatId, kind: 'milestone' },
      order: { at: 'ASC' },
    });
    return rows.map((row) => row.key);
  }
}
