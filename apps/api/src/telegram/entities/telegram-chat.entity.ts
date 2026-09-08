import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type MessageDirection = 'in' | 'out';

/** Личный диалог аккаунта с одним собеседником. */
@Entity({ name: 'telegram_chats' })
@Index(['accountId', 'peerId'], { unique: true })
@Index(['accountId', 'firstMessageAt'])
@Index(['accountId', 'lastMessageAt'])
export class TelegramChatEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  /** id пользователя Telegram (собеседника). */
  @Column({ name: 'peer_id', type: 'bigint' })
  peerId: string;

  @Column({ name: 'peer_name', type: 'varchar', length: 256 })
  peerName: string;

  @Column({ name: 'peer_username', type: 'varchar', length: 64, nullable: true })
  peerUsername: string | null;

  @Column({ name: 'peer_phone', type: 'varchar', length: 32, nullable: true })
  peerPhone: string | null;

  /** Самое первое сообщение диалога — по нему считается статистика. */
  @Column({ name: 'first_message_at', type: 'timestamptz', nullable: true })
  firstMessageAt: Date | null;

  @Column({ name: 'first_message_direction', type: 'varchar', length: 3, nullable: true })
  firstMessageDirection: MessageDirection | null;

  /** Код из первого входящего сообщения («Код: 5» → "5"). */
  @Column({ name: 'lead_code', type: 'varchar', length: 16, nullable: true })
  leadCode: string | null;

  @Column({ name: 'last_message_text', type: 'text', default: '' })
  lastMessageText: string;

  @Column({ name: 'last_message_at', type: 'timestamptz', nullable: true })
  lastMessageAt: Date | null;

  @Column({ name: 'last_message_direction', type: 'varchar', length: 3, nullable: true })
  lastMessageDirection: MessageDirection | null;

  /** Максимальный id сообщения Telegram, который уже сохранён, — для догрузки. */
  @Column({ name: 'last_telegram_message_id', type: 'integer', default: 0 })
  lastTelegramMessageId: number;

  @Column({ name: 'messages_count', type: 'integer', default: 0 })
  messagesCount: number;

  /** Для этого диалога уже забирали историю (первое сообщение известно). */
  @Column({ name: 'history_synced', type: 'boolean', default: false })
  historySynced: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
