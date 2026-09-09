import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type TelegramAccountStatus =
  | 'connected'
  | 'pending'
  | 'disconnected'
  | 'error';

export type DeepHistoryStatus = 'none' | 'running' | 'done' | 'error';

@Entity({ name: 'telegram_accounts' })
@Index(['userId', 'phone'], { unique: true })
export class TelegramAccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** Нормализованный номер: `+` и цифры. */
  @Column({ type: 'varchar', length: 32 })
  phone: string;

  @Column({ name: 'telegram_user_id', type: 'bigint', nullable: true })
  telegramUserId: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  username: string | null;

  @Column({ name: 'display_name', type: 'varchar', length: 128 })
  displayName: string;

  @Column({ type: 'varchar', length: 16 })
  status: TelegramAccountStatus;

  @Column({ name: 'status_message', type: 'text', nullable: true })
  statusMessage: string | null;

  /** StringSession teleproto, зашифрованная AES-256-GCM (см. lib/session-crypto). */
  @Column({ name: 'session_encrypted', type: 'text', nullable: true })
  sessionEncrypted: string | null;

  /** Первичная выгрузка диалогов завершена — дальше только досинхронизация. */
  @Column({ name: 'history_synced', type: 'boolean', default: false })
  historySynced: boolean;

  /** Глубокая выгрузка всей истории (для обучения ИИ). */
  @Column({ name: 'deep_history_status', type: 'varchar', length: 16, default: 'none' })
  deepHistoryStatus: DeepHistoryStatus;

  @Column({ name: 'connected_at', type: 'timestamptz' })
  connectedAt: Date;

  @Column({ name: 'last_sync_at', type: 'timestamptz', nullable: true })
  lastSyncAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
