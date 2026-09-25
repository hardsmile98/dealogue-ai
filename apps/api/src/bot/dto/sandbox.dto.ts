import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';

const MESSAGE_MAX = 4000;

export class CreateSandboxDto {
  @MaxLength(200, { message: 'Название длиннее 200 символов' })
  @IsString()
  @IsOptional()
  @Trim()
  title?: string;
}

/** Сообщения за клиента: одна отправка — одно или несколько сообщений подряд. */
export class SandboxMessagesDto {
  @MaxLength(MESSAGE_MAX, {
    each: true,
    message: `Сообщение длиннее ${MESSAGE_MAX} символов`,
  })
  @IsNotEmpty({ each: true, message: 'Пустое сообщение' })
  @IsString({ each: true })
  @ArrayMaxSize(20, { message: 'Не больше 20 сообщений за раз' })
  @ArrayMinSize(1, { message: 'Нужно хотя бы одно сообщение' })
  @IsArray()
  texts: string[];
}

/** Перемотка: на `minutes` вперёд или, без него, до ближайшего запланированного события. */
export class SandboxAdvanceDto {
  @Max(60 * 24 * 7, { message: 'Не больше недели за раз' })
  @Min(1, { message: 'Хотя бы на минуту' })
  @IsInt({ message: 'minutes: целое число минут' })
  @IsOptional()
  minutes?: number;
}

/** Копия реального чата: до сообщения `messageId` (telegram_message_id) включительно или целиком. */
export class SandboxFromChatDto {
  @IsInt({ message: 'messageId: номер сообщения' })
  @IsOptional()
  messageId?: number;
}
