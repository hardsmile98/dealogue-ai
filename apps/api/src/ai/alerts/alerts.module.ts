import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../../auth/auth.module.js';
import { RealtimeModule } from '../../realtime/realtime.module.js';
import { TelegramModule } from '../../telegram/telegram.module.js';
import { AlertEntity } from '../entities/alert.entity.js';
import { AlertsController } from './alerts.controller.js';
import { AlertsService } from './alerts.service.js';
import { AttentionController } from './attention.controller.js';

/**
 * Алерты менеджеру и пометка «требует внимания» на чате. Заводит их агент,
 * закрывает человек — поэтому сервис экспортируется наружу.
 */
@Module({
  imports: [AuthModule, TelegramModule, RealtimeModule, TypeOrmModule.forFeature([AlertEntity])],
  controllers: [AlertsController, AttentionController],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
