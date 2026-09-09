import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type AiRunTrigger = 'inbound' | 'followup' | 'test' | 'manual';
export type AiRunStatus = 'sent' | 'silent' | 'skipped' | 'error' | 'draft';

/** Аудит каждого запуска ИИ по чату: что видел, что решил, что отправил. */
@Entity({ name: 'ai_runs' })
@Index(['chatId', 'createdAt'])
@Index(['accountId', 'createdAt'])
export class AiRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ name: 'chat_id', type: 'uuid' })
  chatId: string;

  @Column({ type: 'varchar', length: 16 })
  trigger: AiRunTrigger;

  @Column({ name: 'followup_step', type: 'integer', nullable: true })
  followupStep: number | null;

  /** telegram_message_id входящего, на которое отвечаем. */
  @Column({ name: 'trigger_message_id', type: 'integer', nullable: true })
  triggerMessageId: number | null;

  @Column({ type: 'varchar', length: 32 })
  provider: string;

  @Column({ type: 'varchar', length: 64 })
  model: string;

  @Column({ name: 'prompt_hash', type: 'varchar', length: 64, nullable: true })
  promptHash: string | null;

  /** Полный промпт — только для тестовых запусков и ошибок. */
  @Column({ name: 'prompt_snapshot', type: 'jsonb', nullable: true })
  promptSnapshot: Record<string, unknown> | null;

  @Column({ name: 'raw_response', type: 'text', nullable: true })
  rawResponse: string | null;

  @Column({ type: 'jsonb', nullable: true })
  decision: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 16 })
  status: AiRunStatus;

  @Column({ name: 'skip_reason', type: 'varchar', length: 64, nullable: true })
  skipReason: string | null;

  @Column({ name: 'sent_telegram_message_ids', type: 'integer', array: true, nullable: true })
  sentTelegramMessageIds: number[] | null;

  @Column({ name: 'input_tokens', type: 'integer', default: 0 })
  inputTokens: number;

  @Column({ name: 'output_tokens', type: 'integer', default: 0 })
  outputTokens: number;

  @Column({ name: 'cache_hit_tokens', type: 'integer', default: 0 })
  cacheHitTokens: number;

  @Column({ name: 'latency_ms', type: 'integer', default: 0 })
  latencyMs: number;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
