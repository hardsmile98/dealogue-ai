import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Порядок декораторов важен: class-validator обходит их снизу вверх,
 * а ValidationPipe включён с stopAtFirstError — до клиента доедет сообщение
 * самого нижнего сработавшего правила. Поэтому «Введите …» стоит последним.
 */
export class LoginDto {
  @MaxLength(64, { message: 'Логин не длиннее 64 символов' })
  @IsString()
  @IsNotEmpty({ message: 'Введите логин' })
  login: string;

  @MaxLength(128, { message: 'Пароль не длиннее 128 символов' })
  @IsString()
  @IsNotEmpty({ message: 'Введите пароль' })
  password: string;
}
