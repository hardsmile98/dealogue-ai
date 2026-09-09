import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AiConfig } from '../ai.config.js';
import type { AiJobEntity, AiJobType } from '../entities/ai-job.entity.js';
import { AiJobsService } from './ai-jobs.service.js';

/** Что обработчик просит сделать с job'ом по окончании. */
export type JobOutcome =
  | { kind: 'done' }
  | { kind: 'cancelled' }
  /** Перенести без списания попытки (вне окна, аккаунт офлайн, предохранитель). */
  | { kind: 'postpone'; runAt: Date; reason: string; payload?: Record<string, unknown> }
  /** Повторить позже как ошибку (списывает попытку). */
  | { kind: 'retry'; runAt: Date; error: string };

export interface JobContext {
  job: AiJobEntity;
  /** Продлить блокировку и сохранить прогресс. false — job отменён, пора выходить. */
  heartbeat(payloadPatch?: Record<string, unknown>): Promise<boolean>;
}

export type JobHandler = (ctx: JobContext) => Promise<JobOutcome>;

const WATCHDOG_MS = 60_000;
const PRUNE_MS = 6 * 60 * 60_000;
const SHUTDOWN_WAIT_MS = 20_000;
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 30 * 60_000;

/**
 * Единственный воркер очереди: раз в несколько секунд забирает готовые
 * job'ы (не больше `workerConcurrency` одновременно), исполняет
 * зарегистрированные обработчики, повторяет с backoff и освобождает
 * зависшее. Обработчики регистрируют сервисы модуля при старте.
 */
