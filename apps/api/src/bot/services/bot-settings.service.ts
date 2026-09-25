import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { execute } from '../../database/sql.js';
import type { TelegramAccountEntity } from '../../telegram/entities/telegram-account.entity.js';
import { toSettingsDto } from '../bot.types.js';
import type { BotSettingsDto } from '../bot.types.js';
import type { UpdateBotSettingsDto } from '../dto/settings.dto.js';
import { BotAccountSettingsEntity } from '../entities/bot-account-settings.entity.js';
import { BotLibraryItemEntity } from '../entities/bot-library-item.entity.js';
import type { LibraryKind } from '../library/kinds.js';
import { readPersona } from '../library/persona.js';
import type { Persona } from '../library/persona.js';
import { mergeTimings, readTimings, validateTimings } from '../library/timings.js';

/**
 * Настройки агента на аккаунте. Строка заводится при первом обращении,
 * поэтому у любого аккаунта настройки «есть» — со значениями по умолчанию.
 */
@Injectable()
export class BotSettingsService {
  constructor(
    @InjectRepository(BotAccountSettingsEntity)
    private readonly settings: Repository<BotAccountSettingsEntity>,
    @InjectRepository(BotLibraryItemEntity)
    private readonly library: Repository<BotLibraryItemEntity>,
  ) {}

  async describe(account: TelegramAccountEntity): Promise<BotSettingsDto> {
    const settings = await this.ensure(account);
    return toSettingsDto(settings, account.displayName, await this.libraryCounts(account.id));
  }

  /** Строка настроек, при первом обращении создаётся; гонка двух запросов безопасна. */
  async ensure(account: TelegramAccountEntity): Promise<BotAccountSettingsEntity> {
    await execute(
      this.settings.manager,
      `INSERT INTO bot_account_settings (account_id) VALUES ($1::uuid) ON CONFLICT (account_id) DO NOTHING`,
      [account.id],
    );
    const row = await this.settings.findOne({ where: { accountId: account.id } });
    if (!row) throw new Error(`Настройки агента для аккаунта ${account.id} не создались`);
    return row;
  }

  /** Меняет только присланные поля образа, таймингов и модель. */
  async update(account: TelegramAccountEntity, dto: UpdateBotSettingsDto): Promise<BotSettingsDto> {
    const settings = await this.ensure(account);

    if (dto.persona) {
      const current = readPersona(settings.persona, account.displayName);
      const persona: Persona = {
        name: dto.persona.name ?? current.name,
        gender: dto.persona.gender ?? current.gender,
        bio: dto.persona.bio ?? current.bio,
        links: dto.persona.links?.map((link) => ({ title: link.title, url: link.url })) ?? current.links,
      };
      settings.persona = { ...persona };
    }

    if (dto.timings) {
      const timings = mergeTimings(readTimings(settings.timings), dto.timings);
      const errors = validateTimings(timings);
      if (errors.length > 0) throw new BadRequestException(errors);
      settings.timings = { ...timings };
    }

    if (dto.model !== undefined) settings.model = dto.model;

    await this.settings.save(settings);
    return toSettingsDto(settings, account.displayName, await this.libraryCounts(account.id));
  }

  /**
   * Включает или выключает агент на аккаунте. При включении запоминается
   * момент: агент берёт только диалоги, начатые клиентом после него.
   */
  async setEnabled(account: TelegramAccountEntity, enabled: boolean): Promise<BotSettingsDto> {
    await this.ensure(account);
    await execute(
      this.settings.manager,
      `UPDATE bot_account_settings
       SET enabled = $2::boolean,
           enabled_at = CASE WHEN $2::boolean AND NOT enabled THEN now() ELSE enabled_at END,
           updated_at = now()
       WHERE account_id = $1::uuid`,
      [account.id, enabled],
    );
    return this.describe(account);
  }

  /**
   * Образ из стандартной библиотеки — только в пустые поля: импорт не
   * затирает то, что владелец уже заполнил.
   */
  async fillPersonaDefaults(account: TelegramAccountEntity, defaults: Pick<Persona, 'gender' | 'bio'>): Promise<void> {
    const settings = await this.ensure(account);
    const current = readPersona(settings.persona, account.displayName);
    if (current.bio) return;
    settings.persona = { ...current, gender: defaults.gender, bio: defaults.bio };
    await this.settings.save(settings);
  }

  private async libraryCounts(accountId: string): Promise<BotSettingsDto['library']> {
    const { rows } = await execute<{ kind: LibraryKind; count: number }>(
      this.library.manager,
      `SELECT kind, COUNT(*)::int AS count FROM bot_library_items WHERE account_id = $1::uuid GROUP BY kind`,
      [accountId],
    );
    const byKind: Partial<Record<LibraryKind, number>> = {};
    let total = 0;
    for (const row of rows) {
      byKind[row.kind] = row.count;
      total += row.count;
    }
    return { total, byKind };
  }
}
