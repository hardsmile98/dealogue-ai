import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';
import { GENDERS, LANGUAGES, LIBRARY_KINDS } from '../library/kinds.js';
import type { Gender, Language, LibraryKind } from '../library/kinds.js';

/** Тело вехи целиком — до 20 000 символов (диагностики длиной до 9 000). */
export const LIBRARY_TEXT_MAX_LENGTH = 20_000;

/** «true»/«false» из query-строки → boolean. */
const BooleanQuery = () =>
  Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  );

export class ListLibraryQueryDto {
  @IsIn(LIBRARY_KINDS, { message: 'kind: неизвестный вид' })
  @IsOptional()
  kind?: LibraryKind;

  @IsIn(LANGUAGES, { message: 'language: ожидается ru или en' })
  @IsOptional()
  language?: Language;

  @MaxLength(64)
  @IsString()
  @Trim()
  @IsOptional()
  category?: string;

  @IsBoolean({ message: 'enabled: ожидается true или false' })
  @BooleanQuery()
  @IsOptional()
  enabled?: boolean;
}

export class CreateLibraryItemDto {
  @IsIn(LIBRARY_KINDS, { message: 'kind: неизвестный вид' })
  kind: LibraryKind;

  @IsIn(LANGUAGES, { message: 'language: ожидается ru или en' })
  @IsOptional()
  language: Language = 'ru';

  @IsIn(GENDERS, { message: 'gender: ожидается f, m или null' })
  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  gender?: Gender | null;

  @MaxLength(64, { message: 'category: длиннее 64 символов' })
  @IsString()
  @Trim()
  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  category?: string | null;

  @MaxLength(200, { message: 'Название длиннее 200 символов' })
  @IsString()
  @IsNotEmpty({ message: 'Введите название' })
  @Trim()
  title: string;

  @MaxLength(LIBRARY_TEXT_MAX_LENGTH, { message: `Текст длиннее ${LIBRARY_TEXT_MAX_LENGTH} символов` })
  @IsString()
  @IsNotEmpty({ message: 'Введите текст' })
  @Trim()
  text: string;

  @IsInt({ message: 'sort: ожидается целое число' })
  @IsOptional()
  sort?: number;

  @IsBoolean({ message: 'enabled: ожидается true или false' })
  @IsOptional()
  enabled?: boolean;
}

/** Всё необязательно: меняется только присланное. */
export class UpdateLibraryItemDto {
  @IsIn(LIBRARY_KINDS, { message: 'kind: неизвестный вид' })
  @IsOptional()
  kind?: LibraryKind;

  @IsIn(LANGUAGES, { message: 'language: ожидается ru или en' })
  @IsOptional()
  language?: Language;

  @IsIn(GENDERS, { message: 'gender: ожидается f, m или null' })
  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  gender?: Gender | null;

  @MaxLength(64, { message: 'category: длиннее 64 символов' })
  @IsString()
  @Trim()
  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  category?: string | null;

  @MaxLength(200, { message: 'Название длиннее 200 символов' })
  @IsString()
  @IsNotEmpty({ message: 'Введите название' })
  @Trim()
  @IsOptional()
  title?: string;

  @MaxLength(LIBRARY_TEXT_MAX_LENGTH, { message: `Текст длиннее ${LIBRARY_TEXT_MAX_LENGTH} символов` })
  @IsString()
  @IsNotEmpty({ message: 'Введите текст' })
  @Trim()
  @IsOptional()
  text?: string;

  @IsInt({ message: 'sort: ожидается целое число' })
  @IsOptional()
  sort?: number;

  @IsBoolean({ message: 'enabled: ожидается true или false' })
  @IsOptional()
  enabled?: boolean;
}

export const IMPORT_MODES = ['keep', 'replace'] as const;
export type ImportMode = (typeof IMPORT_MODES)[number];

export class ImportLibraryDto {
  /** `keep` — уже импортированные не трогать; `replace` — вернуть их тексты к стандартным. */
  @IsIn(IMPORT_MODES, { message: 'mode: ожидается keep или replace' })
  @IsOptional()
  mode: ImportMode = 'keep';
}
