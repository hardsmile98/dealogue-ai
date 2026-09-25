import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { TelegramClientFactory } from './client/telegram-client.factory.js';
import { TelegramAccountsController } from './controllers/telegram-accounts.controller.js';
import { TelegramAuthController } from './controllers/telegram-auth.controller.js';
import { TelegramChatsController } from './controllers/telegram-chats.controller.js';
import { TelegramAccountEntity } from './entities/telegram-account.entity.js';
import { TelegramChatEntity } from './entities/telegram-chat.entity.js';
import { TelegramDialogStartEntity } from './entities/telegram-dialog-start.entity.js';
import { TelegramLoginAttemptEntity } from './entities/telegram-login-attempt.entity.js';
import { TelegramMessageEntity } from './entities/telegram-message.entity.js';
import { AccountAccessGuard } from './guards/account-access.guard.js';
import { TelegramEnabledGuard } from './guards/telegram-enabled.guard.js';
import { SessionCrypto } from './lib/session-crypto.js';
import { TelegramAccountsRepository } from './repositories/telegram-accounts.repository.js';
import { TelegramChatsRepository } from './repositories/telegram-chats.repository.js';
import { TelegramMessagesRepository } from './repositories/telegram-messages.repository.js';
import { TelegramEventsService } from './runtime/telegram-events.service.js';
import { TelegramOutboundService } from './runtime/telegram-outbound.service.js';
import { TelegramRuntimeService } from './runtime/telegram-runtime.service.js';
import { TelegramUpdatesService } from './runtime/telegram-updates.service.js';
import { TelegramAccountsService } from './services/telegram-accounts.service.js';
import { TelegramAuthService } from './services/telegram-auth.service.js';
import { TelegramChatsService } from './services/telegram-chats.service.js';
import { TelegramDialogStartsService } from './services/telegram-dialog-starts.service.js';
import { TelegramIngestService } from './services/telegram-ingest.service.js';
import { TelegramStatsService } from './services/telegram-stats.service.js';
import { TelegramSyncService } from './services/telegram-sync.service.js';
import { TelegramConfig } from './telegram.config.js';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      TelegramAccountEntity,
      TelegramLoginAttemptEntity,
      TelegramChatEntity,
      TelegramMessageEntity,
      TelegramDialogStartEntity,
    ]),
  ],
  controllers: [
    TelegramAuthController,
    TelegramAccountsController,
    TelegramChatsController,
  ],
  providers: [
    TelegramConfig,
    {
      // Один шифровальщик сессий на модуль. Без секрета раздел выключен и
      // сессии не читаются — ключ-заглушка лишь позволяет собрать провайдер.
      provide: SessionCrypto,
      inject: [TelegramConfig],
      useFactory: (config: TelegramConfig) =>
        new SessionCrypto(config.sessionSecret || 'telegram-disabled'),
    },
    TelegramClientFactory,
    // Данные: весь SQL по таблицам Telegram.
    TelegramAccountsRepository,
    TelegramChatsRepository,
    TelegramMessagesRepository,
    // Живые клиенты: жизненный цикл, приём апдейтов, шина, исходящие.
    TelegramEventsService,
    TelegramRuntimeService,
    TelegramUpdatesService,
    TelegramOutboundService,
    // Приём истории и сообщений.
    TelegramDialogStartsService,
    TelegramIngestService,
    TelegramSyncService,
    // То, что обслуживает HTTP-эндпоинты.
    TelegramAuthService,
    TelegramAccountsService,
    TelegramChatsService,
    TelegramStatsService,
    TelegramEnabledGuard,
    AccountAccessGuard,
  ],
  // Наружу — то, на чём строятся другие модули (realtime, агент): события,
  // отправка, доступ к аккаунтам/чатам с проверкой владельца, запись и чтение данных.
  exports: [
    TelegramConfig,
    TelegramEventsService,
    TelegramOutboundService,
    TelegramRuntimeService,
    TelegramIngestService,
    TelegramAccountsService,
    TelegramAccountsRepository,
    TelegramChatsRepository,
    TelegramMessagesRepository,
    TelegramEnabledGuard,
    AccountAccessGuard,
  ],
})
export class TelegramModule {}
