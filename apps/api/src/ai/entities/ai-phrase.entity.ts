import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Gender, PhraseConditions, PhraseKind, PhraseUsage } from '../domain/types.js';

export type LibrarySource = 'seed' | 'manual' | 'copied';

/**
 * Библиотека фраз аккаунта (раздел 6.6 ТЗ): примеры (образцы тона, которые
 * модель перефразирует) и блоки (уходят дословно). Сообщения внутри
 * текста разделяются строкой `---`.
 */
@Entity({ name: 'ai_phrases' })
@Index(['accountId', 'kind', 'enabled'])
export class AiPhraseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ type: 'varchar', length: 8, default: 'example' })
  usage: PhraseUsage;

  @Column({ type: 'varchar', length: 32 })
  kind: PhraseKind;

  @Column({ name: 'category_key', type: 'varchar', length: 64, nullable: true })
  categoryKey: string | null;

  @Column({ type: 'varchar', length: 1, nullable: true })
  gender: Gender | null;

  @Column({ type: 'varchar', length: 8, default: 'ru' })
  language: string;

  @Column({ type: 'varchar', length: 128, default: '' })
  title: string;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  conditions: PhraseConditions;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'integer', default: 1 })
  weight: number;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder: number;

  @Column({ name: 'sent_count', type: 'integer', default: 0 })
  sentCount: number;

  @Column({ name: 'replied_count', type: 'integer', default: 0 })
  repliedCount: number;

  @Column({ type: 'varchar', length: 16, default: 'manual' })
  source: LibrarySource;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
