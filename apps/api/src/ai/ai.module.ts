import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { HealthController } from '../health/health.controller.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { TelegramModule } from '../telegram/telegram.module.js';
import { AiController, AiSettingsController } from './ai-settings.controller.js';
import { AiConfig } from './ai.config.js';
import { AlertsController } from './alerts.controller.js';
import { AttentionController } from './attention.controller.js';
import { AiAccountSettingsEntity } from './entities/ai-account-settings.entity.js';
import { AiCategoryEntity } from './entities/ai-category.entity.js';
import { AiChatStateEntity } from './entities/ai-chat-state.entity.js';
import { AiDiagnosticEntity } from './entities/ai-diagnostic.entity.js';
import { AiDraftEntity } from './entities/ai-draft.entity.js';
import { AiEventEntity } from './entities/ai-event.entity.js';
import { AiFactEntity } from './entities/ai-fact.entity.js';
import { AiJobEntity } from './entities/ai-job.entity.js';
import { AiNoteEntity } from './entities/ai-note.entity.js';
import { AiPhraseEntity } from './entities/ai-phrase.entity.js';
import { AiPlaybookEntity } from './entities/ai-playbook.entity.js';
import { AiStatsDailyEntity } from './entities/ai-stats-daily.entity.js';
import { AiTurnEntity } from './entities/ai-turn.entity.js';
import { AlertEntity } from './entities/alert.entity.js';
import { AiLibraryController } from './library/library.controller.js';
import { AiLibraryService } from './library/library.service.js';
import { LlmProviderFactory } from './llm/llm-provider.factory.js';
import { AiJobWorker } from './services/ai-job-worker.service.js';
import { AiJobsService } from './services/ai-jobs.service.js';
import { AiSettingsService } from './services/ai-settings.service.js';
import { AlertsService } from './services/alerts.service.js';

/**
 * ИИ-агент воронки (docs/ai-agent-spec.md). Зависит от TelegramModule
 * (события, отправка, доступ к чатам), сам наружу ничего не экспортирует —
 * Telegram про ИИ не знает.
 *
 * Этап 1: фундамент — сущности, настройки, очередь, алерты. Ход агента,
 * библиотека и черновики добавляются следующими этапами.
 */
@Module({
  imports: [
    AuthModule,
    TelegramModule,
    RealtimeModule,
    TypeOrmModule.forFeature([
      AiAccountSettingsEntity,
      AiChatStateEntity,
      AiTurnEntity,
      AiEventEntity,
      AiPlaybookEntity,
      AiPhraseEntity,
      AiFactEntity,
      AiDiagnosticEntity,
      AiCategoryEntity,
      AiDraftEntity,
      AiNoteEntity,
      AiStatsDailyEntity,
      AiJobEntity,
      AlertEntity,
    ]),
  ],
  controllers: [
    HealthController,
    AiSettingsController,
    AiController,
    AiLibraryController,
    AttentionController,
    AlertsController,
  ],
  providers: [
    AiConfig,
    LlmProviderFactory,
    AiJobsService,
    AiJobWorker,
    AiSettingsService,
    AiLibraryService,
    AlertsService,
  ],
})
export class AiModule {}
