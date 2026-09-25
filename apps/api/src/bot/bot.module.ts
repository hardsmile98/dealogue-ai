import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { TelegramMessageEntity } from '../telegram/entities/telegram-message.entity.js';
import { TelegramModule } from '../telegram/telegram.module.js';
import { BotChatController } from './controllers/bot-chat.controller.js';
import { BotExamplesController } from './controllers/bot-examples.controller.js';
import { BotSandboxController } from './controllers/bot-sandbox.controller.js';
import { BotLibraryController } from './controllers/bot-library.controller.js';
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
import { BotLlmConfig } from './llm/bot-llm.config.js';
import { DeepSeekClient } from './llm/deepseek.client.js';
import { BotChatStateRepository } from './repositories/bot-chat-state.repository.js';
import { BotJobsRepository } from './repositories/bot-jobs.repository.js';
import { BotMemoryRepository } from './repositories/bot-memory.repository.js';
import { BotTurnsRepository } from './repositories/bot-turns.repository.js';
import { BotChatStateService } from './services/bot-chat-state.service.js';
import { BotExamplesService } from './services/bot-examples.service.js';
import { BotJobExecutor } from './services/bot-job-executor.service.js';
import { BotLadderService } from './services/bot-ladder.service.js';
import { BotLibraryService } from './services/bot-library.service.js';
import { BotSandboxService } from './services/bot-sandbox.service.js';
import { BotSchedulerService } from './services/bot-scheduler.service.js';
import { BotTelegramService } from './services/bot-telegram.service.js';
import { BotSettingsService } from './services/bot-settings.service.js';
import { LibraryContextService } from './services/library-context.service.js';
import { TurnRunnerService } from './services/turn-runner.service.js';

/**
 * ИИ-агент (docs/agent-architecture.md). Этап 1 — каркас: таблицы,
 * настройки и библиотека аккаунта, примеры, режим чата. Этап 2 — ядро
 * хода: анализ, план, текст, проверка, доставка, память, журнал — через
 * интерфейсы Inbox/Channel/Clock (core/channel.ts). Этап 3 — песочница:
 * виртуальный чат с виртуальными часами поверх того же ядра. Этап 4 —
 * лестница молчания: пересчёт ступеней, поллер заданий, повторы после
 * сбоя. Этап 5 — Telegram-канал (BotTelegramService): входящие, «печатает»,
 * прочтение, чужие исходящие, новые диалоги, канал для поллера.
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
      TelegramMessageEntity,
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
    BotLlmConfig,
    DeepSeekClient,
    // Данные.
    BotChatStateRepository,
    BotMemoryRepository,
    BotTurnsRepository,
    BotJobsRepository,
    // Настройки и библиотека.
    BotSettingsService,
    BotLibraryService,
    BotExamplesService,
    BotChatStateService,
    LibraryContextService,
    // Ядро хода и лестница молчания.
    TurnRunnerService,
    BotLadderService,
    BotJobExecutor,
    BotSchedulerService,
    // Telegram-канал агента.
    BotTelegramService,
    // Песочница.
    BotSandboxService,
  ],
  exports: [
    BotSettingsService,
    BotLibraryService,
    BotChatStateRepository,
    TurnRunnerService,
    BotJobsRepository,
    BotTurnsRepository,
    BotLadderService,
    BotSchedulerService,
  ],
})
export class BotModule {}
