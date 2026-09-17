import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { MessageDirection } from './telegram-chat.entity.js';

/** Вид вложения; null — обычный текст. */
export type MediaKind = 'photo' | 'voice' | 'video' | 'video_note' | 'audio' | 'document' | 'sticker' | 'other';

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

  @Column({ name: 'media_kind', type: 'varchar', length: 16, nullable: true })
  mediaKind: MediaKind | null;

  @Column({ name: 'sent_at', type: 'timestamptz' })
  sentAt: Date;

  /** Когда собеседник прочитал наше исходящее; для входящих всегда null. */
  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  /** Ход ИИ-агента, который отправил это сообщение; null — писал человек. */
  @Column({ name: 'ai_turn_id', type: 'uuid', nullable: true })
  aiTurnId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
