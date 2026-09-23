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
import { TelegramAccountsService } from './services/telegram-accounts.service.js';
import { TelegramAuthService } from './services/telegram-auth.service.js';
import { TelegramChatsService } from './services/telegram-chats.service.js';
import { TelegramDialogStartsService } from './services/telegram-dialog-starts.service.js';
import { TelegramEventsService } from './services/telegram-events.service.js';
import { TelegramIngestService } from './services/telegram-ingest.service.js';
import { TelegramOutboundService } from './services/telegram-outbound.service.js';
import { TelegramRuntimeService } from './services/telegram-runtime.service.js';
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
    TelegramClientFactory,
    // Живые клиенты и приём сообщений.
    TelegramEventsService,
    TelegramDialogStartsService,
    TelegramIngestService,
    TelegramSyncService,
    TelegramRuntimeService,
    TelegramOutboundService,
    // То, что обслуживает HTTP-эндпоинты.
    TelegramAuthService,
    TelegramAccountsService,
    TelegramChatsService,
    TelegramStatsService,
    TelegramEnabledGuard,
    AccountAccessGuard,
  ],
  // Наружу — то, на чём строятся другие модули (realtime, будущий бот): события,
  // отправка, доступ к аккаунтам/чатам с проверкой владельца и запись сообщений.
  exports: [
    TelegramConfig,
    TelegramEventsService,
    TelegramOutboundService,
    TelegramRuntimeService,
    TelegramIngestService,
    TelegramAccountsService,
    TelegramEnabledGuard,
    AccountAccessGuard,
    TypeOrmModule,
  ],
})
export class TelegramModule {}
