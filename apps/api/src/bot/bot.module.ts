import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { TelegramModule } from '../telegram/telegram.module.js';
import { BotConfig } from './bot.config.js';
import { BotChatController } from './controllers/bot-chat.controller.js';
import { BotExamplesController } from './controllers/bot-examples.controller.js';
import { BotLibraryController } from './controllers/bot-library.controller.js';
import { BotSandboxController } from './controllers/bot-sandbox.controller.js';
import { BotSettingsController } from './controllers/bot-settings.controller.js';
import { BotAccountSettingsEntity } from './entities/bot-account-settings.entity.js';
import { BotChatSaidEntity } from './entities/bot-chat-said.entity.js';
import { BotChatStateEntity } from './entities/bot-chat-state.entity.js';
import { BotClientFactEntity } from './entities/bot-client-fact.entity.js';
import { BotExampleEntity } from './entities/bot-example.entity.js';
import { BotJobEntity } from './entities/bot-job.entity.js';
import { BotLibraryItemEntity } from './entities/bot-library-item.entity.js';
import { BotPromptSnapshotEntity } from './entities/bot-prompt-snapshot.entity.js';
import { BotSandboxMessageEntity } from './entities/bot-sandbox-message.entity.js';
import { BotSandboxSessionEntity } from './entities/bot-sandbox-session.entity.js';
import { BotTurnEntity } from './entities/bot-turn.entity.js';
import { DeepSeekClient } from './llm/deepseek.client.js';
import { BotChatStateRepository } from './repositories/bot-chat-state.repository.js';
import { BotExamplesRepository } from './repositories/bot-examples.repository.js';
import { BotJobsRepository } from './repositories/bot-jobs.repository.js';
import { BotLibraryRepository } from './repositories/bot-library.repository.js';
import { BotMemoryRepository } from './repositories/bot-memory.repository.js';
import { BotSandboxRepository } from './repositories/bot-sandbox.repository.js';
import { BotSettingsRepository } from './repositories/bot-settings.repository.js';
import { BotTurnsRepository } from './repositories/bot-turns.repository.js';
import { BotChatStateService } from './services/bot-chat-state.service.js';
import { BotExamplesService } from './services/bot-examples.service.js';
import { BotJobExecutor } from './services/bot-job-executor.service.js';
import { BotLadderService } from './services/bot-ladder.service.js';
import { BotLibraryService } from './services/bot-library.service.js';
import { BotMaintenanceService } from './services/bot-maintenance.service.js';
import { BotSandboxService } from './services/bot-sandbox.service.js';
import { BotSchedulerService } from './services/bot-scheduler.service.js';
import { BotSettingsService } from './services/bot-settings.service.js';
import { BotTelegramChannels } from './services/bot-telegram-channels.service.js';
import { BotTelegramService } from './services/bot-telegram.service.js';
import { LibraryContextService } from './services/library-context.service.js';
import { TurnLlmService } from './services/turn-llm.service.js';
import { TurnRunnerService } from './services/turn-runner.service.js';

/**
 * ИИ-агент (docs/agent-architecture.md): настройки и библиотека аккаунта,
 * примеры, ядро хода (анализ → план → текст → проверка → доставка) через
 * интерфейсы Channel/Clock (core/channel.ts), лестница молчания с поллером
 * заданий, Telegram-канал и песочница с виртуальными часами поверх того же
 * ядра. Слои: контроллеры → сервисы → репозитории (весь SQL агента), чистая
 * логика хода — в core/ и library/.
 */
@Module({
  imports: [
    AuthModule,
    TelegramModule,
    TypeOrmModule.forFeature([
      BotAccountSettingsEntity,
      BotLibraryItemEntity,
      BotExampleEntity,
      BotChatStateEntity,
      BotClientFactEntity,
      BotChatSaidEntity,
      BotJobEntity,
      BotTurnEntity,
      BotPromptSnapshotEntity,
      BotSandboxSessionEntity,
      BotSandboxMessageEntity,
    ]),
  ],
  controllers: [
    BotSettingsController,
    BotLibraryController,
    BotExamplesController,
    BotChatController,
    BotSandboxController,
  ],
  providers: [
    BotConfig,
    DeepSeekClient,
    // Данные.
    BotSettingsRepository,
    BotLibraryRepository,
    BotExamplesRepository,
    BotChatStateRepository,
    BotMemoryRepository,
    BotTurnsRepository,
    BotJobsRepository,
    BotSandboxRepository,
    // Настройки и библиотека.
    BotSettingsService,
    BotLibraryService,
    BotExamplesService,
    BotChatStateService,
    LibraryContextService,
    // Ядро хода и лестница молчания.
    TurnLlmService,
    TurnRunnerService,
    BotLadderService,
    BotJobExecutor,
    BotSchedulerService,
    BotMaintenanceService,
    // Telegram-канал агента.
    BotTelegramChannels,
    BotTelegramService,
    // Песочница.
    BotSandboxService,
  ],
})
export class BotModule {}
