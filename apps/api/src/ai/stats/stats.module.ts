import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../../auth/auth.module.js';
import { TelegramModule } from '../../telegram/telegram.module.js';
import { AiConfigModule } from '../ai-config.module.js';
import { AiDiagnosticEntity } from '../entities/ai-diagnostic.entity.js';
import { AiPhraseEntity } from '../entities/ai-phrase.entity.js';
import { AiStatsDailyEntity } from '../entities/ai-stats-daily.entity.js';
import { AiJobsModule } from '../jobs/ai-jobs.module.js';
import { AiSettingsModule } from '../settings/ai-settings.module.js';
import { StatsController } from './stats.controller.js';
import { StatsService } from './stats.service.js';

/**
 * Статистика агента (раздел 14 ТЗ). Job `stats` раз в час складывает сырые
 * счётчики дня в `ai_stats_daily`, страницы читают уже посчитанное.
 */
@Module({
  imports: [
    AuthModule,
    TelegramModule,
    AiConfigModule,
    AiJobsModule,
    AiSettingsModule,
    TypeOrmModule.forFeature([AiStatsDailyEntity, AiPhraseEntity, AiDiagnosticEntity]),
  ],
  controllers: [StatsController],
  providers: [StatsService],
})
export class AiStatsModule {}
