import type { BotExampleEntity } from '../entities/bot-example.entity.js';
import type { BotLibraryItemEntity } from '../entities/bot-library-item.entity.js';
import type { Gender, LibraryKind, Stage } from '../library/kinds.js';

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

export interface ExampleDto {
  id: string;
  accountId: string;
  stage: Stage;
  situation: string;
  client: string;
  practitioner: string;
  enabled: boolean;
  sort: number;
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

export function toExampleDto(example: BotExampleEntity): ExampleDto {
  return {
    id: example.id,
    accountId: example.accountId,
    stage: example.stage,
    situation: example.situation,
    client: example.client,
    practitioner: example.practitioner,
    enabled: example.enabled,
    sort: example.sort,
    createdAt: example.createdAt.toISOString(),
    updatedAt: example.updatedAt.toISOString(),
  };
}
