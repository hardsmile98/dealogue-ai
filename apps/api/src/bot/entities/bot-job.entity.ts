import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type BotJobStatus =
  'pending' | 'running' | 'done' | 'cancelled' | 'failed';

/**
 * Отложенные ходы: таймер вехи `diagnostic` и ступени лестницы молчания.
 * Условие ступени проверяется в момент срабатывания, а не при постановке.
 * Переживают перезапуск API; поллер забирает созревшие по (status, run_at).
 */
@Entity({ name: 'bot_jobs' })
@Index(['status', 'runAt'])
@Index(['chatId', 'status'])
export class BotJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'chat_id', type: 'uuid' })
  chatId: string;

  /** `diagnostic`, `birth_data_reminder`, `return_question`, `offer`, `offer_nudge`, `prices`, `unread_reminder`. */
  @Column({ type: 'varchar', length: 32 })
  kind: string;

  @Column({ name: 'run_at', type: 'timestamptz' })
  runAt: Date;

  @Column({ type: 'varchar', length: 12, default: 'pending' })
  status: BotJobStatus;

  @Column({ type: 'integer', default: 0 })
  attempts: number;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  payload: Record<string, unknown>;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
