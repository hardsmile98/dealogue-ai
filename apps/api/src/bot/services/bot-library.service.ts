import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { FindOptionsWhere } from 'typeorm';
import { execute } from '../../database/sql.js';
import type { TelegramAccountEntity } from '../../telegram/entities/telegram-account.entity.js';
import { toLibraryItemDto } from '../bot.types.js';
import type { LibraryImportResultDto, LibraryItemDto } from '../bot.types.js';
import type {
  CreateLibraryItemDto,
  ImportMode,
  ListLibraryQueryDto,
  UpdateLibraryItemDto,
} from '../dto/library.dto.js';
import { BotLibraryItemEntity } from '../entities/bot-library-item.entity.js';
import { OBJECTION_CATEGORIES, isRequestCategory } from '../library/kinds.js';
import type { LibraryKind } from '../library/kinds.js';
import { unknownPlaceholders } from '../library/persona.js';
import { DEFAULT_LIBRARY } from '../library/seed/default-library.js';
import { BotSettingsService } from './bot-settings.service.js';

/** Библиотека аккаунта: список, правки и импорт стандартной. */
@Injectable()
export class BotLibraryService {
  constructor(
    @InjectRepository(BotLibraryItemEntity)
    private readonly items: Repository<BotLibraryItemEntity>,
    private readonly settings: BotSettingsService,
  ) {}

  async list(account: TelegramAccountEntity, query: ListLibraryQueryDto): Promise<LibraryItemDto[]> {
    const where: FindOptionsWhere<BotLibraryItemEntity> = { accountId: account.id };
    if (query.kind) where.kind = query.kind;
    if (query.language) where.language = query.language;
    if (query.category) where.category = query.category;
    if (query.enabled !== undefined) where.enabled = query.enabled;
    const rows = await this.items.find({ where, order: { kind: 'ASC', sort: 'ASC', createdAt: 'ASC' } });
    return rows.map(toLibraryItemDto);
  }

  async create(account: TelegramAccountEntity, dto: CreateLibraryItemDto): Promise<LibraryItemDto> {
    this.check(dto.kind, dto.category ?? null, dto.text);
    const row = await this.items.save(
      this.items.create({
        accountId: account.id,
        kind: dto.kind,
        language: dto.language,
        gender: dto.gender ?? null,
        category: dto.category ?? null,
        title: dto.title,
        text: dto.text,
        sort: dto.sort ?? 0,
        enabled: dto.enabled ?? true,
        seedKey: null,
      }),
    );
    return toLibraryItemDto(row);
  }

  async update(account: TelegramAccountEntity, itemId: string, dto: UpdateLibraryItemDto): Promise<LibraryItemDto> {
    const row = await this.require(account, itemId);
    const kind = dto.kind ?? row.kind;
    const category = dto.category === undefined ? row.category : dto.category;
    const text = dto.text ?? row.text;
    this.check(kind, category, text);
    row.kind = kind;
    row.category = category;
    row.text = text;
    if (dto.language !== undefined) row.language = dto.language;
    if (dto.gender !== undefined) row.gender = dto.gender;
    if (dto.title !== undefined) row.title = dto.title;
    if (dto.sort !== undefined) row.sort = dto.sort;
    if (dto.enabled !== undefined) row.enabled = dto.enabled;
    await this.items.save(row);
    return toLibraryItemDto(row);
  }

  async remove(account: TelegramAccountEntity, itemId: string): Promise<void> {
    const row = await this.require(account, itemId);
    await this.items.delete({ id: row.id });
  }

  /**
   * Импорт стандартной библиотеки. Идемпотентен по seed_key: `keep` не
   * трогает уже импортированные элементы, `replace` возвращает их тексты
   * и атрибуты к стандартным, но не меняет `enabled` — включённость
   * остаётся за владельцем. Пустой образ дополняется образом из таблиц.
   */
  async importDefaults(account: TelegramAccountEntity, mode: ImportMode): Promise<LibraryImportResultDto> {
    const seed = DEFAULT_LIBRARY.items;
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
        account.id,
        seed.map((item) => item.seedKey),
        seed.map((item) => item.kind),
        seed.map((item) => item.language),
        seed.map((item) => item.gender),
        seed.map((item) => item.category),
        seed.map((item) => item.title),
        seed.map((item) => item.text),
        seed.map((item) => item.sort),
        seed.map((item) => item.enabled),
        mode === 'replace',
      ],
    );
    const inserted = rows.filter((row) => row.inserted).length;
    const updated = rows.length - inserted;
    await this.settings.fillPersonaDefaults(account, DEFAULT_LIBRARY.persona);
    return { inserted, updated, skipped: seed.length - rows.length, total: seed.length };
  }

  private async require(account: TelegramAccountEntity, itemId: string): Promise<BotLibraryItemEntity> {
    const row = await this.items.findOne({ where: { id: itemId, accountId: account.id } });
    if (!row) throw new NotFoundException('Элемент библиотеки не найден');
    return row;
  }

  /** Что не проверить декораторами: категория под вид, плейсхолдеры. */
  private check(kind: LibraryKind, category: string | null, text: string): void {
    if (kind === 'diagnostic' && (!category || !isRequestCategory(category))) {
      throw new BadRequestException('У диагностики должна быть категория запроса из справочника');
    }
    if (kind === 'objection' && (!category || !(OBJECTION_CATEGORIES as readonly string[]).includes(category))) {
      throw new BadRequestException(`У возражения должна быть категория из плейбука: ${OBJECTION_CATEGORIES.join(', ')}`);
    }
    const unknown = unknownPlaceholders(text);
    if (unknown.length > 0) {
      throw new BadRequestException(`Неизвестные плейсхолдеры: ${unknown.join(', ')} (допустимы {{bio}} и {{links}})`);
    }
  }
}
