import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { TelegramAccountsService } from '../../telegram/services/telegram-accounts.service.js';
import { statsQuerySchema } from '../dto/ai-stats.schema.js';
import { parseBody } from '../dto/parse.js';
import { StatsService } from './stats/stats.service.js';
import type { DraftStatsDto, FunnelStatsDto, LibraryStatsDto, StatsRange, TurnStatsDto } from './stats/stats.dto.js';

/** Статистика аккаунта (раздел 14 ТЗ): воронка, касания, черновики, ходы. */
@Controller('telegram/accounts/:id/ai/stats')
@UseGuards(JwtAuthGuard)
export class StatsController {
  constructor(
    private readonly accounts: TelegramAccountsService,
    private readonly stats: StatsService,
  ) {}

  @Get('funnel')
  async funnel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Query() query: Record<string, string>,
  ): Promise<FunnelStatsDto> {
    await this.accounts.requireAccount(user.id, accountId);
    return this.stats.funnel(accountId, range(query));
  }

  @Get('phrases')
  async phrases(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Query() query: Record<string, string>,
  ): Promise<LibraryStatsDto> {
    await this.accounts.requireAccount(user.id, accountId);
    return this.stats.library(accountId, range(query));
  }

  @Get('drafts')
  async drafts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Query() query: Record<string, string>,
  ): Promise<DraftStatsDto> {
    await this.accounts.requireAccount(user.id, accountId);
    return this.stats.drafts(accountId, range(query));
  }

  @Get('turns')
  async turns(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Query() query: Record<string, string>,
  ): Promise<TurnStatsDto> {
    await this.accounts.requireAccount(user.id, accountId);
    return this.stats.turns(accountId, range(query));
  }
}

function range(query: Record<string, string>): StatsRange {
  return parseBody(statsQuerySchema, query);
}
