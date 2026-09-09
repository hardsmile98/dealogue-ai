import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AiJobEntity } from '../entities/ai-job.entity.js';
import type { AiJobStatus, AiJobType } from '../entities/ai-job.entity.js';

export interface EnqueueParams {
  type: AiJobType;
  accountId: string;
  chatId?: string | null;
  runAt: Date;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
}

/** Сколько держать блокировку без heartbeat, прежде чем watchdog вернёт job в очередь. */
const LOCK_MINUTES = 5;

export function dedupeKeyFor(type: AiJobType, accountId: string, chatId?: string | null): string {
  return type === 'reply' || type === 'followup' ? `${type}:${chatId}` : `${type}:${accountId}`;
}

/**
 * Очередь ИИ-заданий в Postgres. Один активный job на ключ: повторный
 * enqueue сдвигает время запуска (так устроен debounce входящих), а если
 * job уже выполняется — просит перезапустить его после завершения.
 */
@Injectable()
export class AiJobsService {
  constructor(
    @InjectRepository(AiJobEntity)
    private readonly jobs: Repository<AiJobEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async enqueue(params: EnqueueParams): Promise<AiJobEntity> {
    const dedupeKey = dedupeKeyFor(params.type, params.accountId, params.chatId);
    const rows = rowsOf(
      await this.dataSource.query<unknown>(
      `
      INSERT INTO "ai_jobs" ("account_id", "chat_id", "type", "dedupe_key", "status", "run_at", "payload", "max_attempts")
      VALUES ($1, $2, $3, $4, 'queued', $5, $6::jsonb, $7)
      ON CONFLICT ("dedupe_key") WHERE "status" IN ('queued', 'running')
      DO UPDATE SET
        "run_at" = CASE WHEN "ai_jobs"."status" = 'queued' THEN EXCLUDED."run_at" ELSE "ai_jobs"."run_at" END,
        "payload" = CASE
          WHEN "ai_jobs"."status" = 'queued' THEN "ai_jobs"."payload" || EXCLUDED."payload"
          ELSE "ai_jobs"."payload" || jsonb_build_object('requeueAt', to_jsonb(EXCLUDED."run_at"))
        END,
        "updated_at" = now()
      RETURNING *
      `,
      [
        params.accountId,
        params.chatId ?? null,
        params.type,
        dedupeKey,
        params.runAt,
        JSON.stringify(params.payload ?? {}),
        params.maxAttempts ?? 5,
      ],
      ),
    );
    return this.jobs.create(mapRow(rows[0]));
  }

  /** Снять ещё не начатый job; выполняющийся получает пометку и сам остановится. */
  async cancel(type: AiJobType, accountId: string, chatId?: string | null): Promise<void> {
    const dedupeKey = dedupeKeyFor(type, accountId, chatId);
    await this.dataSource.query(
      `
      UPDATE "ai_jobs"
      SET "status" = CASE WHEN "status" = 'queued' THEN 'cancelled' ELSE "status" END,
          "payload" = CASE WHEN "status" = 'running' THEN "payload" || '{"cancelled": true}'::jsonb ELSE "payload" END,
          "updated_at" = now()
      WHERE "dedupe_key" = $1 AND "status" IN ('queued', 'running')
      `,
      [dedupeKey],
    );
  }

  async cancelForChat(chatId: string): Promise<void> {
    await this.dataSource.query(
      `
      UPDATE "ai_jobs"
      SET "status" = CASE WHEN "status" = 'queued' THEN 'cancelled' ELSE "status" END,
          "payload" = CASE WHEN "status" = 'running' THEN "payload" || '{"cancelled": true}'::jsonb ELSE "payload" END,
          "updated_at" = now()
      WHERE "chat_id" = $1 AND "status" IN ('queued', 'running')
      `,
      [chatId],
    );
  }

  /**
   * Забрать один готовый job. Не берём job чата, у которого уже что-то
   * выполняется, и не запускаем второй digest/import на аккаунт.
   */
  async claim(types: AiJobType[]): Promise<AiJobEntity | null> {
    const rows = rowsOf(
      await this.dataSource.query<unknown>(
      `
      UPDATE "ai_jobs" j
      SET "status" = 'running',
          "lock_until" = now() + interval '${LOCK_MINUTES} minutes',
          "attempts" = "attempts" + 1,
          "updated_at" = now()
      WHERE j."id" = (
        SELECT c."id" FROM "ai_jobs" c
        WHERE c."status" = 'queued'
          AND c."run_at" <= now()
          AND c."type" = ANY($1::varchar[])
          AND (
            c."chat_id" IS NULL OR NOT EXISTS (
              SELECT 1 FROM "ai_jobs" r
              WHERE r."status" = 'running' AND r."chat_id" = c."chat_id"
            )
          )
          AND (
            c."type" NOT IN ('digest', 'import') OR NOT EXISTS (
              SELECT 1 FROM "ai_jobs" r
              WHERE r."status" = 'running' AND r."account_id" = c."account_id" AND r."type" IN ('digest', 'import')
            )
          )
        ORDER BY c."run_at" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING j.*
      `,
      [types],
      ),
    );
    return rows.length > 0 ? this.jobs.create(mapRow(rows[0])) : null;
  }

  /** Продлить блокировку долгого job'а и (опционально) обновить payload. */
  async heartbeat(jobId: string, payloadPatch?: Record<string, unknown>): Promise<boolean> {
    const rows = rowsOf(
      await this.dataSource.query<unknown>(
      `
      UPDATE "ai_jobs"
      SET "lock_until" = now() + interval '${LOCK_MINUTES} minutes',
          "payload" = "payload" || $2::jsonb,
          "updated_at" = now()
      WHERE "id" = $1 AND "status" = 'running'
      RETURNING "payload"
      `,
      [jobId, JSON.stringify(payloadPatch ?? {})],
      ),
    );
    const payload = rows[0]?.payload as Record<string, unknown> | undefined;
    return rows.length > 0 && payload?.cancelled !== true;
  }

  async isCancelled(jobId: string): Promise<boolean> {
    const row = await this.jobs.findOne({ where: { id: jobId } });
    return row?.payload?.cancelled === true;
  }

  async complete(job: AiJobEntity, status: 'done' | 'failed' | 'cancelled', error?: string | null): Promise<void> {
    await this.jobs.update(job.id, {
      status,
      lockUntil: null,
      lastError: error ?? null,
    });
  }

  /** Вернуть в очередь на другое время (ошибка с повтором, вне рабочего окна, FLOOD_WAIT). */
  async reschedule(job: AiJobEntity, runAt: Date, error?: string | null, payloadPatch?: Record<string, unknown>): Promise<void> {
    await this.dataSource.query(
      `
      UPDATE "ai_jobs"
      SET "status" = 'queued', "run_at" = $2, "lock_until" = NULL, "last_error" = $3,
          "payload" = "payload" || $4::jsonb, "updated_at" = now()
      WHERE "id" = $1
      `,
      [job.id, runAt, error ?? null, JSON.stringify(payloadPatch ?? {})],
    );
  }

  /** Перенос без учёта попытки (не наша ошибка: окно, breaker, аккаунт офлайн). */
  async postpone(job: AiJobEntity, runAt: Date, reason: string, payloadPatch?: Record<string, unknown>): Promise<void> {
    await this.dataSource.query(
      `
      UPDATE "ai_jobs"
      SET "status" = 'queued', "run_at" = $2, "lock_until" = NULL, "attempts" = GREATEST("attempts" - 1, 0),
          "last_error" = $3, "payload" = "payload" || $4::jsonb, "updated_at" = now()
      WHERE "id" = $1
      `,
      [job.id, runAt, reason, JSON.stringify(payloadPatch ?? {})],
    );
  }

  /** Аккаунт снова онлайн — job'ы, отложенные из-за офлайна, запускаем сейчас. */
  async wakeAccount(accountId: string): Promise<void> {
    await this.dataSource.query(
      `
      UPDATE "ai_jobs"
      SET "run_at" = now(), "payload" = "payload" - 'offline', "updated_at" = now()
      WHERE "account_id" = $1 AND "status" = 'queued' AND ("payload"->>'offline') = 'true'
      `,
      [accountId],
    );
  }

  /** Зависшие running (упавший процесс) — обратно в очередь. */
  async releaseStale(): Promise<number> {
    const result = rowsOf(
      await this.dataSource.query<unknown>(
      `
      WITH released AS (
        UPDATE "ai_jobs" SET "status" = 'queued', "lock_until" = NULL, "updated_at" = now()
        WHERE "status" = 'running' AND "lock_until" < now()
        RETURNING 1
      )
      SELECT count(*)::text AS count FROM released
      `,
      ),
    );
    return Number(result[0]?.count ?? 0);
  }

  /** При остановке процесса: всё, что выполнялось, — обратно в очередь сразу. */
  async releaseRunning(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.jobs.update({ id: In(ids), status: 'running' }, { status: 'queued', lockUntil: null });
  }

  async findActive(accountId: string, types?: AiJobType[]): Promise<AiJobEntity[]> {
    return this.jobs.find({
      where: {
        accountId,
        status: In<AiJobStatus>(['queued', 'running']),
        ...(types ? { type: In(types) } : {}),
      },
      order: { runAt: 'ASC' },
    });
  }

  async findLatest(accountId: string, type: AiJobType): Promise<AiJobEntity | null> {
    return this.jobs.findOne({ where: { accountId, type }, order: { createdAt: 'DESC' } });
  }

  async findLatestById(id: string): Promise<AiJobEntity | null> {
    return this.jobs.findOne({ where: { id } });
  }

  async findForChat(chatId: string, type: AiJobType): Promise<AiJobEntity | null> {
    return this.jobs.findOne({
      where: { chatId, type, status: In<AiJobStatus>(['queued', 'running']) },
    });
  }

  async counts(): Promise<Record<AiJobStatus, number>> {
    const rows = await this.dataSource.query<{ status: AiJobStatus; count: string }[]>(
      `SELECT "status", count(*)::text AS count FROM "ai_jobs" GROUP BY "status"`,
    );
    const result: Record<AiJobStatus, number> = { queued: 0, running: 0, done: 0, failed: 0, cancelled: 0 };
    for (const row of rows) result[row.status] = Number(row.count);
    return result;
  }

  /** Чистка: завершённые job'ы старше недели. */
  async prune(): Promise<void> {
    await this.dataSource.query(
      `DELETE FROM "ai_jobs" WHERE "status" IN ('done', 'cancelled') AND "updated_at" < now() - interval '7 days'`,
    );
  }
}

/**
 * TypeORM для UPDATE/DELETE возвращает [rows, affected], для SELECT/INSERT — rows.
 * Приводим к одному виду.
 */
function rowsOf(result: unknown): Record<string, unknown>[] {
  if (!Array.isArray(result)) return [];
  if (result.length === 2 && Array.isArray(result[0]) && typeof result[1] === 'number') {
    return result[0] as Record<string, unknown>[];
  }
  return result as Record<string, unknown>[];
}

/** Raw-строка Postgres (snake_case) → поля сущности. */
function mapRow(row: Record<string, unknown>): Partial<AiJobEntity> {
  return {
    id: row.id as string,
    accountId: row.account_id as string,
    chatId: (row.chat_id as string | null) ?? null,
    type: row.type as AiJobType,
    dedupeKey: row.dedupe_key as string,
    status: row.status as AiJobStatus,
    runAt: new Date(row.run_at as string),
    lockUntil: row.lock_until ? new Date(row.lock_until as string) : null,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    payload: (row.payload as Record<string, unknown>) ?? {},
    lastError: (row.last_error as string | null) ?? null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}
