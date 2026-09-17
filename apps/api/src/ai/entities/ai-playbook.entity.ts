import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { FunnelStage, PhraseKind } from '../domain/types.js';

/** Плейбук этапа воронки: цель, инструкции, блоки и примеры (раздел 6.5 ТЗ). */
@Entity({ name: 'ai_playbooks' })
@Index(['accountId', 'stage'], { unique: true })
export class AiPlaybookEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ type: 'varchar', length: 32 })
  stage: FunnelStage;

  @Column({ type: 'text', default: '' })
  goal: string;

  /** Что обязательно, чего нельзя, сигналы продвижения — свободный текст для промпта. */
  @Column({ type: 'text', default: '' })
  instructions: string;

  @Column({ name: 'required_block_kinds', type: 'varchar', array: true, default: () => "'{}'::varchar[]" })
  requiredBlockKinds: PhraseKind[];

  @Column({ name: 'allowed_block_kinds', type: 'varchar', array: true, default: () => "'{}'::varchar[]" })
  allowedBlockKinds: PhraseKind[];

  @Column({ name: 'example_kinds', type: 'varchar', array: true, default: () => "'{}'::varchar[]" })
  exampleKinds: PhraseKind[];

  @Column({ name: 'no_questions', type: 'boolean', default: false })
  noQuestions: boolean;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
