import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { HealthController } from '../health/health.controller.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { TelegramModule } from '../telegram/telegram.module.js';
import { AgentController } from './agent/agent.controller.js';
import { ChatAiController } from './agent/chat-ai.controller.js';
import { ComposerService } from './agent/composer/composer.service.js';
import { DraftsController, DraftsQueueController } from './agent/drafts.controller.js';
import { AgentJobsService } from './agent/jobs/agent-jobs.service.js';
import { NotifyService } from './agent/jobs/notify.service.js';
import { OutboundService } from './agent/outbound/outbound.service.js';
import { AgentService } from './agent/services/agent.service.js';
import { ChatAiService } from './agent/services/chat-ai.service.js';
import { ChatStateService } from './agent/services/chat-state.service.js';
import { DraftsService } from './agent/services/drafts.service.js';
import { InboundListenerService } from './agent/services/inbound-listener.service.js';
import { LearningService } from './agent/services/learning.service.js';
import { SandboxService } from './agent/services/sandbox.service.js';
import { SimilarCasesService } from './agent/services/similar-cases.service.js';
import { StabilityService } from './agent/services/stability.service.js';
import { TurnContextService } from './agent/services/turn-context.service.js';
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
 * Слои: настройки и очередь (этап 1), библиотека (этап 2), ход агента —
 * Planner → Composer → Guard → Outbound, слушатель событий, песочница (этап 3),
 * касания по таймеру (этап 4), черновики и решения менеджера (этап 5),
 * похожие случаи, счётчик ответов и аномалии (этап 6).
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
    ChatAiController,
    DraftsController,
    DraftsQueueController,
    AgentController,
  ],
  providers: [
    AiConfig,
    LlmProviderFactory,
    AiJobsService,
    AiJobWorker,
    AiSettingsService,
    AiLibraryService,
    AlertsService,
    ChatStateService,
    TurnContextService,
    SimilarCasesService,
    LearningService,
    ComposerService,
    OutboundService,
    AgentService,
    AgentJobsService,
    InboundListenerService,
    SandboxService,
    ChatAiService,
    DraftsService,
    NotifyService,
    StabilityService,
  ],
})
export class AiModule {}
