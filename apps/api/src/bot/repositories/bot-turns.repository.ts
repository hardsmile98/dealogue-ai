import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { execute } from '../../database/sql.js';
import { BotPromptSnapshotEntity } from '../entities/bot-prompt-snapshot.entity.js';
import type { PromptKind } from '../entities/bot-prompt-snapshot.entity.js';
import { BotTurnEntity } from '../entities/bot-turn.entity.js';
import type { BotTurnStatus, BotTurnTrigger } from '../entities/bot-turn.entity.js';

export interface TurnPatch {
  status?: BotTurnStatus;
  analysis?: Record<string, unknown> | null;
  plan?: Record<string, unknown> | null;
  draft?: string | null;
  review?: Record<string, unknown> | null;
  final?: Record<string, unknown> | null;
  sent?: Record<string, unknown> | null;
  error?: string | null;
  finished?: boolean;
}

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
   * такой ход уже есть (перезапуск API посреди хода), возвращается null и
   * повторной отправки не будет.
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
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [fields.chatId, fields.accountId, fields.trigger, fields.idempotencyKey, JSON.stringify(fields.input)],
    );
    return rows[0]?.id ?? null;
  }

  async update(turnId: string, patch: TurnPatch): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [turnId];
    const add = (column: string, value: unknown, cast: string) => {
      params.push(value);
      sets.push(`${column} = $${params.length}::${cast}`);
    };
    if (patch.status !== undefined) add('status', patch.status, 'varchar');
    if (patch.analysis !== undefined) add('analysis', patch.analysis === null ? null : JSON.stringify(patch.analysis), 'jsonb');
    if (patch.plan !== undefined) add('plan', patch.plan === null ? null : JSON.stringify(patch.plan), 'jsonb');
    if (patch.draft !== undefined) add('draft', patch.draft, 'text');
    if (patch.review !== undefined) add('review', patch.review === null ? null : JSON.stringify(patch.review), 'jsonb');
    if (patch.final !== undefined) add('final', patch.final === null ? null : JSON.stringify(patch.final), 'jsonb');
    if (patch.sent !== undefined) add('sent', patch.sent === null ? null : JSON.stringify(patch.sent), 'jsonb');
    if (patch.error !== undefined) add('error', patch.error, 'text');
    if (patch.finished) sets.push('finished_at = now()');
    if (sets.length === 0) return;
    await execute(this.turns.manager, `UPDATE bot_turns SET ${sets.join(', ')} WHERE id = $1::uuid`, params);
  }

  async addSnapshot(turnId: string, kind: PromptKind, request: string, response: string | null): Promise<void> {
    await this.snapshots.insert({ turnId, kind, request, response });
  }

  /** Последние ходы чата — для журнала в вебе. */
  listRecent(chatId: string, limit = 50): Promise<BotTurnEntity[]> {
    return this.turns.find({ where: { chatId }, order: { startedAt: 'DESC' }, take: limit });
  }
}
