import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { TelegramAccountsService } from '../../telegram/services/telegram-accounts.service.js';
import { FUNNEL_STAGES } from '../domain/types.js';
import type { FunnelStage } from '../domain/types.js';
import {
  categorySchema,
  copyLibrarySchema,
  diagnosticSchema,
  diagnosticsQuerySchema,
  factSchema,
  noteSchema,
  phraseSchema,
  phrasesQuerySchema,
  previewSplitSchema,
  seedLibrarySchema,
  updateCategorySchema,
  updateDiagnosticSchema,
  updateFactSchema,
  updateNoteSchema,
  updatePhraseSchema,
  updatePlaybookSchema,
} from '../dto/ai-library.schema.js';
import { parseBody } from '../dto/parse.js';
import { splitIntoMessages } from './lib/split-messages.js';
import { AiLibraryService } from './library.service.js';
import {
  toCategoryDto,
  toDiagnosticDto,
  toFactDto,
  toNoteDto,
  toPhraseDto,
  toPlaybookDto,
} from './library.types.js';
import type {
  CategoryDto,
  DiagnosticDto,
  FactDto,
  LibraryOverviewDto,
  NoteDto,
  PhraseDto,
  PlaybookDto,
  SeedResultDto,
} from './library.types.js';

/** Библиотека ИИ-агента одного аккаунта (раздел 11 ТЗ). */
@Controller('telegram/accounts/:id/ai')
@UseGuards(JwtAuthGuard)
export class AiLibraryController {
  constructor(
    private readonly accounts: TelegramAccountsService,
    private readonly library: AiLibraryService,
  ) {}

  // --- категории ------------------------------------------------------------

