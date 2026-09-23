import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';

/** Размер страницы списка чатов по умолчанию и он же — максимальный. */
export const CHATS_PAGE_SIZE = 100;

/** Сообщений на странице переписки по умолчанию. */
export const MESSAGES_PAGE_SIZE = 50;
const MESSAGES_PAGE_MAX = 200;

/** Лимит Telegram на одно сообщение. */
export const MESSAGE_MAX_LENGTH = 4096;

export const CHAT_CODE_FILTERS = ['with', 'without'] as const;
export type ChatCodeFilter = (typeof CHAT_CODE_FILTERS)[number];

export class ListChatsQueryDto {
  /** `nextCursor` предыдущей страницы; без него — первая страница. */
  @MaxLength(256, { message: 'Некорректный курсор' })
  @IsString()
  @IsOptional()
  cursor?: string;

  @Max(CHATS_PAGE_SIZE, { message: `limit: не больше ${CHATS_PAGE_SIZE}` })
  @Min(1, { message: 'limit: не меньше 1' })
  @IsInt({ message: 'limit: ожидается целое число' })
  @Type(() => Number)
  @IsOptional()
  limit: number = CHATS_PAGE_SIZE;

  /** Подстрока имени, @username, телефона или текста последнего сообщения. */
  @MaxLength(100, { message: 'Слишком длинный поисковый запрос' })
  @IsString()
  @Trim()
  @IsOptional()
  search?: string;

  /** Только чаты с кодом из первого сообщения или только без него. */
  @IsIn(CHAT_CODE_FILTERS, { message: 'code: ожидается with или without' })
  @IsOptional()
  code?: ChatCodeFilter;
}

export class ListMessagesQueryDto {
  /** `nextCursor` предыдущей страницы — дальше идут более старые сообщения. */
  @MaxLength(256, { message: 'Некорректный курсор' })
  @IsString()
  @IsOptional()
  cursor?: string;

  @Max(MESSAGES_PAGE_MAX, { message: `limit: не больше ${MESSAGES_PAGE_MAX}` })
  @Min(1, { message: 'limit: не меньше 1' })
  @IsInt({ message: 'limit: ожидается целое число' })
  @Type(() => Number)
  @IsOptional()
  limit: number = MESSAGES_PAGE_SIZE;
}

export class SendMessageDto {
  @MaxLength(MESSAGE_MAX_LENGTH, {
    message: `Сообщение длиннее ${MESSAGE_MAX_LENGTH} символов`,
  })
  @IsString()
  @IsNotEmpty({ message: 'Введите текст сообщения' })
  @Trim()
  text: string;
}
