import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { HandoffReason } from '../domain/types.js';

/**
 * Типы алертов (раздел 6.13 ТЗ):
 * - `handoff` — чат передан менеджеру (причина в payload.reason);
 * - `minor` — клиент несовершеннолетний;
 * - `media` — клиент прислал медиа, бот не может ответить;
 * - `stale_lead` — лид ждал первого ответа слишком долго;
 * - `library_incomplete` — в библиотеке нет обязательного блока;
 * - `ai_error` — провайдер недоступен;
 * - `anomaly` — подозрительная статистика (много передач, ошибок, сообщений).
 */
export type AlertType =
  | 'handoff'
  | 'minor'
  | 'media'
  | 'stale_lead'
  | 'library_incomplete'
  | 'ai_error'
  | 'anomaly';
export type AlertStatus = 'open' | 'acknowledged' | 'resolved';

export interface AlertPayload {
  reason?: HandoffReason | string;
  stage?: string | null;
  lastClientText?: string;
  draftId?: string;
  turnId?: string;
  error?: string;
  /** Для anomaly / library_incomplete: что именно. */
  detail?: string;
}

/** Сигнал менеджеру. */
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
