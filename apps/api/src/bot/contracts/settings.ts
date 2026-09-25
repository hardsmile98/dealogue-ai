import type { BotAccountSettingsEntity } from '../entities/bot-account-settings.entity.js';
import type { LibraryKind } from '../library/kinds.js';
import { readPersona } from '../library/persona.js';
import type { Persona } from '../library/persona.js';
import { readTimings } from '../library/timings.js';
import type { Timings } from '../library/timings.js';

/** Сколько элементов в библиотеке по видам — чтобы веб показал, что импорт сделан. */
export interface LibraryCountsDto {
  total: number;
  byKind: Partial<Record<LibraryKind, number>>;
}

export interface BotSettingsDto {
  accountId: string;
  enabled: boolean;
  enabledAt: string | null;
  persona: Persona;
  timings: Timings;
  model: string;
  library: LibraryCountsDto;
}

export interface LibraryImportResultDto {
  inserted: number;
  updated: number;
  skipped: number;
  total: number;
}

export function toSettingsDto(
  settings: BotAccountSettingsEntity,
  accountName: string,
  library: LibraryCountsDto,
): BotSettingsDto {
  return {
    accountId: settings.accountId,
    enabled: settings.enabled,
    enabledAt: settings.enabledAt?.toISOString() ?? null,
    persona: readPersona(settings.persona, accountName),
    timings: readTimings(settings.timings),
    model: settings.model,
    library,
  };
}
