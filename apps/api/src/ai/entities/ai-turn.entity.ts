import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { FunnelStage, TouchKind, TurnOutcome, TurnRating, TurnTrigger } from '../domain/types.js';

/** Одно запланированное или отправленное сообщение хода. */
export interface TurnMessage {
  text: string;
  /** Маркер блока, если сообщение — дословный блок. */
  blockId?: string | null;
  telegramMessageId?: number | null;
  sentAt?: string | null;
}

/** Журнал ходов агента (раздел 6.4 ТЗ): что понял, что планировал, что ушло. */
@Entity({ name: 'ai_turns' })
@Index(['chatId', 'createdAt'])
@Index(['accountId', 'createdAt'])
export class AiTurnEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ name: 'chat_id', type: 'uuid' })
  chatId: string;

  @Column({ type: 'varchar', length: 16 })
  trigger: TurnTrigger;

  @Column({ name: 'touch_kind', type: 'varchar', length: 32, nullable: true })
  touchKind: TouchKind | null;

  @Column({ name: 'stage_before', type: 'varchar', length: 32, nullable: true })
  stageBefore: FunnelStage | null;

  @Column({ name: 'stage_after', type: 'varchar', length: 32, nullable: true })
  stageAfter: FunnelStage | null;

  @Column({ name: 'input_message_ids', type: 'uuid', array: true, default: () => "'{}'::uuid[]" })
  inputMessageIds: string[];

  /** Текст входящих пачки — по нему ищутся похожие случаи (раздел 9.3 ТЗ). */
  @Column({ name: 'client_text', type: 'text', default: '' })
  clientText: string;

  /** Черновики и ходы, подмешанные в промпт как похожие случаи. */
  @Column({ name: 'similar_case_ids', type: 'uuid', array: true, default: () => "'{}'::uuid[]" })
  similarCaseIds: string[];

  @Column({ name: 'prompt_version', type: 'varchar', length: 16, nullable: true })
  promptVersion: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  model: string | null;

  /** Блок analysis из ответа модели. */
  @Column({ type: 'jsonb', nullable: true })
  analysis: Record<string, unknown> | null;

  @Column({ name: 'messages_planned', type: 'jsonb', default: () => "'[]'::jsonb" })
  messagesPlanned: TurnMessage[];

  @Column({ name: 'messages_sent', type: 'jsonb', default: () => "'[]'::jsonb" })
  messagesSent: TurnMessage[];

  /** Какие проверки guard сработали, была ли регенерация. */
  @Column({ name: 'guard_notes', type: 'jsonb', default: () => "'[]'::jsonb" })
  guardNotes: Record<string, unknown>[];

  @Column({ type: 'varchar', length: 24 })
  outcome: TurnOutcome;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ name: 'tokens_in', type: 'integer', default: 0 })
  tokensIn: number;

  @Column({ name: 'tokens_out', type: 'integer', default: 0 })
  tokensOut: number;

  @Column({ name: 'duration_ms', type: 'integer', default: 0 })
  durationMs: number;

  @Column({ type: 'varchar', length: 8, nullable: true })
  rating: TurnRating | null;

  @Column({ name: 'rating_note', type: 'text', nullable: true })
  ratingNote: string | null;

  /** Примеры, блоки и диагностики, ушедшие в этом ходе, — для счётчика ответов. */
  @Column({ name: 'library_ids', type: 'uuid', array: true, default: () => "'{}'::uuid[]" })
  libraryIds: string[];

  /** Когда клиент ответил на этот ход (в пределах суток); null — ответа не было или ещё не считали. */
  @Column({ name: 'replied_at', type: 'timestamptz', nullable: true })
  repliedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
