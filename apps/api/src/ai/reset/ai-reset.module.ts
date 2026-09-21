import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { RealtimeModule } from '../../realtime/realtime.module.js';
import { TelegramModule } from '../../telegram/telegram.module.js';
import { AiConfigModule } from '../ai-config.module.js';
import { AiResetController } from './ai-reset.controller.js';
import { AiResetService } from './ai-reset.service.js';

/**
 * Сброс агента на аккаунте. Своих сущностей у модуля нет: он ходит по всем
 * таблицам ИИ через DataSource, поэтому не зависит от остальных подмодулей.
 */
@Module({
  imports: [AuthModule, TelegramModule, RealtimeModule, AiConfigModule],
  controllers: [AiResetController],
  providers: [AiResetService],
})
export class AiResetModule {}
