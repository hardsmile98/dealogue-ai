import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { MessageDirection } from './telegram-chat.entity.js';

@Entity({ name: 'telegram_messages' })
@Index(['chatId', 'telegramMessageId'], { unique: true })
@Index(['chatId', 'sentAt'])
export class TelegramMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'chat_id', type: 'uuid' })
  chatId: string;

  @Column({ name: 'telegram_message_id', type: 'integer' })
  telegramMessageId: number;

  @Column({ type: 'varchar', length: 3 })
  direction: MessageDirection;

  /** Текст или подпись-заглушка для медиа: «[Фото]», «[Голосовое сообщение]». */
  @Column({ type: 'text' })
  text: string;

  @Column({ name: 'sent_at', type: 'timestamptz' })
  sentAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
