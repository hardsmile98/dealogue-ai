import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BotJobEntity } from '../entities/bot-job.entity.js';
import { BotChatStateRepository } from '../repositories/bot-chat-state.repository.js';
import { BotJobsRepository } from '../repositories/bot-jobs.repository.js';
import { BotJobExecutor } from './bot-job-executor.service.js';
import type { TurnEnvironment } from './turn-runner.service.js';

/**
 * Откуда поллер берёт канал для боевого чата. Реализует Telegram-канал
 * (этап 5) и регистрирует себя через `registerChannels`.
 */
export interface BotChannelProvider {
  /** Окружение хода или null, если канала сейчас нет (аккаунт не подключён, агент выключен). */
  environment(chatId: string, accountId: string): Promise<TurnEnvironment | null>;
  /** Клиент прямо сейчас пишет (открыто окно тишины) — ступень подождёт его ход. */
  isCollecting(chatId: string): boolean;
}

const DEFAULT_POLL_MS = 30_000;
/** Сколько заданий выполняется одновременно: ход по заданию с «печатает» длится до минуты. */
const MAX_IN_FLIGHT = 10;
/** `running` старше этого после падения API возвращается в очередь. */
const STUCK_AFTER_MS = 15 * 60_000;
/** Канала нет или клиент пишет — задание откладывается на столько. */
const NO_CHANNEL_DELAY_MS = 5 * 60_000;
const COLLECTING_DELAY_MS = 60_000;

/**
 * Поллер лестницы молчания (docs/agent-architecture.md, 2.4 и 8): раз в
 * `BOT_SCHEDULER_POLL_MS` забирает созревшие задания боевых чатов и
 * выполняет их в фоне, не больше `MAX_IN_FLIGHT` одновременно. Задания
 * песочницы не трогает — там время виртуальное.
 *
 * Пока канал не зарегистрирован (Telegram-канал — этап 5), поллер не
 * запущен: задания ждут в базе и не теряются.
 */
@Injectable()
export class BotSchedulerService implements OnModuleDestroy {
  private readonly logger = new Logger(BotSchedulerService.name);
  private readonly pollMs: number;
  private channels: BotChannelProvider | null = null;
  private timer: NodeJS.Timeout | null = null;
  private readonly inFlight = new Set<string>();
  private ticking = false;

  constructor(
    config: ConfigService,
    private readonly jobs: BotJobsRepository,
    private readonly states: BotChatStateRepository,
    private readonly executor: BotJobExecutor,
  ) {
    const value = Number(config.get<string>('BOT_SCHEDULER_POLL_MS') ?? DEFAULT_POLL_MS);
    this.pollMs = Number.isFinite(value) ? value : DEFAULT_POLL_MS;
  }

  /** Канал для боевых чатов; с ним поллер начинает работать. `BOT_SCHEDULER_POLL_MS=0` — выключен. */
  registerChannels(channels: BotChannelProvider): void {
    this.channels = channels;
    if (this.timer || this.pollMs <= 0) return;
    this.timer = setInterval(() => void this.tick(), this.pollMs);
    this.timer.unref?.();
    this.logger.log(`Планировщик агента запущен: опрос раз в ${Math.round(this.pollMs / 1000)} с`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Один проход: забрать созревшее и запустить. Возвращает, сколько заданий запущено. */
  async tick(now = new Date()): Promise<number> {
    const channels = this.channels;
    if (!channels || this.ticking) return 0;
    this.ticking = true;
    try {
      const released = await this.jobs.releaseStuck(new Date(now.getTime() - STUCK_AFTER_MS));
      if (released > 0) this.logger.warn(`Возвращено в очередь зависших заданий: ${released}`);
      const room = MAX_IN_FLIGHT - this.inFlight.size;
      if (room <= 0) return 0;
      const due = await this.jobs.claimDue(now, room);
      for (const job of due) {
        this.inFlight.add(job.id);
        void this.run(job, channels, now).finally(() => this.inFlight.delete(job.id));
      }
      return due.length;
    } catch (error) {
      this.logger.error(`Планировщик агента: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    } finally {
      this.ticking = false;
    }
  }

  /** Сколько заданий выполняется прямо сейчас — для проверок. */
  get running(): number {
    return this.inFlight.size;
  }

  private async run(job: BotJobEntity, channels: BotChannelProvider, now: Date): Promise<void> {
    try {
      const state = await this.states.find(job.chatId);
      if (!state) {
        await this.jobs.cancel(job.id);
        return;
      }
      if (channels.isCollecting(job.chatId)) {
        await this.jobs.release(job.id, new Date(now.getTime() + COLLECTING_DELAY_MS));
        return;
      }
      const env = await channels.environment(job.chatId, state.accountId);
      if (!env) {
        await this.jobs.release(job.id, new Date(now.getTime() + NO_CHANNEL_DELAY_MS));
        return;
      }
      await this.executor.execute(job, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Задание ${job.kind} (${job.id}) в чате ${job.chatId}: ${message}`);
      await this.jobs.markFailed(job.id, message).catch(() => undefined);
    }
  }
}
