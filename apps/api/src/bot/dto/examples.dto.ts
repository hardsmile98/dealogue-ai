import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';
import { STAGES } from '../library/kinds.js';
import type { Stage } from '../library/kinds.js';

const TEXT_MAX = 4000;

export class ListExamplesQueryDto {
  @IsIn(STAGES, { message: 'stage: неизвестный этап' })
  @IsOptional()
  stage?: Stage;
}

export class CreateExampleDto {
  @IsIn(STAGES, { message: 'stage: неизвестный этап' })
  stage: Stage;

  @MaxLength(500, { message: 'Описание ситуации длиннее 500 символов' })
  @IsString()
  @IsNotEmpty({ message: 'Опишите ситуацию' })
  @Trim()
  situation: string;

  @MaxLength(TEXT_MAX, {
    message: `Сообщения клиента длиннее ${TEXT_MAX} символов`,
  })
  @IsString()
  @IsNotEmpty({ message: 'Введите сообщения клиента' })
  @Trim()
  client: string;

  @MaxLength(TEXT_MAX, {
    message: `Ответ практика длиннее ${TEXT_MAX} символов`,
  })
  @IsString()
  @IsNotEmpty({ message: 'Введите ответ практика' })
  @Trim()
  practitioner: string;

  @IsBoolean({ message: 'enabled: ожидается true или false' })
  @IsOptional()
  enabled?: boolean;

  @IsInt({ message: 'sort: ожидается целое число' })
  @IsOptional()
  sort?: number;
}

export class UpdateExampleDto {
  @IsIn(STAGES, { message: 'stage: неизвестный этап' })
  @IsOptional()
  stage?: Stage;

  @MaxLength(500, { message: 'Описание ситуации длиннее 500 символов' })
  @IsString()
  @IsNotEmpty({ message: 'Опишите ситуацию' })
  @Trim()
  @IsOptional()
  situation?: string;

  @MaxLength(TEXT_MAX, {
    message: `Сообщения клиента длиннее ${TEXT_MAX} символов`,
  })
  @IsString()
  @IsNotEmpty({ message: 'Введите сообщения клиента' })
  @Trim()
  @IsOptional()
  client?: string;

  @MaxLength(TEXT_MAX, {
    message: `Ответ практика длиннее ${TEXT_MAX} символов`,
  })
  @IsString()
  @IsNotEmpty({ message: 'Введите ответ практика' })
  @Trim()
  @IsOptional()
  practitioner?: string;

  @IsBoolean({ message: 'enabled: ожидается true или false' })
  @IsOptional()
  enabled?: boolean;

  @IsInt({ message: 'sort: ожидается целое число' })
  @IsOptional()
  sort?: number;
}
