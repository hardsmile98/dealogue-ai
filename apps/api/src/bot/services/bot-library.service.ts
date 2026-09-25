import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { TelegramAccountEntity } from '../../telegram/entities/telegram-account.entity.js';
import { toLibraryItemDto } from '../bot.types.js';
import type { LibraryImportResultDto, LibraryItemDto } from '../bot.types.js';
import type {
  CreateLibraryItemDto,
  ImportMode,
  ListLibraryQueryDto,
  UpdateLibraryItemDto,
} from '../dto/library.dto.js';
import type { BotLibraryItemEntity } from '../entities/bot-library-item.entity.js';
import { OBJECTION_CATEGORIES, isRequestCategory } from '../library/kinds.js';
import type { LibraryKind } from '../library/kinds.js';
import { unknownPlaceholders } from '../library/persona.js';
import { DEFAULT_LIBRARY } from '../library/seed/default-library.js';
import { BotLibraryRepository } from '../repositories/bot-library.repository.js';
import { BotSettingsService } from './bot-settings.service.js';

/** Библиотека аккаунта: список, правки и импорт стандартной. */
@Injectable()
export class BotLibraryService {
  constructor(
    private readonly items: BotLibraryRepository,
    private readonly settings: BotSettingsService,
  ) {}

  async list(
    account: TelegramAccountEntity,
    query: ListLibraryQueryDto,
  ): Promise<LibraryItemDto[]> {
    const rows = await this.items.list(account.id, query);
    return rows.map(toLibraryItemDto);
  }

  async create(
    account: TelegramAccountEntity,
    dto: CreateLibraryItemDto,
  ): Promise<LibraryItemDto> {
    this.check(dto.kind, dto.category ?? null, dto.text);
    const row = await this.items.create({
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
    });
    return toLibraryItemDto(row);
  }

  async update(
    account: TelegramAccountEntity,
    itemId: string,
    dto: UpdateLibraryItemDto,
  ): Promise<LibraryItemDto> {
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
    await this.items.delete(row.id);
  }

  /**
   * Импорт стандартной библиотеки. Идемпотентен по seed_key: `keep` не
   * трогает уже импортированные элементы, `replace` возвращает их тексты
   * и атрибуты к стандартным, но не меняет `enabled` — включённость
   * остаётся за владельцем. Пустой образ дополняется образом из таблиц.
   */
  async importDefaults(
    account: TelegramAccountEntity,
    mode: ImportMode,
  ): Promise<LibraryImportResultDto> {
    const seed = DEFAULT_LIBRARY.items;
    const { inserted, updated } = await this.items.upsertSeed(
      account.id,
      seed,
      mode === 'replace',
    );
    await this.settings.fillPersonaDefaults(account, DEFAULT_LIBRARY.persona);
    return {
      inserted,
      updated,
      skipped: seed.length - inserted - updated,
      total: seed.length,
    };
  }

  private async require(
    account: TelegramAccountEntity,
    itemId: string,
  ): Promise<BotLibraryItemEntity> {
    const row = await this.items.findOwned(account.id, itemId);
    if (!row) throw new NotFoundException('Элемент библиотеки не найден');
    return row;
  }

  /** Что не проверить декораторами: категория под вид, плейсхолдеры. */
  private check(
    kind: LibraryKind,
    category: string | null,
    text: string,
  ): void {
    if (kind === 'diagnostic' && (!category || !isRequestCategory(category))) {
      throw new BadRequestException(
        'У диагностики должна быть категория запроса из справочника',
      );
    }
    if (
      kind === 'objection' &&
      (!category ||
        !(OBJECTION_CATEGORIES as readonly string[]).includes(category))
    ) {
      throw new BadRequestException(
        `У возражения должна быть категория из плейбука: ${OBJECTION_CATEGORIES.join(', ')}`,
      );
    }
    const unknown = unknownPlaceholders(text);
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Неизвестные плейсхолдеры: ${unknown.join(', ')} (допустимы {{bio}} и {{links}})`,
      );
    }
  }
}
