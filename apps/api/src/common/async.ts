import { errorDetail } from './errors.js';

/** Промис не завершился за отведённое время (сама операция при этом не отменяется). */
export class TimeoutError extends Error {
  constructor(readonly ms: number) {
    super(`Таймаут ${ms} мс`);
    this.name = 'TimeoutError';
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ограничивает ожидание промиса. Нужен там, где у библиотеки нет своего
 * таймаута: запрос к Telegram по «полуживому» соединению висит вечно.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Куда писать ошибки фоновых задач — Nest Logger подходит как есть. */
export interface ErrorSink {
  error(message: string): void;
}

/**
 * Запускает задачу «в фоне»: её ошибка уходит в лог, а не превращается в
 * unhandled rejection, который по умолчанию завершает процесс Node.
 */
export function runDetached(
  task: Promise<unknown>,
  logger: ErrorSink,
  label: string,
): void {
  task.catch((error: unknown) => {
    logger.error(`${label}: ${errorDetail(error)}`);
  });
}

/**
 * Очередь задач по ключу: задачи одного ключа идут строго друг за другом,
 * разных ключей — параллельно. Ошибка задачи достаётся её вызывающему и
 * не мешает следующей. Ключ без задач из памяти удаляется.
 */
export class KeyedLock {
  private readonly tails = new Map<string, Promise<unknown>>();

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(task);
    this.tails.set(key, current);
    current
      .finally(() => {
        if (this.tails.get(key) === current) this.tails.delete(key);
      })
      .catch(() => undefined);
    return current;
  }

  /** Сколько ключей сейчас заняты — для проверок. */
  get size(): number {
    return this.tails.size;
  }
}

/**
 * Не больше `limit` задач одновременно, остальные ждут своей очереди по
 * порядку. Ожидание можно оборвать сигналом — тогда задача не начнётся, а
 * промис отклонится причиной сигнала.
 */
export class Semaphore {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.acquire(signal);
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  /** Сколько задач выполняется и сколько ждут — для проверок и логов. */
  get stats(): { active: number; waiting: number } {
    return { active: this.active, waiting: this.waiting.length };
  }

  private acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        const index = this.waiting.indexOf(start);
        if (index >= 0) this.waiting.splice(index, 1);
        reject(signal?.reason);
      };
      const start = () => {
        signal?.removeEventListener('abort', onAbort);
        this.active += 1;
        resolve();
      };
      this.waiting.push(start);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  private release(): void {
    this.active -= 1;
    this.waiting.shift()?.();
  }
}
