import { Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { TelegramAccountsService } from '../telegram/services/telegram-accounts.service.js';
import { toChatDto } from '../telegram/telegram.types.js';
import type { ChatDto } from '../telegram/telegram.types.js';
import { AlertsService } from './services/alerts.service.js';

/** Пометка «требует внимания» на чате: увидел / снять. */
@Controller('telegram/accounts/:id/chats/:chatId/attention')
@UseGuards(JwtAuthGuard)
export class AttentionController {
  constructor(
    private readonly accounts: TelegramAccountsService,
    private readonly alerts: AlertsService,
  ) {}

  /** Менеджер открыл чат — открытые алерты считаем увиденными. */
  @Post('seen')
  @HttpCode(HttpStatus.OK)
  async seen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
  ): Promise<{ ok: true }> {
    await this.accounts.requireChat(user.id, accountId, chatId);
    await this.alerts.acknowledgeForChat(user.id, chatId);
    return { ok: true };
  }

  @Post('clear')
  @HttpCode(HttpStatus.OK)
  async clear(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
  ): Promise<ChatDto> {
    const { chat } = await this.accounts.requireChat(user.id, accountId, chatId);
    await this.alerts.resolveForChat(chat.id, user.id);
    const { chat: fresh } = await this.accounts.requireChat(user.id, accountId, chatId);
    return toChatDto(fresh);
  }
}
