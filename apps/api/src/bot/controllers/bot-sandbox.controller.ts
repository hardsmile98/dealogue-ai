import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { Account } from '../../telegram/decorators/account.decorator.js';
import type { TelegramAccountEntity } from '../../telegram/entities/telegram-account.entity.js';
import { AccountAccessGuard } from '../../telegram/guards/account-access.guard.js';
import type { SandboxSessionDto, SandboxSummaryDto } from '../bot.types.js';
import { SetChatModeDto } from '../dto/chat.dto.js';
import { CreateSandboxDto, SandboxAdvanceDto, SandboxMessagesDto } from '../dto/sandbox.dto.js';
import { BotSandboxService } from '../services/bot-sandbox.service.js';

/**
 * Песочница агента: диалог без Telegram с виртуальными часами. Ход и
 * перемотка идут в фоне — ответ сразу, с `running: true`; веб опрашивает
 * сессию, пока ход не закончится.
 */
@Controller('telegram/accounts/:id/bot/sandbox')
@UseGuards(JwtAuthGuard, AccountAccessGuard)
export class BotSandboxController {
  constructor(private readonly sandbox: BotSandboxService) {}

  @Get()
  list(@Account() account: TelegramAccountEntity): Promise<SandboxSummaryDto[]> {
    return this.sandbox.list(account);
  }

  @Post()
  create(@Account() account: TelegramAccountEntity, @Body() dto: CreateSandboxDto): Promise<SandboxSessionDto> {
    return this.sandbox.create(account, dto.title);
  }

  @Get(':sessionId')
  get(@Account() account: TelegramAccountEntity, @Param('sessionId', ParseUUIDPipe) sessionId: string): Promise<SandboxSessionDto> {
    return this.sandbox.get(account, sessionId);
  }

  @Delete(':sessionId')
  @HttpCode(204)
  remove(@Account() account: TelegramAccountEntity, @Param('sessionId', ParseUUIDPipe) sessionId: string): Promise<void> {
    return this.sandbox.remove(account, sessionId);
  }

  /** Сообщения за клиента. */
  @Post(':sessionId/messages')
  @HttpCode(200)
  addMessages(
    @Account() account: TelegramAccountEntity,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: SandboxMessagesDto,
  ): Promise<SandboxSessionDto> {
    return this.sandbox.addMessages(account, sessionId, dto.texts);
  }

  /** Ход агента на новые сообщения клиента. */
  @Post(':sessionId/respond')
  @HttpCode(200)
  respond(@Account() account: TelegramAccountEntity, @Param('sessionId', ParseUUIDPipe) sessionId: string): Promise<SandboxSessionDto> {
    return this.sandbox.respond(account, sessionId);
  }

  /** Клиент прочитал всё отправленное. */
  @Post(':sessionId/read')
  @HttpCode(200)
  markRead(@Account() account: TelegramAccountEntity, @Param('sessionId', ParseUUIDPipe) sessionId: string): Promise<SandboxSessionDto> {
    return this.sandbox.markRead(account, sessionId);
  }

  /** Перемотка на `minutes` или до ближайшего события. */
  @Post(':sessionId/advance')
  @HttpCode(200)
  advance(
    @Account() account: TelegramAccountEntity,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: SandboxAdvanceDto,
  ): Promise<SandboxSessionDto> {
    return this.sandbox.advance(account, sessionId, dto.minutes);
  }

  /** `auto` — вернуть агенту после передачи менеджеру, `off` — выключить. */
  @Put(':sessionId/mode')
  setMode(
    @Account() account: TelegramAccountEntity,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: SetChatModeDto,
  ): Promise<SandboxSessionDto> {
    return this.sandbox.setMode(account, sessionId, dto.mode);
  }
}
