import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { MessageDirection } from '../../telegram/entities/telegram-chat.entity.js';
import type { MediaKind } from '../../telegram/entities/telegram-message.entity.js';

/** Сообщение песочницы; время — виртуальное, задержки доставки записаны числом, а не прождены. */
@Entity({ name: 'bot_sandbox_messages' })
@Index(['sessionId', 'id'])
export class BotSandboxMessageEntity {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'ALWAYS' })
  id: number;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @Column({ type: 'varchar', length: 3 })
  direction: MessageDirection;

  @Column({ type: 'text' })
  text: string;

  @Column({ name: 'media_kind', type: 'varchar', length: 16, nullable: true })
  mediaKind: MediaKind | null;

  @Column({ name: 'sent_at', type: 'timestamptz' })
  sentAt: Date;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  /** Тело вехи из библиотеки. */
  @Column({ type: 'boolean', default: false })
  block: boolean;

  /** Пауза перед сообщением (первое — задержка ответа), мс. */
  @Column({ name: 'delay_ms', type: 'integer', nullable: true })
  delayMs: number | null;

  @Column({ name: 'typing_ms', type: 'integer', nullable: true })
  typingMs: number | null;

  @Column({ name: 'turn_id', type: 'uuid', nullable: true })
  turnId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
