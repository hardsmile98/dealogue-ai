import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Gender, LibraryKind } from '../library/kinds.js';

/**
 * Библиотека аккаунта: образцы фраз и тела вех. Тела вех (`links`,
 * `diagnostic`, `offer`, `prices`) уходят клиенту дословно, остальное —
 * образцы тона для ответчика. Элементы стандартной библиотеки помечены
 * `seed_key` (ячейка исходной таблицы) — по нему импорт идемпотентен;
 * частичный уникальный индекс на (account_id, seed_key) создаёт миграция.
 */
@Entity({ name: 'bot_library_items' })
@Index(['accountId', 'kind', 'sort'])
export class BotLibraryItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ type: 'varchar', length: 32 })
  kind: LibraryKind;

  @Column({ type: 'varchar', length: 8, default: 'ru' })
  language: string;

  /** null — подходит любому полу клиента. */
  @Column({ type: 'varchar', length: 1, nullable: true })
  gender: Gender | null;

  /** Категория запроса (диагностики), категория возражения (плейбук) или пометка ситуации. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  category: string | null;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'integer', default: 0 })
  sort: number;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ name: 'seed_key', type: 'varchar', length: 64, nullable: true })
  seedKey: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
