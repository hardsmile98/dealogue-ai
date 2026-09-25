/** Библиотека текстов и примеры диалогов — зеркало apps/api/src/bot/bot.types.ts. */
import type { Gender, Language, LibraryKind, Stage } from './kinds';

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

/** Тело POST/PUT примера диалога. */
export interface ExampleBody {
  stage: Stage;
  situation: string;
  client: string;
  practitioner: string;
  enabled: boolean;
}
