import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Категория запроса клиента — для выбора диагностики и классификации (раздел 6.10 ТЗ). */
@Entity({ name: 'ai_categories' })
@Index(['accountId', 'key'], { unique: true })
export class AiCategoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  /** `relationships.breakup`. */
  @Column({ type: 'varchar', length: 64 })
  key: string;

  /** `relationships` / `money` / `health` / `family` / `universal` / `mentoring` / `other`. */
  @Column({ name: 'group_key', type: 'varchar', length: 32 })
  groupKey: string;

  @Column({ type: 'varchar', length: 128 })
  title: string;

  /** Для модели: когда выбирать эту категорию. */
  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ name: 'clarifying_fact_key', type: 'varchar', length: 32, nullable: true })
  clarifyingFactKey: string | null;

  @Column({ name: 'clarifying_question', type: 'text', nullable: true })
  clarifyingQuestion: string | null;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
