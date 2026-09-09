import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AiConfig } from '../ai/ai.config.js';
import { LlmProviderFactory } from '../ai/llm/llm-provider.factory.js';
import { AiJobWorker } from '../ai/services/ai-job-worker.service.js';
import { AiJobsService } from '../ai/services/ai-jobs.service.js';
import { TelegramRuntimeService } from '../telegram/services/telegram-runtime.service.js';

/** Живость сервиса: база, воркер очереди, предохранители провайдеров, аккаунты. */
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly aiConfig: AiConfig,
    private readonly providers: LlmProviderFactory,
    private readonly worker: AiJobWorker,
    private readonly jobs: AiJobsService,
    private readonly runtime: TelegramRuntimeService,
  ) {}

  @Get()
  async check() {
    let database = 'ok';
    try {
      await this.dataSource.query('SELECT 1');
    } catch (error) {
      database = error instanceof Error ? error.message : 'error';
    }
    const jobs = await this.jobs.counts().catch(() => null);
    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      database,
      ai: {
        enabled: this.aiConfig.enabled,
        ready: this.aiConfig.ready,
        provider: this.aiConfig.provider,
        model: this.aiConfig.model,
        worker: this.worker.status,
        jobs,
        providers: this.providers.describe().map((p) => ({ name: p.name, configured: p.configured, breaker: p.breaker })),
      },
      telegram: { liveAccounts: this.runtime.liveAccountIds().length },
      time: new Date().toISOString(),
    };
  }
}
