import { describe, expect, it, vi } from 'vitest';
import {
  KeyedLock,
  Semaphore,
  TimeoutError,
  runDetached,
  withTimeout,
} from './async.js';

describe('withTimeout', () => {
  it('отдаёт результат, если промис успел', async () => {
    await expect(withTimeout(Promise.resolve(42), 50)).resolves.toBe(42);
  });

  it('пробрасывает ошибку самого промиса', async () => {
    const failure = new Error('сломалось');
    await expect(withTimeout(Promise.reject(failure), 50)).rejects.toBe(
      failure,
    );
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

describe('KeyedLock', () => {
  const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => (resolve = done));
    return { promise, resolve };
  };

  it('задачи одного ключа идут по очереди', async () => {
    const lock = new KeyedLock();
    const order: string[] = [];
    const gate = deferred();
    const first = lock.run('chat', async () => {
      order.push('first:start');
      await gate.promise;
      order.push('first:end');
    });
    const second = lock.run('chat', async () => {
      order.push('second');
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual(['first:start']);
    gate.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(['first:start', 'first:end', 'second']);
  });

  it('разные ключи не ждут друг друга', async () => {
    const lock = new KeyedLock();
    const gate = deferred();
    const slow = lock.run('a', () => gate.promise);
    await expect(lock.run('b', async () => 'b')).resolves.toBe('b');
    gate.resolve();
    await slow;
  });

  it('ошибка достаётся своему вызывающему, следующая задача выполняется', async () => {
    const lock = new KeyedLock();
    const failed = lock.run('chat', async () => {
      throw new Error('упало');
    });
    const next = lock.run('chat', async () => 'дальше');
    await expect(failed).rejects.toThrow('упало');
    await expect(next).resolves.toBe('дальше');
  });

  it('свободный ключ не держится в памяти', async () => {
    const lock = new KeyedLock();
    await lock.run('chat', async () => undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(lock.size).toBe(0);
  });
});

describe('Semaphore', () => {
  const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => (resolve = done));
    return { promise, resolve };
  };
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('не больше limit задач одновременно, остальные — по очереди', async () => {
    const gate = new Semaphore(2);
    const order: string[] = [];
    const holds = [deferred(), deferred(), deferred()];
    const tasks = holds.map((hold, index) =>
      gate.run(async () => {
        order.push(`start:${index}`);
        await hold.promise;
      }),
    );
    await tick();
    expect(order).toEqual(['start:0', 'start:1']);
    expect(gate.stats).toEqual({ active: 2, waiting: 1 });
    holds[0]!.resolve();
    await tick();
    expect(order).toEqual(['start:0', 'start:1', 'start:2']);
    holds[1]!.resolve();
    holds[2]!.resolve();
    await Promise.all(tasks);
    expect(gate.stats).toEqual({ active: 0, waiting: 0 });
  });

  it('ошибка задачи освобождает место', async () => {
    const gate = new Semaphore(1);
    await expect(
      gate.run(async () => {
        throw new Error('упало');
      }),
    ).rejects.toThrow('упало');
    await expect(gate.run(async () => 'дальше')).resolves.toBe('дальше');
  });

  it('ожидание обрывается сигналом — задача не начинается', async () => {
    const gate = new Semaphore(1);
    const hold = deferred();
    const busy = gate.run(() => hold.promise);
    const controller = new AbortController();
    const started = vi.fn();
    const waiting = gate.run(async () => started(), controller.signal);
    controller.abort(new Error('остановка'));
    await expect(waiting).rejects.toThrow('остановка');
    hold.resolve();
    await busy;
    expect(started).not.toHaveBeenCalled();
    expect(gate.stats).toEqual({ active: 0, waiting: 0 });
  });
});
