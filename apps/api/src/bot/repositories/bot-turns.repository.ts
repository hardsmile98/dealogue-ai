import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { execute, hydrate } from '../../database/sql.js';
import { BotPromptSnapshotEntity } from '../entities/bot-prompt-snapshot.entity.js';
import type { PromptKind } from '../entities/bot-prompt-snapshot.entity.js';
import { BotTurnEntity } from '../entities/bot-turn.entity.js';
import type {
  BotTurnStatus,
  BotTurnTrigger,
} from '../entities/bot-turn.entity.js';

export interface TurnPatch {
  status?: BotTurnStatus;
  analysis?: Record<string, unknown> | null;
  plan?: Record<string, unknown> | null;
  draft?: string | null;
  review?: Record<string, unknown> | null;
  final?: Record<string, unknown> | null;
  sent?: Record<string, unknown> | null;
  delivery?: Record<string, unknown> | null;
  error?: string | null;
  finished?: boolean;
}

/** Ход, который остался `running` от прошлого процесса API. */
export interface OrphanTurn {
  id: string;
  chatId: string;
  trigger: BotTurnTrigger;
  input: Record<string, unknown>;
  /** Текст собран (есть точка фиксации) — ход досылается, иначе повторяется. */
  committed: boolean;
  sandbox: boolean;
}

/** Колонки JSONB, которые пишутся как есть. */
const JSON_COLUMNS = [
  'analysis',
  'plan',
  'review',
  'final',
  'sent',
  'delivery',
] as const;

/** Журнал ходов и снимки промптов. */
@Injectable()
export class BotTurnsRepository {
  constructor(
    @InjectRepository(BotTurnEntity)
    private readonly turns: Repository<BotTurnEntity>,
    @InjectRepository(BotPromptSnapshotEntity)
    private readonly snapshots: Repository<BotPromptSnapshotEntity>,
  ) {}

  /**
   * Открывает ход. Ключ идемпотентности записан до первой отправки: если
   * такой ход уже есть, возвращается null и второго хода не будет.
   * Прерванные до фиксации ходы (`interrupted`) ключ не держат — у них
   * ничего не ушло, и повтор должен пройти.
   */
  async start(fields: {
    chatId: string;
    accountId: string;
    trigger: BotTurnTrigger;
    idempotencyKey: string;
    input: Record<string, unknown>;
  }): Promise<string | null> {
    const { rows } = await execute<{ id: string }>(
      this.turns.manager,
      `INSERT INTO bot_turns (chat_id, account_id, trigger, idempotency_key, input)
       VALUES ($1::uuid, $2::uuid, $3::varchar, $4::varchar, $5::jsonb)
       ON CONFLICT (idempotency_key) WHERE status <> 'interrupted' DO NOTHING
       RETURNING id`,
      [
        fields.chatId,
        fields.accountId,
        fields.trigger,
        fields.idempotencyKey,
        JSON.stringify(fields.input),
      ],
    );
    return rows[0]?.id ?? null;
  }

  async update(
    turnId: string,
    patch: TurnPatch,
    db: EntityManager = this.turns.manager,
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [turnId];
    const add = (column: string, value: unknown, cast: string) => {
      params.push(value);
      sets.push(`${column} = $${params.length}::${cast}`);
    };
    if (patch.status !== undefined) add('status', patch.status, 'varchar');
    for (const column of JSON_COLUMNS) {
      const value = patch[column];
      if (value !== undefined) {
        add(column, value === null ? null : JSON.stringify(value), 'jsonb');
      }
    }
    if (patch.draft !== undefined) add('draft', patch.draft, 'text');
    if (patch.error !== undefined) add('error', patch.error, 'text');
    if (patch.finished) sets.push('finished_at = now()');
    if (sets.length === 0) return;
    await execute(
      db,
      `UPDATE bot_turns SET ${sets.join(', ')} WHERE id = $1::uuid`,
      params,
    );
  }

  async addSnapshot(
    turnId: string,
    kind: PromptKind,
    request: string,
    response: string | null,
  ): Promise<void> {
    await this.snapshots.insert({ turnId, kind, request, response });
  }

