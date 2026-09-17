import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { TelegramAccountsService } from '../../telegram/services/telegram-accounts.service.js';
import { manualTurnSchema, patchChatAiSchema, rateTurnSchema, resumeChatAiSchema, turnsQuerySchema } from '../dto/ai-chat.schema.js';
import { parseBody } from '../dto/parse.js';
import type { ChatAiStateDto, TurnDto } from './agent.dto.js';
import { ChatAiService } from './services/chat-ai.service.js';

/** Состояние ИИ-агента в одном чате: режим, этап, слоты, ходы, оценки. */
@Controller('telegram/accounts/:id/chats/:chatId/ai')
@UseGuards(JwtAuthGuard)
export class ChatAiController {
  constructor(
    private readonly accounts: TelegramAccountsService,
    private readonly chatAi: ChatAiService,
  ) {}

  @Get()
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
  ): Promise<ChatAiStateDto> {
    const { chat } = await this.accounts.requireChat(user.id, accountId, chatId);
    return this.chatAi.getState(chat);
  }

  @Patch()
  async patch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Body() body: unknown,
  ): Promise<ChatAiStateDto> {
    const { chat } = await this.accounts.requireChat(user.id, accountId, chatId);
    return this.chatAi.patch(chat, parseBody(patchChatAiSchema, body), user.id);
  }

  @Post('resume')
  @HttpCode(HttpStatus.OK)
  async resume(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Body() body: unknown,
  ): Promise<ChatAiStateDto> {
    const { chat } = await this.accounts.requireChat(user.id, accountId, chatId);
    return this.chatAi.resume(chat, parseBody(resumeChatAiSchema, body), user.id);
  }

  @Post('turn')
  @HttpCode(HttpStatus.OK)
  async turn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Body() body: unknown,
  ): Promise<{ ok: true }> {
    const { chat } = await this.accounts.requireChat(user.id, accountId, chatId);
    return this.chatAi.manualTurn(chat, parseBody(manualTurnSchema, body ?? {}), user.id);
  }

  @Get('turns')
  async turns(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Query() query: Record<string, string>,
  ): Promise<TurnDto[]> {
    const { chat } = await this.accounts.requireChat(user.id, accountId, chatId);
    const parsed = parseBody(turnsQuerySchema, query);
    return this.chatAi.listTurns(chat, parsed.limit, parsed.before);
  }

  @Post('turns/:turnId/rate')
  @HttpCode(HttpStatus.OK)
  async rate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Param('turnId', ParseUUIDPipe) turnId: string,
    @Body() body: unknown,
  ): Promise<TurnDto> {
    const { chat } = await this.accounts.requireChat(user.id, accountId, chatId);
    return this.chatAi.rateTurn(chat, turnId, parseBody(rateTurnSchema, body));
  }
}
