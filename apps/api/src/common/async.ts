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
    logger.error(
      `${label}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
    );
  });
}
