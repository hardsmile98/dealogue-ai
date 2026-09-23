import { describe, expect, it, vi } from 'vitest';
import { TimeoutError, runDetached, withTimeout } from './async.js';

describe('withTimeout', () => {
  it('отдаёт результат, если промис успел', async () => {
    await expect(withTimeout(Promise.resolve(42), 50)).resolves.toBe(42);
  });

  it('пробрасывает ошибку самого промиса', async () => {
    const failure = new Error('сломалось');
    await expect(withTimeout(Promise.reject(failure), 50)).rejects.toBe(failure);
  });

  it('отказывает TimeoutError, если промис висит', async () => {
    const never = new Promise<never>(() => undefined);
    const result = withTimeout(never, 10);
    await expect(result).rejects.toBeInstanceOf(TimeoutError);
    await expect(result).rejects.toMatchObject({ ms: 10 });
  });
});

describe('runDetached', () => {
  it('пишет ошибку в лог, а не отдаёт её процессу', async () => {
    const logger = { error: vi.fn() };
    runDetached(Promise.reject(new Error('база недоступна')), logger, 'Фон');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0][0]).toMatch(/^Фон: .*база недоступна/s);
  });

  it('молчит, если задача завершилась успешно', async () => {
    const logger = { error: vi.fn() };
    runDetached(Promise.resolve(), logger, 'Фон');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(logger.error).not.toHaveBeenCalled();
  });
});
