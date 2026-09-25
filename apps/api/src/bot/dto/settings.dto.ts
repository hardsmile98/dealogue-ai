import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';
import { GENDERS } from '../library/kinds.js';
import type { Gender } from '../library/kinds.js';

export class PersonaLinkDto {
  @MaxLength(64, { message: 'Подпись ссылки длиннее 64 символов' })
  @IsString()
  @IsNotEmpty({ message: 'Введите подпись ссылки' })
  @Trim()
  title: string;

  @MaxLength(512, { message: 'Слишком длинный адрес' })
  @IsUrl({ require_protocol: true }, { message: 'Адрес должен начинаться с http:// или https://' })
  @Trim()
  url: string;
}

/** Образ практика; все поля необязательны — меняется только присланное. */
export class PersonaDto {
  @MaxLength(128, { message: 'Имя длиннее 128 символов' })
  @IsString()
  @IsNotEmpty({ message: 'Введите имя' })
  @Trim()
  @IsOptional()
  name?: string;

  @IsIn(GENDERS, { message: 'gender: ожидается f или m' })
  @IsOptional()
  gender?: Gender;

  @MaxLength(2000, { message: 'Биография длиннее 2000 символов' })
  @IsString()
  @Trim()
  @IsOptional()
  bio?: string;

  @ArrayMaxSize(10, { message: 'Не больше 10 ссылок' })
  @ValidateNested({ each: true })
  @Type(() => PersonaLinkDto)
  @IsArray()
  @IsOptional()
  links?: PersonaLinkDto[];
}

export class RangeDto {
  @Min(0, { message: 'min: не меньше 0' })
  @IsInt({ message: 'min: ожидается целое число' })
  min: number;

  @Min(0, { message: 'max: не меньше 0' })
  @IsInt({ message: 'max: ожидается целое число' })
  max: number;
}

const RANGE = () => RangeDto;

/**
 * Тайминги, все поля необязательны. Смысл полей — library/timings.ts;
 * согласованность (min ≤ max и т. п.) проверяет validateTimings в сервисе.
 */
export class TimingsDto {
  @ValidateNested() @Type(RANGE) @IsOptional() quietWindowSec?: RangeDto;
  @Min(0) @IsInt() @IsOptional() typingExtendSec?: number;
  @Min(0) @IsInt() @IsOptional() quietMaxSec?: number;
  @ValidateNested() @Type(RANGE) @IsOptional() newLeadReplySec?: RangeDto;
  @ValidateNested() @Type(RANGE) @IsOptional() inChatReplySec?: RangeDto;
  @Min(0) @IsInt() @IsOptional() inChatWindowMin?: number;
  @ValidateNested() @Type(RANGE) @IsOptional() recentReplyMin?: RangeDto;
  @Min(0) @IsInt() @IsOptional() recentWindowMin?: number;
  @ValidateNested() @Type(RANGE) @IsOptional() awayReplyMin?: RangeDto;
  @Min(0) @IsInt() @IsOptional() typingCharsPerSec?: number;
  @Min(0) @IsInt() @IsOptional() typingMaxSec?: number;
  @ValidateNested() @Type(RANGE) @IsOptional() blockTypingSec?: RangeDto;
  @ValidateNested() @Type(RANGE) @IsOptional() partPauseSec?: RangeDto;
  @ValidateNested() @Type(RANGE) @IsOptional() diagnosticDelayMin?: RangeDto;
  @ValidateNested() @Type(RANGE) @IsOptional() birthDataReminderMin?: RangeDto;
  @ValidateNested() @Type(RANGE) @IsOptional() returnQuestionMin?: RangeDto;
  @ValidateNested() @Type(RANGE) @IsOptional() stepHours?: RangeDto;
  @Min(0) @IsInt() @IsOptional() unreadReminderHours?: number;
  @Min(0) @IsInt() @IsOptional() maxReminders?: number;
  @Min(0) @IsInt() @IsOptional() maxTurnsWithoutNudge?: number;
}

export class UpdateBotSettingsDto {
  @ValidateNested()
  @Type(() => PersonaDto)
  @IsOptional()
  persona?: PersonaDto;

  @ValidateNested()
  @Type(() => TimingsDto)
  @IsOptional()
  timings?: TimingsDto;

  @MaxLength(64, { message: 'Название модели длиннее 64 символов' })
  @IsString()
  @IsNotEmpty({ message: 'Укажите модель' })
  @Trim()
  @IsOptional()
  model?: string;
}

export class SetBotEnabledDto {
  @IsBoolean({ message: 'enabled: ожидается true или false' })
  enabled: boolean;
}
