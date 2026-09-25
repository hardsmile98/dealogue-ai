import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { runDetached } from '../../common/async.js';
import { errorMessage } from '../../common/errors.js';
import { BotConfig } from '../bot.config.js';
import type { BotJobEntity } from '../entities/bot-job.entity.js';
import { BotChatStateRepository } from '../repositories/bot-chat-state.repository.js';
import { BotJobsRepository } from '../repositories/bot-jobs.repository.js';
import { BotJobExecutor } from './bot-job-executor.service.js';
import { BotRecoveryService } from './bot-recovery.service.js';
import type { TurnEnvironment } from './turn-runner.service.js';

/**
 * Откуда поллер берёт канал для боевого чата. Реализует Telegram-канал
 * (этап 5) и регистрирует себя через `registerChannels`.
 */
export interface BotChannelProvider {
  /**
   * Окружение хода или null, если канала сейчас нет: аккаунт не подключён
   * или ещё догружает пропущенное за время офлайна (база отстаёт).
   */
  environment(
    chatId: string,
    accountId: string,
  ): Promise<TurnEnvironment | null>;
  /** Почему канала нет: `syncing` — скоро будет, `offline` — неизвестно когда. */
  unavailable?(accountId: string): 'syncing' | 'offline';
  /** Клиент прямо сейчас пишет (открыто окно тишины) — ступень подождёт его ход. */
  isCollecting(chatId: string): boolean;
}

/** Сколько заданий выполняется одновременно: ход по заданию с «печатает» длится до минуты. */
const MAX_IN_FLIGHT = 10;
/** Канала нет, он догружает пропущенное или клиент пишет — задание откладывается на столько. */
const NO_CHANNEL_DELAY_MS = 5 * 60_000;
const SYNCING_DELAY_MS = 15_000;
const COLLECTING_DELAY_MS = 60_000;

/**
 * Поллер лестницы молчания (docs/agent-architecture.md, 2.4 и 8): раз в
 * `BOT_SCHEDULER_POLL_MS` забирает созревшие задания боевых чатов и
 * выполняет их в фоне, не больше `MAX_IN_FLIGHT` одновременно. Задания
 * песочницы не трогает — там время виртуальное.
 *
 * Пока канал не зарегистрирован (Telegram-канал регистрирует себя, когда
 * HTTP-сервер занял порт), поллер не запущен: задания ждут в базе и не
 * теряются. Первый проход — после восстановления (BotRecoveryService): оно
 * возвращает в очередь задания, оставшиеся `running` от прошлого процесса.
 * При остановке API новые задания не забираются.
 */
@Injectable()
export class BotSchedulerService implements OnModuleDestroy {
  private readonly logger = new Logger(BotSchedulerService.name);
  private readonly pollMs: number;
  private channels: BotChannelProvider | null = null;
  private timer: NodeJS.Timeout | null = null;
  private readonly inFlight = new Set<string>();
  private ticking = false;
  private stopped = false;

  constructor(
    config: BotConfig,
    private readonly jobs: BotJobsRepository,
    private readonly states: BotChatStateRepository,
    private readonly executor: BotJobExecutor,
    private readonly recovery: BotRecoveryService,
  ) {
    this.pollMs = config.schedulerPollMs;
  }

  /** Канал для боевых чатов; с ним поллер начинает работать. `BOT_SCHEDULER_POLL_MS=0` — выключен. */
  registerChannels(channels: BotChannelProvider): void {
    this.channels = channels;
    if (this.timer || this.pollMs <= 0) return;
    this.timer = setInterval(() => {
      runDetached(this.tick(), this.logger, 'Планировщик агента');
    }, this.pollMs);
    this.timer.unref?.();
    this.logger.log(
      `Планировщик агента запущен: опрос раз в ${Math.round(this.pollMs / 1000)} с`,
    );
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Один проход: забрать созревшее и запустить. Возвращает, сколько заданий запущено. */
  async tick(now = new Date()): Promise<number> {
    const channels = this.channels;
    if (!channels || this.ticking || this.stopped) return 0;
    this.ticking = true;
    try {
      await this.recovery.ready();
      if (this.stopped) return 0;
      const room = MAX_IN_FLIGHT - this.inFlight.size;
      if (room <= 0) return 0;
      const due = await this.jobs.claimDue(now, room);
      for (const job of due) {
        this.inFlight.add(job.id);
        runDetached(
          this.run(job, channels, now).finally(() =>
            this.inFlight.delete(job.id),
          ),
          this.logger,
          `Задание ${job.id}`,
        );
      }
      return due.length;
    } catch (error) {
      this.logger.error(`Планировщик агента: ${errorMessage(error)}`);
      return 0;
    } finally {
      this.ticking = false;
    }
  }

  /** Сколько заданий выполняется прямо сейчас — для проверок. */
  get running(): number {
    return this.inFlight.size;
  }

  private async run(
    job: BotJobEntity,
    channels: BotChannelProvider,
    now: Date,
  ): Promise<void> {
    try {
      const state = await this.states.find(job.chatId);
      if (!state) {
        await this.jobs.cancel(job.id);
        return;
      }
      if (channels.isCollecting(job.chatId)) {
        await this.jobs.release(
          job.id,
          new Date(now.getTime() + COLLECTING_DELAY_MS),
        );
        return;
      }
      const env = await channels.environment(job.chatId, state.accountId);
      if (!env) {
        const delay =
          channels.unavailable?.(state.accountId) === 'syncing'
            ? SYNCING_DELAY_MS
            : NO_CHANNEL_DELAY_MS;
        await this.jobs.release(job.id, new Date(now.getTime() + delay));
        return;
      }
      await this.executor.execute(job, env);
    } catch (error) {
      const message = errorMessage(error);
      this.logger.error(
        `Задание ${job.kind} (${job.id}) в чате ${job.chatId}: ${message}`,
      );
      await this.jobs
        .markFailed(job.id, message)
        .catch((markError: unknown) =>
          this.logger.warn(
            `Задание ${job.id}: статус «failed» не записан — ${errorMessage(markError)}`,
          ),
        );
    }
  }
}
