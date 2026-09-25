import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { Account, Chat } from '../../telegram/decorators/account.decorator.js';
import type { TelegramAccountEntity } from '../../telegram/entities/telegram-account.entity.js';
import type { TelegramChatEntity } from '../../telegram/entities/telegram-chat.entity.js';
import { AccountAccessGuard } from '../../telegram/guards/account-access.guard.js';
import type {
  ChatBotStateResponse,
  ChatJournalResponse,
  SandboxSessionDto,
} from '../bot.types.js';
import { SetChatModeDto } from '../dto/chat.dto.js';
import { SandboxFromChatDto } from '../dto/sandbox.dto.js';
import { BotChatStateService } from '../services/bot-chat-state.service.js';
import { BotSandboxService } from '../services/bot-sandbox.service.js';

/** Агент в конкретном чате: состояние и переключатель режима. */
@Controller('telegram/accounts/:id/chats/:chatId/bot')
@UseGuards(JwtAuthGuard, AccountAccessGuard)
export class BotChatController {
  constructor(
    private readonly states: BotChatStateService,
    private readonly sandbox: BotSandboxService,
  ) {}

  @Get()
  get(@Chat() chat: TelegramChatEntity): Promise<ChatBotStateResponse> {
    return this.states.describe(chat);
  }

  /** Журнал агента: память, задания, ходы; null — агент этот чат не вёл. */
  @Get('journal')
  journal(@Chat() chat: TelegramChatEntity): Promise<ChatJournalResponse> {
    return this.states.journal(chat);
  }

  /** `auto` — агент ведёт (в том числе возврат от менеджера), `off` — выключен в этом чате. */
  @Put('mode')
  setMode(
    @Chat() chat: TelegramChatEntity,
    @Body() dto: SetChatModeDto,
  ): Promise<ChatBotStateResponse> {
    return this.states.setMode(chat, dto.mode);
  }

  /** «Продолжить в песочнице»: копия переписки до сообщения `messageId` (или целиком); в чат ничего не пишется. */
  @Post('sandbox')
  toSandbox(
    @Account() account: TelegramAccountEntity,
    @Chat() chat: TelegramChatEntity,
    @Body() dto: SandboxFromChatDto,
  ): Promise<SandboxSessionDto> {
    return this.sandbox.fromChat(account, chat, dto.messageId);
  }
}
