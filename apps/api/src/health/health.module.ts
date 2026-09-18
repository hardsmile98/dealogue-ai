import { Module } from '@nestjs/common';
import { AiConfigModule } from '../ai/ai-config.module.js';
import { AiJobsModule } from '../ai/jobs/ai-jobs.module.js';
import { LlmModule } from '../ai/llm/llm.module.js';
import { TelegramModule } from '../telegram/telegram.module.js';
import { HealthController } from './health.controller.js';

/**
 * Живость сервиса для мониторинга: база, воркер очереди, предохранители
 * провайдеров, подключённые аккаунты. Без авторизации — по этому адресу
 * ходит внешняя проверка.
 */
@Module({
  imports: [AiConfigModule, LlmModule, AiJobsModule, TelegramModule],
  controllers: [HealthController],
})
export class HealthModule {}
