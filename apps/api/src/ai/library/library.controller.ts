import {
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
import { zod } from '../../common/pipes/zod-validation.pipe.js';
import { AccountId } from '../../telegram/decorators/account.decorator.js';
import { AccountAccessGuard } from '../../telegram/guards/account-access.guard.js';
import { TelegramAccountsService } from '../../telegram/services/telegram-accounts.service.js';
import type { FunnelStage } from '../domain/types.js';
import type { AiDiagnosticEntity } from '../entities/ai-diagnostic.entity.js';
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
  resetPlaybooksSchema,
  seedLibrarySchema,
  stageParamSchema,
  updateCategorySchema,
  updateDiagnosticSchema,
  updateFactSchema,
  updateNoteSchema,
  updatePhraseSchema,
  updatePlaybookSchema,
} from './library.schema.js';
import type {
  CategoryInput,
  CopyLibraryInput,
  DiagnosticInput,
  DiagnosticsQuery,
  FactInput,
  NoteInput,
  PhraseInput,
  PhrasesQuery,
  PreviewSplitInput,
  ResetPlaybooksInput,
  SeedLibraryInput,
  UpdateCategoryInput,
  UpdateDiagnosticInput,
  UpdateFactInput,
  UpdateNoteInput,
  UpdatePhraseInput,
  UpdatePlaybookInput,
} from './library.schema.js';
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

/**
 * Библиотека ИИ-агента одного аккаунта (раздел 11 ТЗ). Владение аккаунтом
 * проверяет AccountAccessGuard, тела и строки запроса — zod-пайпы; методу
 * остаётся только вызов сервиса и перевод строки в DTO.
 */
@Controller('telegram/accounts/:id/ai')
@UseGuards(JwtAuthGuard, AccountAccessGuard)
export class AiLibraryController {
  constructor(
    private readonly accounts: TelegramAccountsService,
    private readonly library: AiLibraryService,
  ) {}

  // --- категории ------------------------------------------------------------

  @Get('categories')
  async listCategories(@AccountId() accountId: string): Promise<CategoryDto[]> {
    return (await this.library.listCategories(accountId)).map(toCategoryDto);
  }

  @Post('categories')
  async createCategory(
    @AccountId() accountId: string,
    @Body(zod(categorySchema)) body: CategoryInput,
  ): Promise<CategoryDto> {
    return toCategoryDto(await this.library.createCategory(accountId, body));
  }

  @Put('categories/:itemId')
  async updateCategory(
    @AccountId() accountId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body(zod(updateCategorySchema)) body: UpdateCategoryInput,
  ): Promise<CategoryDto> {
    return toCategoryDto(await this.library.updateCategory(accountId, itemId, body));
  }

  @Delete('categories/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCategory(@AccountId() accountId: string, @Param('itemId', ParseUUIDPipe) itemId: string): Promise<void> {
    return this.library.deleteCategory(accountId, itemId);
  }

  // --- фразы ------------------------------------------------------------------

  @Get('phrases')
  async listPhrases(
    @AccountId() accountId: string,
    @Query(zod(phrasesQuerySchema)) query: PhrasesQuery,
  ): Promise<PhraseDto[]> {
    return (await this.library.listPhrases(accountId, query)).map(toPhraseDto);
  }

  @Post('phrases')
  async createPhrase(
    @AccountId() accountId: string,
    @Body(zod(phraseSchema)) body: PhraseInput,
  ): Promise<PhraseDto> {
    return toPhraseDto(await this.library.createPhrase(accountId, body));
  }

  @Put('phrases/:itemId')
  async updatePhrase(
    @AccountId() accountId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body(zod(updatePhraseSchema)) body: UpdatePhraseInput,
  ): Promise<PhraseDto> {
    return toPhraseDto(await this.library.updatePhrase(accountId, itemId, body));
  }

  @Delete('phrases/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePhrase(@AccountId() accountId: string, @Param('itemId', ParseUUIDPipe) itemId: string): Promise<void> {
    return this.library.deletePhrase(accountId, itemId);
  }

  // --- факты ------------------------------------------------------------------

  @Get('facts')
  async listFacts(@AccountId() accountId: string): Promise<FactDto[]> {
    return (await this.library.listFacts(accountId)).map(toFactDto);
  }

  @Post('facts')
  async createFact(@AccountId() accountId: string, @Body(zod(factSchema)) body: FactInput): Promise<FactDto> {
    return toFactDto(await this.library.createFact(accountId, body));
  }

  @Put('facts/:itemId')
  async updateFact(
    @AccountId() accountId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body(zod(updateFactSchema)) body: UpdateFactInput,
  ): Promise<FactDto> {
    return toFactDto(await this.library.updateFact(accountId, itemId, body));
  }

  @Delete('facts/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteFact(@AccountId() accountId: string, @Param('itemId', ParseUUIDPipe) itemId: string): Promise<void> {
    return this.library.deleteFact(accountId, itemId);
  }

