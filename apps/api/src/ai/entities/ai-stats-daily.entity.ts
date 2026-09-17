import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Предрасчитанная статистика по аккаунту за день (раздел 14 ТЗ). */
@Entity({ name: 'ai_stats_daily' })
@Index(['accountId', 'date'], { unique: true })
export class AiStatsDailyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  /** `YYYY-MM-DD` в зоне аккаунта. */
  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metrics: Record<string, unknown>;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
