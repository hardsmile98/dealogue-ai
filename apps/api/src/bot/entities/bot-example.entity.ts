import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Stage } from '../library/kinds.js';

/**
 * Пример реального обмена «клиент → практик» для промпта ответчика:
 * эталон тона и длины на этапе. Отбирается вручную из переписки,
 * персональные данные заменяются на обобщённые при добавлении.
 */
@Entity({ name: 'bot_examples' })
@Index(['accountId', 'stage', 'sort'])
export class BotExampleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ type: 'varchar', length: 16 })
  stage: Stage;

  /** Короткое описание ситуации: «спросила, где живу, и рассказала о разводе». */
  @Column({ type: 'varchar', length: 500 })
  situation: string;

  /** Сообщения клиента, как пришли (несколько — через пустую строку). */
  @Column({ type: 'text' })
  client: string;

  /** Ответ практика. */
  @Column({ type: 'text' })
  practitioner: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'integer', default: 0 })
  sort: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
