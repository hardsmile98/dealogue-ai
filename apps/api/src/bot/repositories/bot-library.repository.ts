import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { DeepPartial, FindOptionsWhere } from 'typeorm';
import { execute } from '../../database/sql.js';
import { BotLibraryItemEntity } from '../entities/bot-library-item.entity.js';
import type { LibraryKind } from '../library/kinds.js';
import type { SeedItem } from '../library/seed/default-library.js';

export interface LibraryFilter {
  kind?: LibraryKind;
  language?: string;
  category?: string;
  enabled?: boolean;
}

/** Итог импорта стандартной библиотеки: сколько строк вставлено и сколько обновлено. */
export interface SeedUpsertResult {
  inserted: number;
  updated: number;
}

/** Таблица bot_library_items: библиотека аккаунта (раздел 6 архитектуры). */
@Injectable()
export class BotLibraryRepository {
  constructor(
    @InjectRepository(BotLibraryItemEntity)
    private readonly items: Repository<BotLibraryItemEntity>,
  ) {}

  /** Элементы аккаунта по видам и порядку — индекс (account_id, kind, sort). */
  list(
    accountId: string,
    filter: LibraryFilter = {},
  ): Promise<BotLibraryItemEntity[]> {
    const where: FindOptionsWhere<BotLibraryItemEntity> = { accountId };
    if (filter.kind) where.kind = filter.kind;
    if (filter.language) where.language = filter.language;
    if (filter.category) where.category = filter.category;
    if (filter.enabled !== undefined) where.enabled = filter.enabled;
    return this.items.find({
      where,
      order: { kind: 'ASC', sort: 'ASC', createdAt: 'ASC' },
    });
  }

  findOwned(
    accountId: string,
    itemId: string,
  ): Promise<BotLibraryItemEntity | null> {
    return this.items.findOne({ where: { id: itemId, accountId } });
  }

  create(
    fields: DeepPartial<BotLibraryItemEntity>,
  ): Promise<BotLibraryItemEntity> {
    return this.items.save(this.items.create(fields));
  }

  save(item: BotLibraryItemEntity): Promise<BotLibraryItemEntity> {
    return this.items.save(item);
  }

  async delete(itemId: string): Promise<void> {
    await this.items.delete({ id: itemId });
  }

  /** Сколько элементов по видам — одним GROUP BY. */
  async countByKind(
    accountId: string,
  ): Promise<{ kind: LibraryKind; count: number }[]> {
    const { rows } = await execute<{ kind: LibraryKind; count: number }>(
      this.items.manager,
      `SELECT kind, COUNT(*)::int AS count FROM bot_library_items WHERE account_id = $1::uuid GROUP BY kind`,
      [accountId],
    );
    return rows;
  }

  /**
   * Стандартная библиотека одним INSERT из массивов, идемпотентно по
   * seed_key. `replace` возвращает тексты и атрибуты к стандартным, но не
   * трогает `enabled`; без него уже импортированные строки пропускаются.
   */
  async upsertSeed(
    accountId: string,
    seed: readonly SeedItem[],
    replace: boolean,
  ): Promise<SeedUpsertResult> {
    const { rows } = await execute<{ inserted: boolean }>(
      this.items.manager,
      `INSERT INTO bot_library_items
         (account_id, seed_key, kind, language, gender, category, title, text, sort, enabled)
       SELECT $1::uuid, s.seed_key, s.kind, s.language, s.gender, s.category, s.title, s.text, s.sort, s.enabled
       FROM unnest(
         $2::varchar[], $3::varchar[], $4::varchar[], $5::varchar[], $6::varchar[],
         $7::varchar[], $8::text[], $9::int[], $10::boolean[]
       ) AS s(seed_key, kind, language, gender, category, title, text, sort, enabled)
       ON CONFLICT (account_id, seed_key) WHERE seed_key IS NOT NULL DO UPDATE SET
         kind = EXCLUDED.kind,
         language = EXCLUDED.language,
         gender = EXCLUDED.gender,
         category = EXCLUDED.category,
         title = EXCLUDED.title,
         text = EXCLUDED.text,
         sort = EXCLUDED.sort,
         updated_at = now()
       WHERE $11::boolean
       RETURNING (xmax = 0) AS inserted`,
      [
        accountId,
        seed.map((item) => item.seedKey),
        seed.map((item) => item.kind),
        seed.map((item) => item.language),
        seed.map((item) => item.gender),
        seed.map((item) => item.category),
        seed.map((item) => item.title),
        seed.map((item) => item.text),
        seed.map((item) => item.sort),
        seed.map((item) => item.enabled),
        replace,
      ],
    );
    const inserted = rows.filter((row) => row.inserted).length;
    return { inserted, updated: rows.length - inserted };
  }
}
