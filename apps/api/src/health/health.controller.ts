import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RealtimeService } from '../realtime/realtime.service.js';
import { TelegramRuntimeService } from '../telegram/services/telegram-runtime.service.js';

/** Живость сервиса: база, подключённые аккаунты, подписчики SSE. */
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly runtime: TelegramRuntimeService,
    private readonly realtime: RealtimeService,
  ) {}

  @Get()
  async check() {
    let database = 'ok';
    try {
      await this.dataSource.query('SELECT 1');
    } catch (error) {
      database = error instanceof Error ? error.message : 'error';
    }
    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      database,
      telegram: { liveAccounts: this.runtime.liveAccountIds().length },
      realtime: { connections: this.realtime.connections },
      time: new Date().toISOString(),
    };
  }
}
