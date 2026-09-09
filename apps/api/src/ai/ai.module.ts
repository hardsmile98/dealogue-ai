import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { HealthController } from '../health/health.controller.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { TelegramModule } from '../telegram/telegram.module.js';
import { AiChatController } from './ai-chat.controller.js';
import { AiConfig } from './ai.config.js';
import { AiAccountController, AiController } from './ai.controller.js';
import { AlertsController } from './alerts.controller.js';
import { AiAgentSettingsEntity } from './entities/ai-agent-settings.entity.js';
import { AiExchangeEntity } from './entities/ai-exchange.entity.js';
import { AiJobEntity } from './entities/ai-job.entity.js';
import { AiRunEntity } from './entities/ai-run.entity.js';
import { AiStyleProfileEntity } from './entities/ai-style-profile.entity.js';
import { AlertEntity } from './entities/alert.entity.js';
import { ExchangeIndexerService } from './learning/exchange-indexer.service.js';
import { ExchangeRetrieverService } from './learning/exchange-retriever.service.js';
import { HistoryImportService } from './learning/history-import.service.js';
import { StyleLearningService } from './learning/style-learning.service.js';
import { LlmProviderFactory } from './llm/llm-provider.factory.js';
import { AiAgentService } from './services/ai-agent.service.js';
import { AiJobWorker } from './services/ai-job-worker.service.js';
import { AiJobsService } from './services/ai-jobs.service.js';
import { AiSettingsService } from './services/ai-settings.service.js';
import { AlertsService } from './services/alerts.service.js';
import { HandoffService } from './services/handoff.service.js';

/**
 * ИИ-агент продаж. Зависит от TelegramModule (события, отправка, доступ к
 * чатам), сам наружу ничего не экспортирует — Telegram про ИИ не знает.
 */
@Module({
  imports: [
    AuthModule,
    TelegramModule,
    RealtimeModule,
    TypeOrmModule.forFeature([
      AiAgentSettingsEntity,
      AiStyleProfileEntity,
      AiExchangeEntity,
      AiJobEntity,
      AiRunEntity,
      AlertEntity,
    ]),
  ],
  controllers: [HealthController, AiAccountController, AiController, AiChatController, AlertsController],
  providers: [
    AiConfig,
    LlmProviderFactory,
    AiJobsService,
    AiJobWorker,
    AiSettingsService,
    ExchangeIndexerService,
    ExchangeRetrieverService,
    HistoryImportService,
    StyleLearningService,
    AlertsService,
    HandoffService,
    AiAgentService,
  ],
})
export class AiModule {}