  /** Последние ходы чата — для журнала в вебе. */
  listRecent(chatId: string, limit = 50): Promise<BotTurnEntity[]> {
    return this.turns.find({
      where: { chatId },
      order: { startedAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Ходы чата с собранным текстом, которые ещё не закрыты: прерваны
   * остановкой API или ждут повтора после сбоя отправки. Под замком чата
   * других таких ходов нет — эти надо довести до конца раньше нового.
   */
  async unfinished(chatId: string): Promise<BotTurnEntity[]> {
    const { rows } = await execute(
      this.turns.manager,
      `SELECT * FROM bot_turns
       WHERE chat_id = $1::uuid AND status = 'running' AND delivery IS NOT NULL
       ORDER BY started_at`,
      [chatId],
    );
    return rows.map((row) => hydrate(this.turns, row));
  }

  /**
   * Замок на ход перед его закрытием. false — ход уже закрыт (другим
   * путём или предыдущей попыткой): закрывать второй раз нельзя.
   */
  async lockRunning(turnId: string, db: EntityManager): Promise<boolean> {
    const { rows } = await execute(
      db,
      `SELECT 1 FROM bot_turns WHERE id = $1::uuid AND status = 'running' FOR UPDATE`,
      [turnId],
    );
    return rows.length > 0;
  }

  /**
   * Тексты частей, которые прямо сейчас уходят (или уходили, когда API
   * остановился) в ходах чата. Эхо такой части от Telegram — своё
   * исходящее, а не сообщение менеджера.
   */
  async sendingTexts(chatId: string): Promise<string[]> {
    const { rows } = await execute<{ text: string | null }>(
      this.turns.manager,
      `SELECT delivery->'parts'->((delivery->>'sending')::int)->>'text' AS text
       FROM bot_turns
       WHERE chat_id = $1::uuid AND status = 'running' AND delivery->>'sending' IS NOT NULL`,
      [chatId],
    );
    return rows.flatMap((row) => (row.text ? [row.text] : []));
  }

  /** Ходы, оставшиеся `running` от прошлого процесса (читается при старте, до первого хода). */
  async orphans(db: EntityManager): Promise<OrphanTurn[]> {
    const { rows } = await execute<{
      id: string;
      chat_id: string;
      trigger: BotTurnTrigger;
      input: Record<string, unknown>;
      committed: boolean;
      sandbox: boolean;
    }>(
      db,
      `SELECT turn.id, turn.chat_id, turn.trigger, turn.input,
              turn.delivery IS NOT NULL AS committed, state.sandbox
       FROM bot_turns turn
       JOIN bot_chat_state state ON state.chat_id = turn.chat_id
       WHERE turn.status = 'running'
       FOR UPDATE OF turn`,
    );
    return rows.map((row) => ({
      id: row.id,
      chatId: row.chat_id,
      trigger: row.trigger,
      input: row.input ?? {},
      committed: row.committed,
      sandbox: row.sandbox,
    }));
  }

  /** Прерванные до фиксации ходы: ничего не ушло, ключ идемпотентности свободен. */
  async markInterrupted(
    turnIds: readonly string[],
    reason: string,
    db: EntityManager,
  ): Promise<void> {
    if (turnIds.length === 0) return;
    await execute(
      db,
      `UPDATE bot_turns SET status = 'interrupted', error = $2::text, finished_at = now()
       WHERE id = ANY($1::uuid[]) AND status = 'running'`,
      [turnIds, reason],
    );
  }

  /**
   * Удаляет снимки промптов старше `before` — не больше `limit` за раз, по
   * индексу (created_at), чтобы не держать долгую блокировку. Возвращает,
   * сколько удалено.
   */
  async deleteSnapshotsBefore(before: Date, limit: number): Promise<number> {
    const { affected } = await execute(
      this.snapshots.manager,
      `DELETE FROM bot_prompt_snapshots
       WHERE id IN (
         SELECT id FROM bot_prompt_snapshots
         WHERE created_at < $1::timestamptz
         ORDER BY created_at
         LIMIT $2::int
       )`,
      [before, limit],
    );
    return affected;
  }
}
