import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Gender } from '../domain/types.js';
import type { LibrarySource } from './ai-phrase.entity.js';

/**
 * Шаблон диагностики (раздел 6.8 ТЗ). Уходит дословно; сообщения
 * разделяются строкой `---`, иначе текст режется по абзацам.
 */
@Entity({ name: 'ai_diagnostics' })
@Index(['accountId', 'key'], { unique: true })
@Index(['accountId', 'categoryKey', 'gender', 'language'])
export class AiDiagnosticEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ type: 'varchar', length: 64 })
  key: string;

  @Column({ type: 'varchar', length: 128 })
  title: string;

  /** null — универсальная. */
  @Column({ name: 'category_key', type: 'varchar', length: 64, nullable: true })
  categoryKey: string | null;

  @Column({ type: 'varchar', length: 1, nullable: true })
  gender: Gender | null;

  @Column({ type: 'varchar', length: 8, default: 'ru' })
  language: string;

  @Column({ type: 'text' })
  text: string;

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
