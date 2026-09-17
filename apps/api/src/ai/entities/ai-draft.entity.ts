import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { DecisionSource, DraftKind, DraftStatus, HandoffReason } from '../domain/types.js';
import type { TurnMessage } from './ai-turn.entity.js';

/** Черновик ответа для менеджера: передача или ход в режиме supervised (раздел 6.11 ТЗ). */
@Entity({ name: 'ai_drafts' })
@Index(['accountId', 'status', 'createdAt'])
@Index(['chatId', 'createdAt'])
export class AiDraftEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ name: 'chat_id', type: 'uuid' })
  chatId: string;

  @Column({ name: 'turn_id', type: 'uuid', nullable: true })
  turnId: string | null;

  @Column({ type: 'varchar', length: 16, default: 'handoff' })
  kind: DraftKind;

  @Column({ type: 'varchar', length: 24, default: 'pending' })
  status: DraftStatus;

  @Column({ name: 'client_message_ids', type: 'uuid', array: true, default: () => "'{}'::uuid[]" })
  clientMessageIds: string[];

  @Column({ name: 'client_text', type: 'text', default: '' })
  clientText: string;

  @Column({ name: 'handoff_reason', type: 'varchar', length: 32, nullable: true })
  handoffReason: HandoffReason | null;

  @Column({ name: 'draft_messages', type: 'jsonb', default: () => "'[]'::jsonb" })
  draftMessages: TurnMessage[];

  @Column({ name: 'draft_rationale', type: 'text', nullable: true })
  draftRationale: string | null;

  @Column({ name: 'similar_case_ids', type: 'uuid', array: true, default: () => "'{}'::uuid[]" })
  similarCaseIds: string[];

  /** Что реально ушло клиенту. */
  @Column({ name: 'final_text', type: 'text', nullable: true })
  finalText: string | null;

  @Column({ name: 'sent_message_ids', type: 'uuid', array: true, default: () => "'{}'::uuid[]" })
  sentMessageIds: string[];

  @Column({ name: 'decided_by', type: 'uuid', nullable: true })
  decidedBy: string | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @Column({ name: 'decision_source', type: 'varchar', length: 8, nullable: true })
  decisionSource: DecisionSource | null;

  @Column({ name: 'prompt_version', type: 'varchar', length: 16, nullable: true })
  promptVersion: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
