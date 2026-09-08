import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Начало диалога: первое сообщение, которое собеседник написал аккаунту.
 * Одна строка на диалог, только для диалогов, начатых собеседником.
 * Именно по этой таблице считается статистика: она узкая, индексирована
 * по (аккаунт, дата) и хранит текст первого сообщения, чтобы коды можно
 * было пересчитать новым парсером без обращения к Telegram.
 */
@Entity({ name: 'telegram_dialog_starts' })
@Index(['chatId'], { unique: true })
@Index(['accountId', 'startedAt'])
@Index(['accountId', 'leadCode', 'startedAt'])
export class TelegramDialogStartEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ name: 'chat_id', type: 'uuid' })
  chatId: string;

  @Column({ name: 'telegram_message_id', type: 'integer' })
  telegramMessageId: number;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  /** Исходный текст первого сообщения (как пришёл из Telegram). */
  @Column({ type: 'text' })
  text: string;

  /** Распознанный код или null — «без кода». */
  @Column({ name: 'lead_code', type: 'varchar', length: 16, nullable: true })
  leadCode: string | null;

  /** Чем помечен код: 'word' («код 6») или 'hash' («#6»); null без кода. */
  @Column({ name: 'lead_marker', type: 'varchar', length: 8, nullable: true })
  leadMarker: string | null;

  /** Версия парсера, которым получен lead_code (см. LEAD_CODE_PARSER_VERSION). */
  @Column({ name: 'parser_version', type: 'integer', default: 0 })
  parserVersion: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
