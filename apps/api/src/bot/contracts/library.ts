import type { BotLibraryItemEntity } from '../entities/bot-library-item.entity.js';
import type { Gender, LibraryKind } from '../library/kinds.js';

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

export function toLibraryItemDto(item: BotLibraryItemEntity): LibraryItemDto {
  return {
    id: item.id,
    accountId: item.accountId,
    kind: item.kind,
    language: item.language,
    gender: item.gender,
    category: item.category,
    title: item.title,
    text: item.text,
    sort: item.sort,
    enabled: item.enabled,
    seedKey: item.seedKey,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
