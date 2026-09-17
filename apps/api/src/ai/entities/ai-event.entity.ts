import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { AiEventKind } from '../domain/types.js';

/** Служебные события чата: смена режима и этапа, таймеры, прочтение, ошибки. */
@Entity({ name: 'ai_events' })
@Index(['chatId', 'createdAt'])
export class AiEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ name: 'chat_id', type: 'uuid', nullable: true })
  chatId: string | null;

  @Column({ type: 'varchar', length: 32 })
  kind: AiEventKind;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  payload: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
