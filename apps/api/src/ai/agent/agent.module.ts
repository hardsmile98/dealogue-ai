import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../../auth/auth.module.js';
import { RealtimeModule } from '../../realtime/realtime.module.js';
import { TelegramModule } from '../../telegram/telegram.module.js';
import { AiConfigModule } from '../ai-config.module.js';
import { AlertsModule } from '../alerts/alerts.module.js';
import { AiCategoryEntity } from '../entities/ai-category.entity.js';
import { AiChatStateEntity } from '../entities/ai-chat-state.entity.js';
import { AiDiagnosticEntity } from '../entities/ai-diagnostic.entity.js';
import { AiDraftEntity } from '../entities/ai-draft.entity.js';
import { AiEventEntity } from '../entities/ai-event.entity.js';
import { AiFactEntity } from '../entities/ai-fact.entity.js';
import { AiNoteEntity } from '../entities/ai-note.entity.js';
import { AiPhraseEntity } from '../entities/ai-phrase.entity.js';
import { AiTurnEntity } from '../entities/ai-turn.entity.js';
import { AiJobsModule } from '../jobs/ai-jobs.module.js';
import { AiLibraryModule } from '../library/library.module.js';
import { LlmModule } from '../llm/llm.module.js';
import { AiSettingsModule } from '../settings/ai-settings.module.js';
import { ComposerService } from './composer/composer.service.js';
import { CriticService } from './guard/critic.service.js';
import { AgentController } from './controllers/agent.controller.js';
import { ChatAiController } from './controllers/chat-ai.controller.js';
import { DraftsController, DraftsQueueController } from './controllers/drafts.controller.js';
import { AgentJobsService } from './jobs/agent-jobs.service.js';
import { NotifyService } from './jobs/notify.service.js';
import { OutboundService } from './outbound/outbound.service.js';
import { AgentService } from './services/agent.service.js';
import { HandoffService } from './services/handoff.service.js';
import { ManagerDraftService } from './services/manager-draft.service.js';
import { TouchSchedulerService } from './services/touch-scheduler.service.js';
import { TurnFinalizerService } from './services/turn-finalizer.service.js';
import { TurnGenerationService } from './services/turn-generation.service.js';
import { TurnLimitsService } from './services/turn-limits.service.js';
import { ChatAiService } from './services/chat-ai.service.js';
import { ChatStateService } from './services/chat-state.service.js';
import { DraftsService } from './services/drafts.service.js';
import { InboundListenerService } from './services/inbound-listener.service.js';
import { LearningService } from './services/learning.service.js';
import { SandboxService } from './services/sandbox.service.js';
import { SimilarCasesService } from './services/similar-cases.service.js';
import { StabilityService } from './services/stability.service.js';
import { TurnContextService } from './services/turn-context.service.js';

/**
 * Ход агента целиком (разделы 4–9 ТЗ): Planner → Composer → Guard → Outbound,
 * слушатель входящих, касания по таймеру, черновики и решения менеджера,
 * обучение на похожих случаях, песочница, наблюдение за аномалиями.
 *
 * Библиотеку, настройки, алерты и очередь берёт из соседних модулей — здесь
 * только то, что относится к самому ходу.
 */
@Module({
  imports: [
    AuthModule,
    TelegramModule,
    RealtimeModule,
    AiConfigModule,
    LlmModule,
    AiJobsModule,
    AiSettingsModule,
    AiLibraryModule,
    AlertsModule,
    // Ход пишет своё состояние и читает библиотеку: TurnContextService
    // фильтрует примеры и блоки, а finishTurn считает отправки — это
    // запросы, которых нет в AiLibraryService.
    TypeOrmModule.forFeature([
      AiChatStateEntity,
      AiTurnEntity,
      AiDraftEntity,
      AiEventEntity,
      AiPhraseEntity,
      AiDiagnosticEntity,
      AiFactEntity,
      AiCategoryEntity,
      AiNoteEntity,
    ]),
  ],
  controllers: [AgentController, ChatAiController, DraftsController, DraftsQueueController],
  providers: [
    ChatStateService,
    TurnContextService,
    SimilarCasesService,
    LearningService,
    ComposerService,
    CriticService,
    OutboundService,
    TurnGenerationService,
    TurnLimitsService,
    HandoffService,
    TouchSchedulerService,
    TurnFinalizerService,
    ManagerDraftService,
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
export class AgentModule {}
