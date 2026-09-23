import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { Account, Chat } from '../decorators/account.decorator.js';
import {
  ListChatsQueryDto,
  ListMessagesQueryDto,
  SendMessageDto,
} from '../dto/chats.dto.js';
import type { TelegramAccountEntity } from '../entities/telegram-account.entity.js';
import type { TelegramChatEntity } from '../entities/telegram-chat.entity.js';
import { AccountAccessGuard } from '../guards/account-access.guard.js';
import { TelegramEnabledGuard } from '../guards/telegram-enabled.guard.js';
import { TelegramChatsService } from '../services/telegram-chats.service.js';
import { toChatDto } from '../telegram.types.js';
import type {
  ChatDto,
  ChatsPageDto,
  MessageDto,
  MessagesPageDto,
} from '../telegram.types.js';

/** Диалоги одного аккаунта; владение аккаунтом и чатом проверяет AccountAccessGuard. */
@Controller('telegram/accounts/:id/chats')
@UseGuards(JwtAuthGuard, TelegramEnabledGuard, AccountAccessGuard)
export class TelegramChatsController {
  constructor(private readonly chats: TelegramChatsService) {}

  /** Страница списка; следующая — с `cursor` из `nextCursor`. */
  @Get()
  list(
    @Account() account: TelegramAccountEntity,
    @Query() query: ListChatsQueryDto,
  ): Promise<ChatsPageDto> {
    return this.chats.listPage(account, query);
  }

  /** Один чат — для прямой ссылки, когда его нет среди загруженных страниц. */
  @Get(':chatId')
  get(@Chat() chat: TelegramChatEntity): ChatDto {
    return toChatDto(chat);
  }

  /** Страница переписки: сначала свежие, по `nextCursor` — более старые. */
  @Get(':chatId/messages')
  messages(
    @Chat() chat: TelegramChatEntity,
    @Query() query: ListMessagesQueryDto,
  ): Promise<MessagesPageDto> {
    return this.chats.listMessages(chat, query);
  }

  /** Сообщение клиенту от менеджера из веб-интерфейса. */
  @Post(':chatId/messages')
  @HttpCode(HttpStatus.CREATED)
  send(
    @Account() account: TelegramAccountEntity,
    @Chat() chat: TelegramChatEntity,
    @Body() dto: SendMessageDto,
  ): Promise<MessageDto> {
    return this.chats.sendMessage(account, chat, dto.text);
  }
}
