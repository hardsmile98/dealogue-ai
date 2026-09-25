import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { execute, hydrate } from '../../database/sql.js';
import type { JobKind } from '../core/types.js';
import { BotJobEntity } from '../entities/bot-job.entity.js';

/**
 * Отложенные ходы: ступени лестницы молчания и повторы после сбоя.
 * Поллер забирает созревшие через `FOR UPDATE SKIP LOCKED` — два
 * экземпляра API одно задание не выполнят; ход по заданию ещё и защищён
 * ключом идемпотентности `job:<id>`.
 */
@Injectable()
export class BotJobsRepository {
  constructor(
    @InjectRepository(BotJobEntity)
    private readonly jobs: Repository<BotJobEntity>,
  ) {}

  async createMany(chatId: string, jobs: readonly { kind: JobKind; runAt: Date; payload?: Record<string, unknown> }[]): Promise<void> {
    if (jobs.length === 0) return;
    // save, а не insert: тип insert не принимает jsonb с unknown внутри.
    await this.jobs.save(
      this.jobs.create(jobs.map((job) => ({ chatId, kind: job.kind, runAt: job.runAt, status: 'pending' as const, payload: job.payload ?? {} }))),
    );
  }

  /**
   * Забирает созревшие задания боевых чатов агента (не песочница, режим
   * `auto`) и помечает их `running`. Задания песочницы живут в виртуальном
   * времени — их выполняет перемотка в песочнице, не поллер.
   */
  async claimDue(now: Date, limit: number): Promise<BotJobEntity[]> {
    const { rows } = await execute(
      this.jobs.manager,
      `UPDATE bot_jobs SET status = 'running', updated_at = now()
       WHERE id IN (
         SELECT job.id FROM bot_jobs job
         JOIN bot_chat_state state ON state.chat_id = job.chat_id
         WHERE job.status = 'pending' AND job.run_at <= $1::timestamptz AND NOT state.sandbox AND state.mode = 'auto'
         ORDER BY job.run_at
         LIMIT $2::int
         FOR UPDATE OF job SKIP LOCKED
       )
       RETURNING *`,
      [now, limit],
    );
    return rows.map((row) => hydrate(this.jobs, row as Record<string, unknown>));
  }

  /**
   * Заменяет ожидающие ступени лестницы одной (или ни одной). Под
   * advisory-lock чата: конец хода и «прочитано» могут пересчитывать
   * одновременно. Если ступень та же и на то же время — ничего не меняется.
   * Повторы после сбоя (`payload.retry`) не трогаются: у них свой счёт попыток.
   */
  async replaceLadder(chatId: string, kinds: readonly JobKind[], step: { kind: JobKind; runAt: Date; payload: Record<string, unknown> } | null): Promise<void> {
    await this.jobs.manager.transaction(async (manager) => {
      await execute(manager, `SELECT pg_advisory_xact_lock(hashtext($1::text))`, [chatId]);
      const { rows } = await execute<{ id: string; kind: string; run_at: Date }>(
        manager,
        `SELECT id, kind, run_at FROM bot_jobs
         WHERE chat_id = $1::uuid AND status = 'pending' AND kind = ANY($2::varchar[]) AND NOT (payload ? 'retry')`,
        [chatId, kinds],
      );
      const current = rows[0];
      if (step && rows.length === 1 && current && current.kind === step.kind && new Date(current.run_at).getTime() === step.runAt.getTime()) {
        return;
      }
      if (rows.length > 0) {
        await execute(manager, `UPDATE bot_jobs SET status = 'cancelled', updated_at = now() WHERE id = ANY($1::uuid[])`, [rows.map((row) => row.id)]);
      }
      if (step) {
        await execute(
          manager,
          `INSERT INTO bot_jobs (chat_id, kind, run_at, status, payload) VALUES ($1::uuid, $2::varchar, $3::timestamptz, 'pending', $4::jsonb)`,
          [chatId, step.kind, step.runAt, JSON.stringify(step.payload)],
        );
      }
    });
  }

  /** Вернуть забранное задание в очередь (канала нет, клиент как раз пишет). */
  async release(jobId: string, runAt: Date): Promise<void> {
    await execute(
      this.jobs.manager,
      `UPDATE bot_jobs SET status = 'pending', run_at = $2::timestamptz, updated_at = now() WHERE id = $1::uuid AND status = 'running'`,
      [jobId, runAt],
    );
  }

  /**
   * Задания, оставшиеся `running` после падения API. Берутся только
   * давние: свежие может прямо сейчас выполнять второй экземпляр.
   */
  async releaseStuck(olderThan: Date): Promise<number> {
    const { affected } = await execute(
      this.jobs.manager,
      `UPDATE bot_jobs SET status = 'pending', updated_at = now() WHERE status = 'running' AND updated_at < $1::timestamptz`,
      [olderThan],
    );
    return affected;
  }

  async cancel(jobId: string): Promise<void> {
    await execute(this.jobs.manager, `UPDATE bot_jobs SET status = 'cancelled', updated_at = now() WHERE id = $1::uuid AND status IN ('pending', 'running')`, [
      jobId,
    ]);
  }

  /** Виды заданий чата, которые созреют не позже `until`. */
  async dueKinds(chatId: string, until: Date): Promise<JobKind[]> {
    const rows = await this.jobs
      .createQueryBuilder('job')
      .where('job.chat_id = :chatId AND job.status = :status AND job.run_at <= :until', { chatId, status: 'pending', until })
      .orderBy('job.run_at', 'ASC')
      .getMany();
    return rows.map((row) => row.kind as JobKind);
  }

  /** Ожидающие задания чата по времени срабатывания. */
  pending(chatId: string): Promise<BotJobEntity[]> {
    return this.jobs.find({ where: { chatId, status: 'pending' }, order: { runAt: 'ASC' } });
  }

  /** Задания чата: ожидающие по времени срабатывания, затем последние отработанные. */
  async listForChat(chatId: string, recent = 20): Promise<BotJobEntity[]> {
    const [pending, finished] = await Promise.all([
      this.pending(chatId),
      this.jobs
        .createQueryBuilder('job')
        .where('job.chat_id = :chatId AND job.status <> :status', { chatId, status: 'pending' })
        .orderBy('job.updated_at', 'DESC')
        .take(recent)
        .getMany(),
    ]);
    return [...pending, ...finished];
  }

  async cancelPending(chatId: string, kinds?: readonly JobKind[]): Promise<number> {
    const { affected } = await execute(
      this.jobs.manager,
      `UPDATE bot_jobs SET status = 'cancelled', updated_at = now()
       WHERE chat_id = $1::uuid AND status = 'pending' AND ($2::varchar[] IS NULL OR kind = ANY($2::varchar[]))`,
      [chatId, kinds ?? null],
    );
    return affected;
  }

  async markDone(jobId: string): Promise<void> {
    await execute(this.jobs.manager, `UPDATE bot_jobs SET status = 'done', updated_at = now() WHERE id = $1::uuid`, [jobId]);
  }

  async markFailed(jobId: string, error: string): Promise<void> {
    await execute(
      this.jobs.manager,
      `UPDATE bot_jobs SET status = 'failed', attempts = attempts + 1, last_error = $2::text, updated_at = now() WHERE id = $1::uuid`,
      [jobId, error],
    );
  }
}
