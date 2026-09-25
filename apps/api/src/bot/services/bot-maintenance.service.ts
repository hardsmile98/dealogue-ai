import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Subscription } from 'rxjs';
import { runDetached } from '../../common/async.js';
import { whenListening } from '../../common/lifecycle.js';
import { BotTurnsRepository } from '../repositories/bot-turns.repository.js';

/** Сколько живут полные снимки промптов (docs/agent-architecture.md, раздел 9). */
const SNAPSHOT_TTL_MS = 30 * 24 * 60 * 60_000;
const CLEANUP_INTERVAL_MS = 60 * 60_000;
/** Строк за один DELETE — короткие транзакции, без долгих блокировок. */
const CLEANUP_BATCH = 1_000;

/**
 * Уборка журнала агента: полные промпты и ответы модели
 * (bot_prompt_snapshots) — самые тяжёлые строки в базе — хранятся 30 дней,
 * сам журнал ходов (bot_turns) остаётся. Раз в час, после того как
 * HTTP-сервер занял порт; первая уборка — сразу после старта.
 */
@Injectable()
export class BotMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotMaintenanceService.name);
  private listening: Subscription | null = null;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly turns: BotTurnsRepository,
  ) {}

  onModuleInit(): void {
    this.listening = whenListening(
      this.adapterHost,
      this.logger,
      'Уборка журнала агента',
      () => this.start(),
    );
  }

  onModuleDestroy(): void {
    this.stopped = true;
    this.listening?.unsubscribe();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Удаляет снимки старше срока пачками; возвращает, сколько удалено. */
  async cleanup(now = new Date()): Promise<number> {
    const before = new Date(now.getTime() - SNAPSHOT_TTL_MS);
    let removed = 0;
    for (;;) {
      if (this.stopped) break;
      const batch = await this.turns.deleteSnapshotsBefore(
        before,
        CLEANUP_BATCH,
      );
      removed += batch;
      if (batch < CLEANUP_BATCH) break;
    }
    if (removed > 0) {
      this.logger.log(`Удалено снимков промптов старше 30 дней: ${removed}`);
    }
    return removed;
  }

  private start(): void {
    if (this.stopped) return;
    const run = () =>
      runDetached(this.cleanup(), this.logger, 'Уборка журнала агента');
    this.timer = setInterval(run, CLEANUP_INTERVAL_MS);
    this.timer.unref?.();
    run();
  }
}
