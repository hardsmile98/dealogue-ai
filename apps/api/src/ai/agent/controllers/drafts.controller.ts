import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../../../auth/auth.types.js';
import { zod } from '../../../common/pipes/zod-validation.pipe.js';
import { AccountId } from '../../../telegram/decorators/account.decorator.js';
import { AccountAccessGuard } from '../../../telegram/guards/account-access.guard.js';
import { draftToExampleSchema, draftToNoteSchema, draftsQuerySchema, sendDraftSchema } from '../dto/drafts.schema.js';
import type { DraftToExampleInput, DraftToNoteInput, DraftsQueryInput, SendDraftInput } from '../dto/drafts.schema.js';
import type { DraftDto, DraftListItemDto } from '../dto/agent.dto.js';
import { DraftsService } from '../services/drafts.service.js';

/** Черновики аккаунта: очередь и решения менеджера (раздел 8.3 ТЗ). */
@Controller('telegram/accounts/:id/ai/drafts')
@UseGuards(JwtAuthGuard, AccountAccessGuard)
export class DraftsController {
  constructor(private readonly drafts: DraftsService) {}

  @Get()
  list(@AccountId() accountId: string, @Query(zod(draftsQuerySchema)) query: DraftsQueryInput): Promise<DraftListItemDto[]> {
    return this.drafts.listForAccount(accountId, query);
  }

  @Post(':draftId/send')
  @HttpCode(HttpStatus.OK)
  send(
    @CurrentUser() user: AuthenticatedUser,
    @AccountId() accountId: string,
    @Param('draftId', ParseUUIDPipe) draftId: string,
    @Body(zod(sendDraftSchema)) body: SendDraftInput,
  ): Promise<DraftDto> {
    return this.drafts.send(accountId, draftId, body, user.id);
  }

  @Post(':draftId/dismiss')
  @HttpCode(HttpStatus.OK)
  dismiss(
    @CurrentUser() user: AuthenticatedUser,
    @AccountId() accountId: string,
    @Param('draftId', ParseUUIDPipe) draftId: string,
  ): Promise<DraftDto> {
    return this.drafts.dismiss(accountId, draftId, user.id);
  }

  @Post(':draftId/regenerate')
  @HttpCode(HttpStatus.OK)
  regenerate(@AccountId() accountId: string, @Param('draftId', ParseUUIDPipe) draftId: string): Promise<DraftDto> {
    return this.drafts.regenerate(accountId, draftId);
  }

  @Post(':draftId/to-example')
  @HttpCode(HttpStatus.CREATED)
  toExample(
    @AccountId() accountId: string,
    @Param('draftId', ParseUUIDPipe) draftId: string,
    @Body(zod(draftToExampleSchema)) body: DraftToExampleInput,
  ): Promise<{ id: string }> {
    return this.drafts.toExample(accountId, draftId, body);
  }

  @Post(':draftId/to-note')
  @HttpCode(HttpStatus.CREATED)
  toNote(
    @AccountId() accountId: string,
    @Param('draftId', ParseUUIDPipe) draftId: string,
    @Body(zod(draftToNoteSchema)) body: DraftToNoteInput,
  ): Promise<{ id: string }> {
    return this.drafts.toNote(accountId, draftId, body);
  }
}

/** Очередь черновиков по всем аккаунтам владельца — страница «Требуют внимания». */
@Controller('drafts')
@UseGuards(JwtAuthGuard)
export class DraftsQueueController {
  constructor(private readonly drafts: DraftsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zod(draftsQuerySchema)) query: DraftsQueryInput,
  ): Promise<DraftListItemDto[]> {
    return this.drafts.listForUser(user.id, query);
  }
}
