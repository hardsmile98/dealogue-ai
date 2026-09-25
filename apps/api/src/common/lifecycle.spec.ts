import type { HttpAdapterHost } from '@nestjs/core';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { whenListening } from './lifecycle.js';

function fakeHost(listening: boolean) {
  const listen = new Subject<void>();
  const host = { listening, listen$: listen.asObservable() };
  return { host: host as unknown as HttpAdapterHost, listen };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('whenListening', () => {
  it('запускает работу только после того, как сервер занял порт', async () => {
    const { host, listen } = fakeHost(false);
    const start = vi.fn();
    whenListening(host, { error: vi.fn() }, 'Фон', start);
    await tick();
    expect(start).not.toHaveBeenCalled();
    listen.next();
    await tick();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('сервер уже слушает — запускает сразу', async () => {
    const { host } = fakeHost(true);
    const start = vi.fn();
    expect(whenListening(host, { error: vi.fn() }, 'Фон', start)).toBeNull();
    await tick();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('ошибка запуска — в лог, а не процессу', async () => {
    const { host, listen } = fakeHost(false);
    const logger = { error: vi.fn() };
    whenListening(host, logger, 'Запуск', () => {
      throw new Error('нет базы');
    });
    listen.next();
    await tick();
    expect(logger.error.mock.calls[0]?.[0]).toMatch(/^Запуск: .*нет базы/s);
  });

  it('отписка до listen — работа не запускается', async () => {
    const { host, listen } = fakeHost(false);
    const start = vi.fn();
    whenListening(host, { error: vi.fn() }, 'Фон', start)?.unsubscribe();
    listen.next();
    await tick();
    expect(start).not.toHaveBeenCalled();
  });
});
