import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { Account } from '../decorators/account.decorator.js';
import { StatsQueryDto } from '../dto/stats.dto.js';
import type { TelegramAccountEntity } from '../entities/telegram-account.entity.js';
import { AccountAccessGuard } from '../guards/account-access.guard.js';
import { TelegramEnabledGuard } from '../guards/telegram-enabled.guard.js';
import { TelegramAccountsService } from '../services/telegram-accounts.service.js';
import { TelegramStatsService } from '../services/telegram-stats.service.js';
import type { AccountStatsDto, TelegramAccountDto } from '../telegram.types.js';

/**
 * Аккаунты пользователя из JWT — чужие не видны. Контракт совпадает с
 * apps/web/src/shared/api/contracts/telegram.ts.
 */
@Controller('telegram/accounts')
@UseGuards(JwtAuthGuard, TelegramEnabledGuard)
export class TelegramAccountsController {
  constructor(
    private readonly accounts: TelegramAccountsService,
    private readonly stats: TelegramStatsService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<TelegramAccountDto[]> {
    return this.accounts.list(user.id);
  }

  @Get(':id')
  @UseGuards(AccountAccessGuard)
  get(@Account() account: TelegramAccountEntity): Promise<TelegramAccountDto> {
    return this.accounts.describe(account);
  }

  @Delete(':id')
  @UseGuards(AccountAccessGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Account() account: TelegramAccountEntity): Promise<void> {
    return this.accounts.remove(account);
  }

  @Get(':id/stats')
  @UseGuards(AccountAccessGuard)
  getStats(
    @Account() account: TelegramAccountEntity,
    @Query() query: StatsQueryDto,
  ): Promise<AccountStatsDto> {
    return this.stats.forPeriod(account, query);
  }
}
