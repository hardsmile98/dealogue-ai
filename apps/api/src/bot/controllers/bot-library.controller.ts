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
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { Account } from '../../telegram/decorators/account.decorator.js';
import type { TelegramAccountEntity } from '../../telegram/entities/telegram-account.entity.js';
import { AccountAccessGuard } from '../../telegram/guards/account-access.guard.js';
import type { LibraryImportResultDto, LibraryItemDto } from '../bot.types.js';
import {
  CreateLibraryItemDto,
  ImportLibraryDto,
  ListLibraryQueryDto,
  UpdateLibraryItemDto,
} from '../dto/library.dto.js';
import { BotLibraryService } from '../services/bot-library.service.js';

/** Библиотека аккаунта: фразы, тела вех, плейбук возражений, раздел «о себе». */
@Controller('telegram/accounts/:id/bot/library')
@UseGuards(JwtAuthGuard, AccountAccessGuard)
export class BotLibraryController {
  constructor(private readonly library: BotLibraryService) {}

  @Get()
  list(
    @Account() account: TelegramAccountEntity,
    @Query() query: ListLibraryQueryDto,
  ): Promise<LibraryItemDto[]> {
    return this.library.list(account, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Account() account: TelegramAccountEntity,
    @Body() dto: CreateLibraryItemDto,
  ): Promise<LibraryItemDto> {
    return this.library.create(account, dto);
  }

  /** Стандартная библиотека из таблиц; повторный вызов безопасен. */
  @Post('import')
  importDefaults(
    @Account() account: TelegramAccountEntity,
    @Body() dto: ImportLibraryDto,
  ): Promise<LibraryImportResultDto> {
    return this.library.importDefaults(account, dto.mode);
  }

  @Put(':itemId')
  update(
    @Account() account: TelegramAccountEntity,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateLibraryItemDto,
  ): Promise<LibraryItemDto> {
    return this.library.update(account, itemId, dto);
  }

  @Delete(':itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Account() account: TelegramAccountEntity,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<void> {
    return this.library.remove(account, itemId);
  }
}
