import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type AlertType = 'ready_to_pay' | 'needs_human' | 'ai_error';
export type AlertStatus = 'open' | 'acknowledged' | 'resolved';

export interface AlertPayload {
  reason?: string;
  stage?: string | null;
  confidence?: number;
  lastClientText?: string;
  aiRunId?: string;
  error?: string;
}

/** Сигнал менеджеру: клиент готов платить, нужен человек, ИИ сломался. */
@Entity({ name: 'alerts' })
@Index(['accountId', 'status', 'createdAt'])
export class AlertEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  /** null — алерт уровня аккаунта (например, ошибка провайдера). */
  @Column({ name: 'chat_id', type: 'uuid', nullable: true })
  chatId: string | null;

  @Column({ type: 'varchar', length: 24 })
  type: AlertType;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status: AlertStatus;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  payload: AlertPayload;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'acknowledged_at', type: 'timestamptz', nullable: true })
  acknowledgedAt: Date | null;

  @Column({ name: 'acknowledged_by', type: 'uuid', nullable: true })
  acknowledgedBy: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy: string | null;
}
