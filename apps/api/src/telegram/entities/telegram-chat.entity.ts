import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type MessageDirection = 'in' | 'out';

/** Почему ИИ в чате остановлен (null — работает или выключен вручную). */
export type AiPausedReason = 'manual_reply' | 'handoff' | 'needs_human' | 'limit' | 'error';

export type AttentionReason = 'ready_to_pay' | 'needs_human' | 'ai_error';

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

  @Column({ name: 'first_message_id', type: 'integer', nullable: true })
  firstMessageId: number | null;

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

  /** Вся история диалога выгружена до конца (для обучения ИИ). */
  @Column({ name: 'deep_history_synced', type: 'boolean', default: false })
  deepHistorySynced: boolean;

  /** access hash собеседника — чтобы писать ему после перезапуска без прогрева кэша. */
  @Column({ name: 'peer_access_hash', type: 'varchar', length: 32, nullable: true })
  peerAccessHash: string | null;

  // --- ИИ-агент -------------------------------------------------------------

  /** ИИ отвечает в этом чате (включается вручную). */
  @Column({ name: 'ai_enabled', type: 'boolean', default: false })
  aiEnabled: boolean;

  /** Текущий этап воронки по мнению ИИ (ключ из скрипта). */
  @Column({ name: 'ai_stage', type: 'varchar', length: 32, nullable: true })
  aiStage: string | null;

  @Column({ name: 'ai_paused_reason', type: 'varchar', length: 32, nullable: true })
  aiPausedReason: AiPausedReason | null;

  @Column({ name: 'ai_paused_at', type: 'timestamptz', nullable: true })
  aiPausedAt: Date | null;

  /** Сколько сообщений ИИ отправил с момента последнего включения. */
  @Column({ name: 'ai_messages_count', type: 'integer', default: 0 })
  aiMessagesCount: number;

  @Column({ name: 'ai_last_reply_at', type: 'timestamptz', nullable: true })
  aiLastReplyAt: Date | null;

  /** С какого момента клиент молчит после нашего ответа (для дожимов). */
  @Column({ name: 'ai_silence_since', type: 'timestamptz', nullable: true })
  aiSilenceSince: Date | null;

  /** Сколько дожимов уже отправлено в текущей серии молчания. */
  @Column({ name: 'ai_followup_step', type: 'integer', default: 0 })
  aiFollowupStep: number;

  /** Когда запланирован следующий дожим (null — серии нет). */
  @Column({ name: 'ai_followup_next_at', type: 'timestamptz', nullable: true })
  aiFollowupNextAt: Date | null;

  /** Чат требует внимания менеджера (готов к оплате, нужен человек, ошибка). */
  @Column({ name: 'needs_attention', type: 'boolean', default: false })
  needsAttention: boolean;

  @Column({ name: 'attention_reason', type: 'varchar', length: 32, nullable: true })
  attentionReason: AttentionReason | null;

  @Column({ name: 'attention_at', type: 'timestamptz', nullable: true })
  attentionAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
