import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class SendCodeDto {
  @MaxLength(32, { message: 'Номер слишком длинный' })
  @IsString()
  @IsNotEmpty({ message: 'Введите номер телефона' })
  phone: string;
}

export class SignInDto {
  @IsString()
  @IsNotEmpty({ message: 'Не передан идентификатор попытки входа' })
  attemptId: string;

  @Matches(/^\d{4,8}$/, { message: 'Код — это 5 цифр из сообщения Telegram' })
  @IsString()
  @IsNotEmpty({ message: 'Введите код' })
  code: string;
}

export class SubmitPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Не передан идентификатор попытки входа' })
  attemptId: string;

  @MaxLength(256)
  @IsString()
  @IsNotEmpty({ message: 'Введите облачный пароль' })
  password: string;
}

export class StatsQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from: ожидается YYYY-MM-DD' })
  @IsString()
  from: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to: ожидается YYYY-MM-DD' })
  @IsString()
  to: string;

  /** IANA-зона, в которой считать «день» (по умолчанию TELEGRAM_TIMEZONE). */
  @MaxLength(64)
  @IsString()
  @IsOptional()
  tz?: string;
}
