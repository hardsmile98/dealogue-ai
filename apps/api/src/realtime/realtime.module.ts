import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { TelegramAccountEntity } from '../telegram/entities/telegram-account.entity.js';
import { TelegramModule } from '../telegram/telegram.module.js';
import { RealtimeController } from './realtime.controller.js';
import { RealtimeService } from './realtime.service.js';
import { SseTicketGuard } from './sse-ticket.guard.js';
import { TelegramRealtimeBridge } from './telegram-realtime.bridge.js';

/** SSE-события для браузера. Публикуют другие модули через RealtimeService. */
@Module({
  imports: [AuthModule, TelegramModule, TypeOrmModule.forFeature([TelegramAccountEntity])],
  controllers: [RealtimeController],
  providers: [RealtimeService, SseTicketGuard, TelegramRealtimeBridge],
  exports: [RealtimeService],
})
export class RealtimeModule {}
