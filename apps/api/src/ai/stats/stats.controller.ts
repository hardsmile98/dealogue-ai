import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { zod } from '../../common/pipes/zod-validation.pipe.js';
import { AccountId } from '../../telegram/decorators/account.decorator.js';
import { AccountAccessGuard } from '../../telegram/guards/account-access.guard.js';
import { statsQuerySchema } from './stats.schema.js';
import { StatsService } from './stats.service.js';
import type { DraftStatsDto, FunnelStatsDto, LibraryStatsDto, StatsRange, TurnStatsDto } from './stats.dto.js';

/** Статистика аккаунта (раздел 14 ТЗ): воронка, касания, черновики, ходы. */
@Controller('telegram/accounts/:id/ai/stats')
@UseGuards(JwtAuthGuard, AccountAccessGuard)
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('funnel')
  funnel(@AccountId() accountId: string, @Query(zod(statsQuerySchema)) range: StatsRange): Promise<FunnelStatsDto> {
    return this.stats.funnel(accountId, range);
  }

  @Get('phrases')
  phrases(@AccountId() accountId: string, @Query(zod(statsQuerySchema)) range: StatsRange): Promise<LibraryStatsDto> {
    return this.stats.library(accountId, range);
  }

  @Get('drafts')
  drafts(@AccountId() accountId: string, @Query(zod(statsQuerySchema)) range: StatsRange): Promise<DraftStatsDto> {
    return this.stats.drafts(accountId, range);
  }

  @Get('turns')
  turns(@AccountId() accountId: string, @Query(zod(statsQuerySchema)) range: StatsRange): Promise<TurnStatsDto> {
    return this.stats.turns(accountId, range);
  }
}
