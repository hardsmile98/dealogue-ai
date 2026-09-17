import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import type {
  ChatMode,
  FunnelStage,
  Gender,
  GenderSource,
  HandoffReason,
  TouchKind,
} from '../domain/types.js';

/** Состояние воронки и собранные слоты одного чата (раздел 6.2 ТЗ). */
@Entity({ name: 'ai_chat_state' })
@Index(['chatId'], { unique: true })
@Index(['accountId', 'mode', 'stage'])
@Index(['nextTouchAt'])
export class AiChatStateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'chat_id', type: 'uuid' })
  chatId: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ type: 'varchar', length: 16, default: 'off' })
  mode: ChatMode;

  @Column({ type: 'varchar', length: 32, default: 'greeting' })
  stage: FunnelStage;

  @Column({ name: 'stage_entered_at', type: 'timestamptz', nullable: true })
  stageEnteredAt: Date | null;

  @Column({ name: 'next_touch_kind', type: 'varchar', length: 32, nullable: true })
  nextTouchKind: TouchKind | null;

  @Column({ name: 'next_touch_at', type: 'timestamptz', nullable: true })
  nextTouchAt: Date | null;

  /** Длина предыдущего интервала касания — чтобы следующий отличался. */
  @Column({ name: 'last_interval_hours', type: 'numeric', precision: 6, scale: 2, nullable: true })
  lastIntervalHours: string | null;

  @Column({ name: 'reminders_sent', type: 'integer', default: 0 })
  remindersSent: number;

  @Column({ name: 'touch_postponed_count', type: 'integer', default: 0 })
  touchPostponedCount: number;

  // --- слоты ----------------------------------------------------------------

  @Column({ name: 'birth_date', type: 'date', nullable: true })
  birthDate: string | null;

  /** Как написал клиент («12 марта 94»). */
  @Column({ name: 'birth_date_text', type: 'varchar', length: 64, nullable: true })
  birthDateText: string | null;

  @Column({ name: 'birth_place', type: 'varchar', length: 256, nullable: true })
  birthPlace: string | null;

  @Column({ type: 'integer', nullable: true })
  age: number | null;

  @Column({ name: 'is_minor', type: 'boolean', default: false })
  isMinor: boolean;

  @Column({ type: 'varchar', length: 1, nullable: true })
  gender: Gender | null;

  @Column({ name: 'gender_source', type: 'varchar', length: 16, nullable: true })
  genderSource: GenderSource | null;

  @Column({ type: 'varchar', length: 8, default: 'ru' })
  language: string;

  @Column({ name: 'request_category_key', type: 'varchar', length: 64, nullable: true })
  requestCategoryKey: string | null;

  @Column({ name: 'request_summary', type: 'text', nullable: true })
  requestSummary: string | null;

  @Column({ name: 'request_text', type: 'text', nullable: true })
  requestText: string | null;

  /** Какие слоты правил менеджер — бот их не перезаписывает. */
  @Column({ name: 'manual_slots', type: 'varchar', array: true, default: () => "'{}'::varchar[]" })
  manualSlots: string[];

  // --- что уже было -----------------------------------------------------------

  @Column({ name: 'sent_block_ids', type: 'uuid', array: true, default: () => "'{}'::uuid[]" })
  sentBlockIds: string[];

  @Column({ name: 'used_example_ids', type: 'uuid', array: true, default: () => "'{}'::uuid[]" })
  usedExampleIds: string[];

  @Column({ name: 'diagnostics_template_id', type: 'uuid', nullable: true })
  diagnosticsTemplateId: string | null;

  @Column({ name: 'diagnostics_sent_at', type: 'timestamptz', nullable: true })
  diagnosticsSentAt: Date | null;

  @Column({ name: 'diagnostics_read_at', type: 'timestamptz', nullable: true })
  diagnosticsReadAt: Date | null;

  @Column({ name: 'last_greeting_at', type: 'timestamptz', nullable: true })
  lastGreetingAt: Date | null;

  /** Сообщений бота подряд без ответа клиента внутри диалога (не касаний). */
  @Column({ name: 'auto_messages_since_client', type: 'integer', default: 0 })
  autoMessagesSinceClient: number;

  // --- передача и жизненный цикл -----------------------------------------------

  @Column({ name: 'handoff_reason', type: 'varchar', length: 32, nullable: true })
  handoffReason: HandoffReason | null;

  @Column({ name: 'handoff_at', type: 'timestamptz', nullable: true })
  handoffAt: Date | null;

  @Column({ name: 'funnel_started_at', type: 'timestamptz', nullable: true })
  funnelStartedAt: Date | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'last_client_message_at', type: 'timestamptz', nullable: true })
  lastClientMessageAt: Date | null;

  @Column({ name: 'last_bot_message_at', type: 'timestamptz', nullable: true })
  lastBotMessageAt: Date | null;

  @Column({ name: 'manual_notes', type: 'text', nullable: true })
  manualNotes: string | null;

  /** Оптимистичная блокировка: ход и таймер не перезаписывают друг друга. */
  @VersionColumn({ type: 'integer', default: 0 })
  version: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
