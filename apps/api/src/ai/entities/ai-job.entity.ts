import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AiJobType = 'reply' | 'followup' | 'digest' | 'import';
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

  /** `reply:{chatId}`, `followup:{chatId}`, `digest:{accountId}`, `import:{accountId}` — один активный job на ключ. */
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
