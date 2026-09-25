import { BadRequestException, Injectable } from '@nestjs/common';
import type { TelegramAccountEntity } from '../../telegram/entities/telegram-account.entity.js';
import { toSettingsDto } from '../bot.types.js';
import type { BotSettingsDto, LibraryCountsDto } from '../bot.types.js';
import type { UpdateBotSettingsDto } from '../dto/settings.dto.js';
import type { BotAccountSettingsEntity } from '../entities/bot-account-settings.entity.js';
import type { LibraryKind } from '../library/kinds.js';
import { readPersona } from '../library/persona.js';
import type { Persona } from '../library/persona.js';
import {
  mergeTimings,
  readTimings,
  validateTimings,
} from '../library/timings.js';
import type { Timings } from '../library/timings.js';
import { BotLibraryRepository } from '../repositories/bot-library.repository.js';
import { BotSettingsRepository } from '../repositories/bot-settings.repository.js';
import type { SettingsPatch } from '../repositories/bot-settings.repository.js';

/** Включён ли агент на аккаунте (брать ли новые диалоги) и тайминги. */
export interface AgentSwitch {
  enabled: boolean;
  enabledAt: Date | null;
  timings: Timings;
}

/**
 * Настройки агента на аккаунте. Строка заводится при первом обращении,
 * поэтому у любого аккаунта настройки «есть» — со значениями по умолчанию.
 */
@Injectable()
export class BotSettingsService {
  constructor(
    private readonly settings: BotSettingsRepository,
    private readonly library: BotLibraryRepository,
  ) {}

  async describe(account: TelegramAccountEntity): Promise<BotSettingsDto> {
    const [settings, library] = await Promise.all([
      this.settings.ensure(account.id),
      this.libraryCounts(account.id),
    ]);
    return toSettingsDto(settings, account.displayName, library);
  }

  /** Строка настроек, при первом обращении создаётся. */
  ensure(accountId: string): Promise<BotAccountSettingsEntity> {
    return this.settings.ensure(accountId);
  }

  /**
   * Включён ли агент и тайминги — для Telegram-канала и лестницы. Строки ещё
   * нет — значения по умолчанию, те же, что у только что заведённой, без записи.
   */
  async agentSwitch(accountId: string): Promise<AgentSwitch> {
    const row = await this.settings.find(accountId);
    return {
      enabled: row?.enabled ?? false,
      enabledAt: row?.enabledAt ?? null,
      timings: readTimings(row?.timings),
    };
  }

  /** Меняет только присланные поля образа, таймингов и модель. */
  async update(
    account: TelegramAccountEntity,
    dto: UpdateBotSettingsDto,
  ): Promise<BotSettingsDto> {
    const settings = await this.settings.ensure(account.id);
    const patch: SettingsPatch = {};

    if (dto.persona) {
      const current = readPersona(settings.persona, account.displayName);
      const persona: Persona = {
        name: dto.persona.name ?? current.name,
        gender: dto.persona.gender ?? current.gender,
        bio: dto.persona.bio ?? current.bio,
        links:
          dto.persona.links?.map((link) => ({
            title: link.title,
            url: link.url,
          })) ?? current.links,
      };
      patch.persona = { ...persona };
    }

    if (dto.timings) {
      const timings = mergeTimings(readTimings(settings.timings), dto.timings);
      const errors = validateTimings(timings);
      if (errors.length > 0) throw new BadRequestException(errors);
      patch.timings = { ...timings };
    }

    if (dto.model !== undefined) patch.model = dto.model;

    const [updated, library] = await Promise.all([
      Object.keys(patch).length > 0
        ? this.settings.update(account.id, patch)
        : settings,
      this.libraryCounts(account.id),
    ]);
    return toSettingsDto(updated ?? settings, account.displayName, library);
  }

  /**
   * Включает или выключает агент на аккаунте. При включении запоминается
   * момент: агент берёт только диалоги, начатые клиентом после него.
   */
  async setEnabled(
    account: TelegramAccountEntity,
    enabled: boolean,
  ): Promise<BotSettingsDto> {
    const settings = await this.settings.ensure(account.id);
    const [updated, library] = await Promise.all([
      this.settings.setEnabled(account.id, enabled),
      this.libraryCounts(account.id),
    ]);
    return toSettingsDto(updated ?? settings, account.displayName, library);
  }

  /**
   * Образ из стандартной библиотеки — только в пустые поля: импорт не
   * затирает то, что владелец уже заполнил.
   */
  async fillPersonaDefaults(
    account: TelegramAccountEntity,
    defaults: Pick<Persona, 'gender' | 'bio'>,
  ): Promise<void> {
    const settings = await this.settings.ensure(account.id);
    const current = readPersona(settings.persona, account.displayName);
    if (current.bio) return;
    await this.settings.update(account.id, {
      persona: { ...current, gender: defaults.gender, bio: defaults.bio },
    });
  }

  private async libraryCounts(accountId: string): Promise<LibraryCountsDto> {
    const byKind: Partial<Record<LibraryKind, number>> = {};
    let total = 0;
    for (const row of await this.library.countByKind(accountId)) {
      byKind[row.kind] = row.count;
      total += row.count;
    }
    return { total, byKind };
  }
}
