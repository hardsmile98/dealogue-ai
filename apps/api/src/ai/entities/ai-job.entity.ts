import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Типы заданий (раздел 6.14 ТЗ):
 * - `inbound` — обработка пачки входящих после дебаунса (повторный enqueue сдвигает run_at);
 * - `touch` — запланированное касание воронки;
 * - `notify` — уведомление менеджеру в Telegram;
 * - `stats` — пересчёт статистики аккаунта.
 */
export type AiJobType = 'inbound' | 'touch' | 'notify' | 'stats';
export type AiJobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

/**
 * Очередь отложенной работы ИИ-агента в Postgres. Всё, что должно
 * пережить перезапуск, лежит здесь, а не в таймерах.
 */
@Entity({ name: 'ai_jobs' })
@Index(['status', 'runAt'])
@Index(['accountId', 'type'])
export class AiJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ name: 'chat_id', type: 'uuid', nullable: true })
  chatId: string | null;

  @Column({ type: 'varchar', length: 16 })
  type: AiJobType;

  /** `inbound:{chatId}`, `touch:{chatId}`, `notify:{draftId}`, `stats:{accountId}` — один активный job на ключ. */
  @Column({ name: 'dedupe_key', type: 'varchar', length: 64 })
  dedupeKey: string;

  @Column({ type: 'varchar', length: 16, default: 'queued' })
  status: AiJobStatus;

  @Column({ name: 'run_at', type: 'timestamptz' })
  runAt: Date;

  @Column({ name: 'lock_until', type: 'timestamptz', nullable: true })
  lockUntil: Date | null;

  @Column({ type: 'integer', default: 0 })
  attempts: number;

  @Column({ name: 'max_attempts', type: 'integer', default: 5 })
  maxAttempts: number;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  payload: Record<string, unknown>;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
