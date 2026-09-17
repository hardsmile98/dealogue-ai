import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { NoteSource } from '../domain/types.js';

/** Заметка менеджера, которая попадает в промпт (раздел 6.12 ТЗ). */
@Entity({ name: 'ai_notes' })
@Index(['accountId', 'enabled'])
export class AiNoteEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ type: 'text' })
  text: string;

  /** `global` / `stage:<key>` / `category:<key>`. */
  @Column({ type: 'varchar', length: 96, default: 'global' })
  scope: string;

  @Column({ type: 'varchar', length: 16, default: 'manual' })
  source: NoteSource;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
