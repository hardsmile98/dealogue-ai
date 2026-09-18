import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { Chat } from '../../telegram/decorators/account.decorator.js';
import type { TelegramChatEntity } from '../../telegram/entities/telegram-chat.entity.js';
import { AccountAccessGuard } from '../../telegram/guards/account-access.guard.js';
import { toChatDto } from '../../telegram/telegram.types.js';
import type { ChatDto } from '../../telegram/telegram.types.js';
import { AlertsService } from './alerts.service.js';

/** Пометка «требует внимания» на чате: увидел / снять. */
@Controller('telegram/accounts/:id/chats/:chatId/attention')
@UseGuards(JwtAuthGuard, AccountAccessGuard)
export class AttentionController {
  constructor(private readonly alerts: AlertsService) {}

  /** Менеджер открыл чат — открытые алерты считаем увиденными. */
  @Post('seen')
  @HttpCode(HttpStatus.OK)
  async seen(@CurrentUser() user: AuthenticatedUser, @Chat() chat: TelegramChatEntity): Promise<{ ok: true }> {
    await this.alerts.acknowledgeForChat(user.id, chat.id);
    return { ok: true };
  }

  @Post('clear')
  @HttpCode(HttpStatus.OK)
  async clear(@CurrentUser() user: AuthenticatedUser, @Chat() chat: TelegramChatEntity): Promise<ChatDto> {
    const fresh = await this.alerts.resolveForChat(chat.id, user.id);
    return toChatDto(fresh ?? chat);
  }
}
