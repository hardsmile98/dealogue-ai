import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { SendCodeDto, SignInDto, SubmitPasswordDto } from '../dto/auth.dto.js';
import { TelegramEnabledGuard } from '../guards/telegram-enabled.guard.js';
import { TelegramAuthService } from '../services/telegram-auth.service.js';
import type {
  SendCodeResponse,
  SignInResponse,
  SubmitPasswordResponse,
} from '../telegram.types.js';

/** Подключение аккаунта: номер → код → облачный пароль, если включена 2FA. */
@Controller('telegram/accounts')
@UseGuards(JwtAuthGuard, TelegramEnabledGuard)
export class TelegramAuthController {
  constructor(private readonly auth: TelegramAuthService) {}

  @Post('send-code')
  @HttpCode(HttpStatus.OK)
  sendCode(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendCodeDto,
  ): Promise<SendCodeResponse> {
    return this.auth.sendCode(user.id, dto.phone);
  }

  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  signIn(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SignInDto,
  ): Promise<SignInResponse> {
    return this.auth.signIn(user.id, dto.attemptId, dto.code);
  }

  @Post('password')
  @HttpCode(HttpStatus.OK)
  submitPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitPasswordDto,
  ): Promise<SubmitPasswordResponse> {
    return this.auth.submitPassword(user.id, dto.attemptId, dto.password);
  }
}
