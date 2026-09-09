import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { TelegramAccountEntity } from '../telegram/entities/telegram-account.entity.js';
import { RealtimeController } from './realtime.controller.js';
import { RealtimeService } from './realtime.service.js';
import { SseTicketGuard } from './sse-ticket.guard.js';

/** SSE-события для браузера. Публикуют другие модули через RealtimeService. */
@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([TelegramAccountEntity])],
  controllers: [RealtimeController],
  providers: [RealtimeService, SseTicketGuard],
  exports: [RealtimeService],
})
export class RealtimeModule {}
