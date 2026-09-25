import type { HttpAdapterHost } from '@nestjs/core';
import type { Subscription } from 'rxjs';
import { runDetached } from './async.js';
import type { ErrorSink } from './async.js';

/**
 * Запускает фоновую работу процесса (клиенты Telegram, поллеры, уборку),
 * когда HTTP-сервер уже занял порт. Второй экземпляр API на занятом порту
 * падает на `listen` раньше, чем поднимет клиентов на те же сессии
 * Telegram (AUTH_KEY_DUPLICATED) или заберёт задания из общей очереди.
 * В контексте без HTTP-сервера (скрипты в scripts/) работа не запускается.
 *
 * Ошибка запуска уходит в лог (runDetached). Возвращает подписку, чтобы её
 * можно было снять, если приложение закрывается, так и не начав слушать.
 */
export function whenListening(
  host: HttpAdapterHost,
  logger: ErrorSink,
  label: string,
  start: () => unknown,
): Subscription | null {
  const launch = () =>
    runDetached(Promise.resolve().then(start), logger, label);
  if (host.listening) {
    launch();
    return null;
  }
  return host.listen$.subscribe(launch);
}
