import { IsNotEmpty, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';

// Правила срабатывают снизу вверх, а наружу уходит первая ошибка
// (stopAtFirstError), поэтому «Введите …» стоит последним.

// attemptId уходит в запрос по uuid-колонке: не-uuid без проверки дал бы
// ошибку Postgres и ответ 500 вместо 400.
const ATTEMPT_ID_INVALID = 'Некорректный идентификатор попытки входа';

export class SendCodeDto {
  @MaxLength(32, { message: 'Номер слишком длинный' })
  @IsString()
  @IsNotEmpty({ message: 'Введите номер телефона' })
  @Trim()
  phone: string;
}

export class SignInDto {
  @IsUUID('all', { message: ATTEMPT_ID_INVALID })
  @IsString()
  @IsNotEmpty({ message: 'Не передан идентификатор попытки входа' })
  attemptId: string;

  @Matches(/^\d{4,8}$/, { message: 'Код — это 5 цифр из сообщения Telegram' })
  @IsString()
  @IsNotEmpty({ message: 'Введите код' })
  @Trim()
  code: string;
}

export class SubmitPasswordDto {
  @IsUUID('all', { message: ATTEMPT_ID_INVALID })
  @IsString()
  @IsNotEmpty({ message: 'Не передан идентификатор попытки входа' })
  attemptId: string;

  @MaxLength(256)
  @IsString()
  @IsNotEmpty({ message: 'Введите облачный пароль' })
  password: string;
}
