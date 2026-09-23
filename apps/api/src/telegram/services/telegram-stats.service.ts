import { BadRequestException, Injectable } from '@nestjs/common';
import type { StatsQueryDto } from '../dto/stats.dto.js';
import type { TelegramAccountEntity } from '../entities/telegram-account.entity.js';
import { buildAccountStats } from '../lib/account-stats.js';
import {
  daysBetween,
  isDayKey,
  isValidTimezone,
  shiftDayKey,
} from '../lib/timezone.js';
import { TelegramConfig } from '../telegram.config.js';
import type { AccountStatsDto } from '../telegram.types.js';
import { TelegramDialogStartsService } from './telegram-dialog-starts.service.js';

const MAX_PERIOD_DAYS = 366;

/** Статистика начал диалогов аккаунта за период с дельтой к предыдущему. */
@Injectable()
export class TelegramStatsService {
  constructor(
    private readonly config: TelegramConfig,
    private readonly dialogStarts: TelegramDialogStartsService,
  ) {}

  async forPeriod(
    account: TelegramAccountEntity,
    { from, to, tz }: StatsQueryDto,
  ): Promise<AccountStatsDto> {
    // Формат уже проверил DTO; здесь — что это реальные даты и разумный период.
    if (!isDayKey(from) || !isDayKey(to))
      throw new BadRequestException('Даты периода: YYYY-MM-DD');
    if (from > to)
      throw new BadRequestException('Начало периода позже его конца');
    const length = daysBetween(from, to);
    if (length > MAX_PERIOD_DAYS) {
      throw new BadRequestException(
        `Период не длиннее ${MAX_PERIOD_DAYS} дней`,
      );
    }

    const timezone = tz && isValidTimezone(tz) ? tz : this.config.timezone;
    const [current, previous] = await Promise.all([
      this.dialogStarts.groupByDayAndCode(account.id, from, to, timezone),
      this.dialogStarts.groupByDayAndCode(
        account.id,
        shiftDayKey(from, -length),
        shiftDayKey(from, -1),
        timezone,
      ),
    ]);
    return buildAccountStats({ from, to, current, previous });
  }
}
