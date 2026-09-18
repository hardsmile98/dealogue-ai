import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../../../auth/auth.types.js';
import { zod } from '../../../common/pipes/zod-validation.pipe.js';
import { Chat } from '../../../telegram/decorators/account.decorator.js';
import type { TelegramChatEntity } from '../../../telegram/entities/telegram-chat.entity.js';
import { AccountAccessGuard } from '../../../telegram/guards/account-access.guard.js';
import { manualTurnSchema, patchChatAiSchema, rateTurnSchema, resumeChatAiSchema, turnsQuerySchema } from '../dto/chat.schema.js';
import type { ManualTurnInput, PatchChatAiInput, RateTurnInput, ResumeChatAiInput, TurnsQueryInput } from '../dto/chat.schema.js';
import type { ChatAiStateDto, TurnDto } from '../dto/agent.dto.js';
import { ChatAiService } from '../services/chat-ai.service.js';

/** Состояние ИИ-агента в одном чате: режим, этап, слоты, ходы, оценки. */
@Controller('telegram/accounts/:id/chats/:chatId/ai')
@UseGuards(JwtAuthGuard, AccountAccessGuard)
export class ChatAiController {
  constructor(private readonly chatAi: ChatAiService) {}

  @Get()
  get(@Chat() chat: TelegramChatEntity): Promise<ChatAiStateDto> {
    return this.chatAi.getState(chat);
  }

  @Patch()
  patch(
    @CurrentUser() user: AuthenticatedUser,
    @Chat() chat: TelegramChatEntity,
    @Body(zod(patchChatAiSchema)) body: PatchChatAiInput,
  ): Promise<ChatAiStateDto> {
    return this.chatAi.patch(chat, body, user.id);
  }

  @Post('resume')
  @HttpCode(HttpStatus.OK)
  resume(
    @CurrentUser() user: AuthenticatedUser,
    @Chat() chat: TelegramChatEntity,
    @Body(zod(resumeChatAiSchema)) body: ResumeChatAiInput,
  ): Promise<ChatAiStateDto> {
    return this.chatAi.resume(chat, body, user.id);
  }

  @Post('turn')
  @HttpCode(HttpStatus.OK)
  turn(
    @CurrentUser() user: AuthenticatedUser,
    @Chat() chat: TelegramChatEntity,
    @Body(zod(manualTurnSchema)) body: ManualTurnInput,
  ): Promise<{ ok: true }> {
    return this.chatAi.manualTurn(chat, body, user.id);
  }

  @Get('turns')
  turns(@Chat() chat: TelegramChatEntity, @Query(zod(turnsQuerySchema)) query: TurnsQueryInput): Promise<TurnDto[]> {
    return this.chatAi.listTurns(chat, query.limit, query.before);
  }

  @Post('turns/:turnId/rate')
  @HttpCode(HttpStatus.OK)
  rate(
    @Chat() chat: TelegramChatEntity,
    @Param('turnId', ParseUUIDPipe) turnId: string,
    @Body(zod(rateTurnSchema)) body: RateTurnInput,
  ): Promise<TurnDto> {
    return this.chatAi.rateTurn(chat, turnId, body);
  }
}
