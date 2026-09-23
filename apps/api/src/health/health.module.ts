import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { TelegramModule } from '../telegram/telegram.module.js';
import { HealthController } from './health.controller.js';

/**
 * Живость сервиса для мониторинга: база, подключённые аккаунты, подписчики
 * SSE. Без авторизации — по этому адресу ходит внешняя проверка.
 */
@Module({
  imports: [TelegramModule, RealtimeModule],
  controllers: [HealthController],
})
export class HealthModule {}
