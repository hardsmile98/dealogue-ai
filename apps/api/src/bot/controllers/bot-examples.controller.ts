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
import type { ExampleDto } from '../bot.types.js';
import {
  CreateExampleDto,
  ListExamplesQueryDto,
  UpdateExampleDto,
} from '../dto/examples.dto.js';
import { BotExamplesService } from '../services/bot-examples.service.js';

/** Примеры реальных диалогов по этапам. */
@Controller('telegram/accounts/:id/bot/examples')
@UseGuards(JwtAuthGuard, AccountAccessGuard)
export class BotExamplesController {
  constructor(private readonly examples: BotExamplesService) {}

  @Get()
  list(
    @Account() account: TelegramAccountEntity,
    @Query() query: ListExamplesQueryDto,
  ): Promise<ExampleDto[]> {
    return this.examples.list(account, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Account() account: TelegramAccountEntity,
    @Body() dto: CreateExampleDto,
  ): Promise<ExampleDto> {
    return this.examples.create(account, dto);
  }

  @Put(':exampleId')
  update(
    @Account() account: TelegramAccountEntity,
    @Param('exampleId', ParseUUIDPipe) exampleId: string,
    @Body() dto: UpdateExampleDto,
  ): Promise<ExampleDto> {
    return this.examples.update(account, exampleId, dto);
  }

  @Delete(':exampleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Account() account: TelegramAccountEntity,
    @Param('exampleId', ParseUUIDPipe) exampleId: string,
  ): Promise<void> {
    return this.examples.remove(account, exampleId);
  }
}
