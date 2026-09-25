import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type PromptKind = 'analyzer' | 'writer' | 'reviewer';

/** Полные промпты и ответы LLM по ходу. Тяжёлые, чистятся через 30 дней. */
@Entity({ name: 'bot_prompt_snapshots' })
@Index(['createdAt'])
export class BotPromptSnapshotEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'turn_id', type: 'uuid' })
  turnId: string;

  @Column({ type: 'varchar', length: 16 })
  kind: PromptKind;

  @Column({ type: 'text' })
  request: string;

  @Column({ type: 'text', nullable: true })
  response: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