@Injectable()
export class AiJobWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiJobWorker.name);
  private readonly handlers = new Map<AiJobType, JobHandler>();
  private readonly running = new Map<string, Promise<void>>();
  private pollTimer: NodeJS.Timeout | null = null;
  private watchdogTimer: NodeJS.Timeout | null = null;
  private pruneTimer: NodeJS.Timeout | null = null;
  private stopping = false;
  private lastTickAt: Date | null = null;
  private polling = false;

  constructor(
    private readonly config: AiConfig,
    private readonly jobs: AiJobsService,
  ) {}

  register(type: AiJobType, handler: JobHandler): void {
    this.handlers.set(type, handler);
  }

  onModuleInit(): void {
    if (!this.config.enabled) {
      this.logger.warn('Воркер ИИ не запущен: AI_ENABLED=false');
      return;
    }
    // Первый тик — после того, как все модули зарегистрировали обработчики.
    this.pollTimer = setInterval(() => void this.tick(), this.config.workerPollMs);
    this.watchdogTimer = setInterval(() => void this.watchdog(), WATCHDOG_MS);
    this.pruneTimer = setInterval(() => void this.jobs.prune().catch(() => undefined), PRUNE_MS);
    void this.watchdog();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    if (this.pruneTimer) clearInterval(this.pruneTimer);

    const pending = [...this.running.values()];
    if (pending.length === 0) return;
    this.logger.log(`Останавливаемся: ждём ${pending.length} job(ов) до ${SHUTDOWN_WAIT_MS / 1000} с`);
    await Promise.race([Promise.allSettled(pending), sleep(SHUTDOWN_WAIT_MS)]);
    const stuck = [...this.running.keys()];
    if (stuck.length > 0) {
      await this.jobs.releaseRunning(stuck).catch(() => undefined);
      this.logger.warn(`Не дождались ${stuck.length} job(ов) — вернули в очередь`);
    }
  }

  /** Для /health. */
  get status(): { lastTickAt: string | null; running: number; handlers: AiJobType[] } {
    return {
      lastTickAt: this.lastTickAt?.toISOString() ?? null,
      running: this.running.size,
      handlers: [...this.handlers.keys()],
    };
  }

  /** Принудительный тик (после enqueue с runAt ≈ now, чтобы не ждать poll). */
  kick(): void {
    void this.tick();
  }

  // --- внутреннее -----------------------------------------------------------

  private async tick(): Promise<void> {
    if (this.stopping || this.polling) return;
    this.polling = true;
    this.lastTickAt = new Date();
    try {
      const types = [...this.handlers.keys()];
      while (!this.stopping && this.running.size < this.config.workerConcurrency && types.length > 0) {
        const job = await this.jobs.claim(types);
        if (!job) break;
        // run() сам ловит всё; страховка на случай, если упало само применение исхода.
        const promise = this.run(job)
          .catch((error) => this.logger.error(`Job ${job.type}#${job.id?.slice(0, 8)}: ${describe(error)}`))
          .finally(() => this.running.delete(job.id));
        this.running.set(job.id, promise);
      }
    } catch (error) {
      this.logger.error(`Ошибка воркера: ${describe(error)}`);
    } finally {
      this.polling = false;
    }
  }

  private async run(job: AiJobEntity): Promise<void> {
    const handler = this.handlers.get(job.type);
    if (!handler) {
      await this.jobs.complete(job, 'failed', `Нет обработчика для ${job.type}`);
      return;
    }
    const ctx: JobContext = {
      job,
      heartbeat: (patch) => this.jobs.heartbeat(job.id, patch),
    };
    const label = `${job.type}#${job.id.slice(0, 8)}`;
    let outcome: JobOutcome;
    try {
      outcome = await handler(ctx);
    } catch (error) {
      outcome = { kind: 'retry', runAt: new Date(Date.now() + backoff(job.attempts)), error: describe(error) };
    }
    try {
      await this.apply(job, outcome, label);
    } catch (error) {
      // База недоступна в момент записи исхода — watchdog вернёт job по истечении блокировки.
      this.logger.error(`${label}: не удалось записать исход — ${describe(error)}`);
    }
  }

  private async apply(job: AiJobEntity, outcome: JobOutcome, label: string): Promise<void> {
    switch (outcome.kind) {
      case 'done':
        await this.jobs.complete(job, 'done');
        await this.requeueIfAsked(job);
        return;
      case 'cancelled':
        await this.jobs.complete(job, 'cancelled');
        return;
      case 'postpone':
        this.logger.log(`${label}: перенос на ${outcome.runAt.toISOString()} — ${outcome.reason}`);
        await this.jobs.postpone(job, outcome.runAt, outcome.reason, outcome.payload);
        return;
      case 'retry':
        if (job.attempts >= job.maxAttempts) {
          this.logger.error(`${label}: исчерпаны попытки — ${outcome.error}`);
          await this.jobs.complete(job, 'failed', outcome.error);
          return;
        }
        this.logger.warn(`${label}: попытка ${job.attempts}/${job.maxAttempts} не удалась — ${outcome.error}`);
        await this.jobs.reschedule(job, outcome.runAt, outcome.error);
        return;
      default:
        await this.jobs.complete(job, 'done');
    }
  }

  /** Пока job выполнялся, пришёл новый enqueue — ставим его заново. */
  private async requeueIfAsked(job: AiJobEntity): Promise<void> {
    const requeueAt = job.payload?.requeueAt;
    if (typeof requeueAt !== 'string') return;
    // Актуальный payload мог измениться за время выполнения — перечитываем.
    const fresh = await this.jobs.findLatestById(job.id);
    const at = typeof fresh?.payload?.requeueAt === 'string' ? fresh.payload.requeueAt : requeueAt;
    await this.jobs.enqueue({
      type: job.type,
      accountId: job.accountId,
      chatId: job.chatId,
      runAt: new Date(at),
      payload: {},
      maxAttempts: job.maxAttempts,
    });
  }

  private async watchdog(): Promise<void> {
    try {
      const released = await this.jobs.releaseStale();
      if (released > 0) this.logger.warn(`Watchdog вернул в очередь ${released} зависших job(ов)`);
    } catch (error) {
      this.logger.error(`Watchdog: ${describe(error)}`);
    }
  }
}

function backoff(attempt: number): number {
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1));
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
