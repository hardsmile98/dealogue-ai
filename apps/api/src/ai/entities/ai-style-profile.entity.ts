import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { StyleProfile, StyleProfileOverrides } from '../learning/style-profile.schema.js';

export type StyleProfileStatus = 'empty' | 'building' | 'ready' | 'error';

export interface StyleProfileProgress {
  dialogsTotal: number;
  dialogsDone: number;
  stage: 'collect' | 'map' | 'reduce' | 'index';
}

export interface StyleProfileSourceStats {
  dialogs: number;
  exchanges: number;
  managerMessages: number;
  from: string | null;
  to: string | null;
  /** Мало данных — профиль ненадёжен, ИИ опирается на скрипт. */
  thin: boolean;
}

/** Выученный из истории профиль стиля и знаний менеджера (1:1 с аккаунтом). */
@Entity({ name: 'ai_style_profile' })
@Index(['accountId'], { unique: true })
export class AiStyleProfileEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ type: 'integer', default: 0 })
  version: number;

  @Column({ type: 'varchar', length: 16, default: 'empty' })
  status: StyleProfileStatus;

  @Column({ type: 'jsonb', nullable: true })
  progress: StyleProfileProgress | null;

  @Column({ name: 'built_at', type: 'timestamptz', nullable: true })
  builtAt: Date | null;

  @Column({ name: 'source_stats', type: 'jsonb', nullable: true })
  sourceStats: StyleProfileSourceStats | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  profile: StyleProfile;

  @Column({ type: 'jsonb', nullable: true })
  overrides: StyleProfileOverrides | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
