import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import {
  SendCodeDto,
  SignInDto,
  StatsQueryDto,
  SubmitPasswordDto,
} from './dto/telegram.dto.js';
import { TelegramAccountsService } from './services/telegram-accounts.service.js';
import { TelegramAuthService } from './services/telegram-auth.service.js';
import type {
  AccountStatsDto,
  ChatDto,
  MessageDto,
  SendCodeResponse,
  SignInResponse,
  SubmitPasswordResponse,
  TelegramAccountDto,
} from './telegram.types.js';

/**
 * Контракт совпадает с apps/web/src/shared/api/contracts/telegram.ts.
 * Все аккаунты принадлежат пользователю из JWT — чужие не видны.
 */
@Controller('telegram/accounts')
@UseGuards(JwtAuthGuard)
export class TelegramController {
  constructor(
    private readonly accounts: TelegramAccountsService,
    private readonly auth: TelegramAuthService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<TelegramAccountDto[]> {
    return this.accounts.list(user.id);
  }

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

  @Get(':id')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TelegramAccountDto> {
    return this.accounts.get(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.accounts.remove(user.id, id);
  }

  @Get(':id/stats')
  stats(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: StatsQueryDto,
  ): Promise<AccountStatsDto> {
    return this.accounts.stats(user.id, id, query.from, query.to, query.tz);
  }

  @Get(':id/chats')
  chats(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ChatDto[]> {
    return this.accounts.listChats(user.id, id);
  }

  @Get(':id/chats/:chatId/messages')
  messages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
  ): Promise<MessageDto[]> {
    return this.accounts.listMessages(user.id, id, chatId);
  }
}