  // --- диагностики --------------------------------------------------------------

  @Get('diagnostics')
  async listDiagnostics(
    @AccountId() accountId: string,
    @Query(zod(diagnosticsQuerySchema)) query: DiagnosticsQuery,
  ): Promise<DiagnosticDto[]> {
    const rows = await this.library.listDiagnostics(accountId, query);
    return rows.map(withMessageCount);
  }

  @Post('diagnostics')
  async createDiagnostic(
    @AccountId() accountId: string,
    @Body(zod(diagnosticSchema)) body: DiagnosticInput,
  ): Promise<DiagnosticDto> {
    return withMessageCount(await this.library.createDiagnostic(accountId, body));
  }

  @Put('diagnostics/:itemId')
  async updateDiagnostic(
    @AccountId() accountId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body(zod(updateDiagnosticSchema)) body: UpdateDiagnosticInput,
  ): Promise<DiagnosticDto> {
    return withMessageCount(await this.library.updateDiagnostic(accountId, itemId, body));
  }

  @Delete('diagnostics/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteDiagnostic(@AccountId() accountId: string, @Param('itemId', ParseUUIDPipe) itemId: string): Promise<void> {
    return this.library.deleteDiagnostic(accountId, itemId);
  }

  // --- плейбуки -----------------------------------------------------------------

  @Get('playbooks')
  async listPlaybooks(@AccountId() accountId: string): Promise<PlaybookDto[]> {
    return (await this.library.listPlaybooks(accountId)).map(toPlaybookDto);
  }

  @Put('playbooks/:stage')
  async updatePlaybook(
    @AccountId() accountId: string,
    @Param('stage', zod(stageParamSchema)) stage: FunnelStage,
    @Body(zod(updatePlaybookSchema)) body: UpdatePlaybookInput,
  ): Promise<PlaybookDto> {
    return toPlaybookDto(await this.library.updatePlaybook(accountId, stage, body));
  }

  @Post('playbooks/reset')
  @HttpCode(HttpStatus.OK)
  async resetPlaybooks(
    @AccountId() accountId: string,
    @Body(zod(resetPlaybooksSchema)) body: ResetPlaybooksInput,
  ): Promise<PlaybookDto[]> {
    return (await this.library.resetPlaybooks(accountId, body.stage)).map(toPlaybookDto);
  }

  // --- заметки -------------------------------------------------------------------

  @Get('notes')
  async listNotes(@AccountId() accountId: string): Promise<NoteDto[]> {
    return (await this.library.listNotes(accountId)).map(toNoteDto);
  }

  @Post('notes')
  async createNote(@AccountId() accountId: string, @Body(zod(noteSchema)) body: NoteInput): Promise<NoteDto> {
    return toNoteDto(await this.library.createNote(accountId, body));
  }

  @Put('notes/:itemId')
  async updateNote(
    @AccountId() accountId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body(zod(updateNoteSchema)) body: UpdateNoteInput,
  ): Promise<NoteDto> {
    return toNoteDto(await this.library.updateNote(accountId, itemId, body));
  }

  @Delete('notes/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteNote(@AccountId() accountId: string, @Param('itemId', ParseUUIDPipe) itemId: string): Promise<void> {
    return this.library.deleteNote(accountId, itemId);
  }

  // --- обзор, сид, копирование, разбиение -------------------------------------------

  @Get('library/overview')
  overview(@AccountId() accountId: string): Promise<LibraryOverviewDto> {
    return this.library.overview(accountId);
  }

  @Post('library/seed')
  @HttpCode(HttpStatus.OK)
  seed(
    @AccountId() accountId: string,
    @Body(zod(seedLibrarySchema)) body: SeedLibraryInput,
  ): Promise<SeedResultDto> {
    return this.library.seed(accountId, body.mode);
  }

  /** Аккаунт-источник в пути не `:id`, поэтому его владельца проверяем здесь. */
  @Post('library/copy-from/:sourceAccountId')
  @HttpCode(HttpStatus.OK)
  async copyFrom(
    @CurrentUser() user: AuthenticatedUser,
    @AccountId() accountId: string,
    @Param('sourceAccountId', ParseUUIDPipe) sourceAccountId: string,
    @Body(zod(copyLibrarySchema)) body: CopyLibraryInput,
  ): Promise<SeedResultDto> {
    await this.accounts.requireAccount(user.id, sourceAccountId);
    return this.library.copyFrom(accountId, sourceAccountId, body);
  }

  @Post('library/preview-split')
  @HttpCode(HttpStatus.OK)
  previewSplit(
    @Body(zod(previewSplitSchema)) body: PreviewSplitInput,
  ): { messages: string[]; lengths: number[] } {
    return this.library.previewSplit(body.text);
  }
}

/** В карточке диагностики веб показывает, на сколько сообщений её разрежет. */
function withMessageCount(row: AiDiagnosticEntity): DiagnosticDto {
  return toDiagnosticDto(row, splitIntoMessages(row.text).length);
}
