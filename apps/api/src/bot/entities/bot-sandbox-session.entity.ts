import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Сессия песочницы: виртуальный чат агента со своими часами. Состояние,
 * память и журнал — общие таблицы агента по `chat_id` (bot_chat_state с
 * `sandbox = true`); `source_chat_id` — реальный чат, из которого скопирована
 * переписка.
 */
@Entity({ name: 'bot_sandbox_sessions' })
@Index(['accountId', 'createdAt'])
export class BotSandboxSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ name: 'chat_id', type: 'uuid', unique: true })
  chatId: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ name: 'source_chat_id', type: 'uuid', nullable: true })
  sourceChatId: string | null;

  /** Виртуальное «сейчас»: двигают задержки доставки и перемотка. */
  @Column({ name: 'virtual_now', type: 'timestamptz' })
  virtualNow: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