  @Get('categories')
  async listCategories(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) accountId: string): Promise<CategoryDto[]> {
    await this.accounts.requireAccount(user.id, accountId);
    return (await this.library.listCategories(accountId)).map(toCategoryDto);
  }

  @Post('categories')
  async createCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Body() body: unknown,
  ): Promise<CategoryDto> {
    await this.accounts.requireAccount(user.id, accountId);
    return toCategoryDto(await this.library.createCategory(accountId, parseBody(categorySchema, body)));
  }

  @Put('categories/:itemId')
  async updateCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: unknown,
  ): Promise<CategoryDto> {
    await this.accounts.requireAccount(user.id, accountId);
    return toCategoryDto(await this.library.updateCategory(accountId, itemId, parseBody(updateCategorySchema, body)));
  }

  @Delete('categories/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<void> {
    await this.accounts.requireAccount(user.id, accountId);
    await this.library.deleteCategory(accountId, itemId);
  }

  // --- фразы ------------------------------------------------------------------

  @Get('phrases')
  async listPhrases(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Query() query: Record<string, string>,
  ): Promise<PhraseDto[]> {
    await this.accounts.requireAccount(user.id, accountId);
    return (await this.library.listPhrases(accountId, parseBody(phrasesQuerySchema, query))).map(toPhraseDto);
  }

  @Post('phrases')
  async createPhrase(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Body() body: unknown,
  ): Promise<PhraseDto> {
    await this.accounts.requireAccount(user.id, accountId);
    return toPhraseDto(await this.library.createPhrase(accountId, parseBody(phraseSchema, body)));
  }

  @Put('phrases/:itemId')
  async updatePhrase(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: unknown,
  ): Promise<PhraseDto> {
    await this.accounts.requireAccount(user.id, accountId);
    return toPhraseDto(await this.library.updatePhrase(accountId, itemId, parseBody(updatePhraseSchema, body)));
  }

  @Delete('phrases/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePhrase(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<void> {
    await this.accounts.requireAccount(user.id, accountId);
    await this.library.deletePhrase(accountId, itemId);
  }

  // --- факты ------------------------------------------------------------------

  @Get('facts')
  async listFacts(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) accountId: string): Promise<FactDto[]> {
    await this.accounts.requireAccount(user.id, accountId);
    return (await this.library.listFacts(accountId)).map(toFactDto);
  }

  @Post('facts')
  async createFact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Body() body: unknown,
  ): Promise<FactDto> {
    await this.accounts.requireAccount(user.id, accountId);
    return toFactDto(await this.library.createFact(accountId, parseBody(factSchema, body)));
  }

  @Put('facts/:itemId')
  async updateFact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: unknown,
  ): Promise<FactDto> {
    await this.accounts.requireAccount(user.id, accountId);
    return toFactDto(await this.library.updateFact(accountId, itemId, parseBody(updateFactSchema, body)));
  }

  @Delete('facts/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteFact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<void> {
    await this.accounts.requireAccount(user.id, accountId);
    await this.library.deleteFact(accountId, itemId);
  }

  // --- диагностики --------------------------------------------------------------

  @Get('diagnostics')
  async listDiagnostics(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Query() query: Record<string, string>,
  ): Promise<DiagnosticDto[]> {
    await this.accounts.requireAccount(user.id, accountId);
    const rows = await this.library.listDiagnostics(accountId, parseBody(diagnosticsQuerySchema, query));
    return rows.map((row) => toDiagnosticDto(row, splitIntoMessages(row.text).length));
  }

  @Post('diagnostics')
  async createDiagnostic(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Body() body: unknown,
  ): Promise<DiagnosticDto> {
    await this.accounts.requireAccount(user.id, accountId);
    const row = await this.library.createDiagnostic(accountId, parseBody(diagnosticSchema, body));
    return toDiagnosticDto(row, splitIntoMessages(row.text).length);
  }

  @Put('diagnostics/:itemId')
  async updateDiagnostic(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: unknown,
  ): Promise<DiagnosticDto> {
    await this.accounts.requireAccount(user.id, accountId);
    const row = await this.library.updateDiagnostic(accountId, itemId, parseBody(updateDiagnosticSchema, body));
    return toDiagnosticDto(row, splitIntoMessages(row.text).length);
  }

  @Delete('diagnostics/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDiagnostic(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<void> {
    await this.accounts.requireAccount(user.id, accountId);
    await this.library.deleteDiagnostic(accountId, itemId);
  }

  // --- плейбуки -----------------------------------------------------------------

  @Get('playbooks')
  async listPlaybooks(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) accountId: string): Promise<PlaybookDto[]> {
    await this.accounts.requireAccount(user.id, accountId);
    return (await this.library.listPlaybooks(accountId)).map(toPlaybookDto);
  }

  @Put('playbooks/:stage')
  async updatePlaybook(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('stage') stage: string,
    @Body() body: unknown,
  ): Promise<PlaybookDto> {
    await this.accounts.requireAccount(user.id, accountId);
    return toPlaybookDto(await this.library.updatePlaybook(accountId, requireStage(stage), parseBody(updatePlaybookSchema, body)));
  }

  @Post('playbooks/reset')
  @HttpCode(HttpStatus.OK)
  async resetPlaybooks(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Body() body: { stage?: string } | undefined,
  ): Promise<PlaybookDto[]> {
    await this.accounts.requireAccount(user.id, accountId);
    const stage = body?.stage ? requireStage(body.stage) : undefined;
    return (await this.library.resetPlaybooks(accountId, stage)).map(toPlaybookDto);
  }

  // --- заметки -------------------------------------------------------------------

  @Get('notes')
  async listNotes(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) accountId: string): Promise<NoteDto[]> {
    await this.accounts.requireAccount(user.id, accountId);
    return (await this.library.listNotes(accountId)).map(toNoteDto);
  }

  @Post('notes')
  async createNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Body() body: unknown,
  ): Promise<NoteDto> {
    await this.accounts.requireAccount(user.id, accountId);
    return toNoteDto(await this.library.createNote(accountId, parseBody(noteSchema, body)));
  }

  @Put('notes/:itemId')
  async updateNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: unknown,
  ): Promise<NoteDto> {
    await this.accounts.requireAccount(user.id, accountId);
    return toNoteDto(await this.library.updateNote(accountId, itemId, parseBody(updateNoteSchema, body)));
  }

  @Delete('notes/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<void> {
    await this.accounts.requireAccount(user.id, accountId);
    await this.library.deleteNote(accountId, itemId);
  }

  // --- обзор, сид, копирование, разбиение -------------------------------------------

  @Get('library/overview')
  async overview(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) accountId: string): Promise<LibraryOverviewDto> {
    await this.accounts.requireAccount(user.id, accountId);
    return this.library.overview(accountId);
  }

  @Post('library/seed')
  @HttpCode(HttpStatus.OK)
  async seed(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Body() body: unknown,
  ): Promise<SeedResultDto> {
    await this.accounts.requireAccount(user.id, accountId);
    return this.library.seed(accountId, parseBody(seedLibrarySchema, body ?? {}).mode);
  }

  @Post('library/copy-from/:sourceAccountId')
  @HttpCode(HttpStatus.OK)
  async copyFrom(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('sourceAccountId', ParseUUIDPipe) sourceAccountId: string,
    @Body() body: unknown,
  ): Promise<SeedResultDto> {
    await this.accounts.requireAccount(user.id, accountId);
    await this.accounts.requireAccount(user.id, sourceAccountId);
    return this.library.copyFrom(accountId, sourceAccountId, parseBody(copyLibrarySchema, body ?? {}));
  }

  @Post('library/preview-split')
  @HttpCode(HttpStatus.OK)
  async previewSplit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Body() body: unknown,
  ): Promise<{ messages: string[]; lengths: number[] }> {
    await this.accounts.requireAccount(user.id, accountId);
    return this.library.previewSplit(parseBody(previewSplitSchema, body).text);
  }
}

function requireStage(value: string): FunnelStage {
  if (!FUNNEL_STAGES.includes(value as FunnelStage)) throw new BadRequestException(`Неизвестный этап: ${value}`);
  return value as FunnelStage;
}
