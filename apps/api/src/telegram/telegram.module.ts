import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { TelegramClientFactory } from './client/telegram-client.factory.js';
import { TelegramAccountEntity } from './entities/telegram-account.entity.js';
import { TelegramChatEntity } from './entities/telegram-chat.entity.js';
import { TelegramDialogStartEntity } from './entities/telegram-dialog-start.entity.js';
import { TelegramLoginAttemptEntity } from './entities/telegram-login-attempt.entity.js';
import { TelegramMessageEntity } from './entities/telegram-message.entity.js';
import { TelegramAccountsService } from './services/telegram-accounts.service.js';
import { TelegramAuthService } from './services/telegram-auth.service.js';
import { TelegramDialogStartsService } from './services/telegram-dialog-starts.service.js';
import { TelegramIngestService } from './services/telegram-ingest.service.js';
import { TelegramRuntimeService } from './services/telegram-runtime.service.js';
import { TelegramSyncService } from './services/telegram-sync.service.js';
import { TelegramConfig } from './telegram.config.js';
import { TelegramController } from './telegram.controller.js';

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
  controllers: [TelegramController],
  providers: [
    TelegramConfig,
    TelegramClientFactory,
    TelegramDialogStartsService,
    TelegramIngestService,
    TelegramSyncService,
    TelegramRuntimeService,
    TelegramAuthService,
    TelegramAccountsService,
  ],
})
export class TelegramModule {}
