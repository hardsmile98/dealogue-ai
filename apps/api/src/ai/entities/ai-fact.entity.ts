import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { FactGroup } from '../domain/types.js';

/** Факты об услугах и персоне — единственный источник утверждений бота (раздел 6.7 ТЗ). */
@Entity({ name: 'ai_facts' })
@Index(['accountId', 'key'], { unique: true })
export class AiFactEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ type: 'varchar', length: 16 })
  group: FactGroup;

  /** `service.cleaning`, `price.cleaning`, `link.instagram`. */
  @Column({ type: 'varchar', length: 64 })
  key: string;

  @Column({ type: 'varchar', length: 128 })
  title: string;

  @Column({ type: 'text' })
  value: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
