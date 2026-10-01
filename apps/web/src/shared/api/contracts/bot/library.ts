/** Библиотека текстов — зеркало apps/api/src/bot/bot.types.ts. */
import type { Gender, Language, LibraryKind } from './kinds';

export interface LibraryItemDto {
  id: string;
  accountId: string;
  kind: LibraryKind;
  language: string;
  gender: Gender | null;
  category: string | null;
  title: string;
  text: string;
  sort: number;
  enabled: boolean;
  /** Ключ стандартной библиотеки; null у созданных руками. */
  seedKey: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Тело POST/PUT элемента библиотеки. */
export interface LibraryItemBody {
  kind: LibraryKind;
  language: Language;
  gender: Gender | null;
  category: string | null;
  title: string;
  text: string;
  enabled: boolean;
}
