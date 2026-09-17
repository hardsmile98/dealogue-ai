import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { TelegramAccountsService } from '../../telegram/services/telegram-accounts.service.js';
import { draftToExampleSchema, draftToNoteSchema, draftsQuerySchema, sendDraftSchema } from '../dto/ai-drafts.schema.js';
import { parseBody } from '../dto/parse.js';
import type { DraftDto, DraftListItemDto } from './agent.dto.js';
import { DraftsService } from './services/drafts.service.js';

/** Черновики аккаунта: очередь и решения менеджера (раздел 8.3 ТЗ). */
@Controller('telegram/accounts/:id/ai/drafts')
@UseGuards(JwtAuthGuard)
export class DraftsController {
  constructor(
    private readonly accounts: TelegramAccountsService,
    private readonly drafts: DraftsService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Query() query: Record<string, string>,
  ): Promise<DraftListItemDto[]> {
    await this.accounts.requireAccount(user.id, accountId);
    return this.drafts.listForAccount(accountId, parseBody(draftsQuerySchema, query));
  }

  @Post(':draftId/send')
  @HttpCode(HttpStatus.OK)
  async send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('draftId', ParseUUIDPipe) draftId: string,
    @Body() body: unknown,
  ): Promise<DraftDto> {
    await this.accounts.requireAccount(user.id, accountId);
    return this.drafts.send(accountId, draftId, parseBody(sendDraftSchema, body), user.id);
  }

  @Post(':draftId/dismiss')
  @HttpCode(HttpStatus.OK)
  async dismiss(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('draftId', ParseUUIDPipe) draftId: string,
  ): Promise<DraftDto> {
    await this.accounts.requireAccount(user.id, accountId);
    return this.drafts.dismiss(accountId, draftId, user.id);
  }

  @Post(':draftId/regenerate')
  @HttpCode(HttpStatus.OK)
  async regenerate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('draftId', ParseUUIDPipe) draftId: string,
  ): Promise<DraftDto> {
    await this.accounts.requireAccount(user.id, accountId);
    return this.drafts.regenerate(accountId, draftId);
  }

  @Post(':draftId/to-example')
  @HttpCode(HttpStatus.CREATED)
  async toExample(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('draftId', ParseUUIDPipe) draftId: string,
    @Body() body: unknown,
  ): Promise<{ id: string }> {
    await this.accounts.requireAccount(user.id, accountId);
    return this.drafts.toExample(accountId, draftId, parseBody(draftToExampleSchema, body));
  }

  @Post(':draftId/to-note')
  @HttpCode(HttpStatus.CREATED)
  async toNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('draftId', ParseUUIDPipe) draftId: string,
    @Body() body: unknown,
  ): Promise<{ id: string }> {
    await this.accounts.requireAccount(user.id, accountId);
    return this.drafts.toNote(accountId, draftId, parseBody(draftToNoteSchema, body));
  }
}

/** Очередь черновиков по всем аккаунтам владельца — страница «Требуют внимания». */
@Controller('drafts')
@UseGuards(JwtAuthGuard)
export class DraftsQueueController {
  constructor(private readonly drafts: DraftsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, string>): Promise<DraftListItemDto[]> {
    return this.drafts.listForUser(user.id, parseBody(draftsQuerySchema, query));
  }
}
