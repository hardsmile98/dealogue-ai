import seedJson from './default-library.json' with { type: 'json' };
import type { Gender, Language, LibraryKind } from '../kinds.js';

/** Элемент стандартной библиотеки — то, что кладётся в bot_library_items. */
export interface SeedItem {
  /** Ключ идемпотентности импорта: ячейка исходной таблицы. */
  seedKey: string;
  kind: LibraryKind;
  language: Language;
  gender: Gender | null;
  category: string | null;
  title: string;
  text: string;
  sort: number;
  enabled: boolean;
}

export interface LibrarySeed {
  version: number;
  source: string;
  /** Образ по умолчанию из таблиц: пол и биография; имя берётся из аккаунта. */
  persona: { gender: Gender; bio: string };
  items: SeedItem[];
}

/**
 * Стандартная библиотека, собранная из docs/source/*.xlsx скриптом
 * (см. docs/source/README.md). В рантайме таблицы не читаются: правки —
 * только в вебе, повторный импорт с `mode: replace` возвращает тексты
 * к исходным, не трогая включённость.
 */
export const DEFAULT_LIBRARY: LibrarySeed = seedJson as LibrarySeed;
