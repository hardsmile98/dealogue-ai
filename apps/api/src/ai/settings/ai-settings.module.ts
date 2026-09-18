import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../../auth/auth.module.js';
import { RealtimeModule } from '../../realtime/realtime.module.js';
import { TelegramModule } from '../../telegram/telegram.module.js';
import { AiConfigModule } from '../ai-config.module.js';
import { AiAccountSettingsEntity } from '../entities/ai-account-settings.entity.js';
import { AiEventEntity } from '../entities/ai-event.entity.js';
import { AiSettingsController } from './ai-settings.controller.js';
import { AiSettingsService } from './ai-settings.service.js';

/** Настройки агента на аккаунте: персона, таймеры, лимиты, guard, режимы. */
@Module({
  imports: [
    AuthModule,
    TelegramModule,
    RealtimeModule,
    AiConfigModule,
    TypeOrmModule.forFeature([AiAccountSettingsEntity, AiEventEntity]),
  ],
  controllers: [AiSettingsController],
  providers: [AiSettingsService],
  exports: [AiSettingsService],
})
export class AiSettingsModule {}
