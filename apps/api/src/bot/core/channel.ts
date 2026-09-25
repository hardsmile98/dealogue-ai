import type { HistoryMessage } from './types.js';

/**
 * Ядро не знает, откуда пришли события и куда уходят сообщения
 * (docs/agent-architecture.md, раздел 8). Telegram
 * (services/bot-telegram-channels.service.ts) и песочница реализуют Channel
 * и Clock; события Telegram принимает services/bot-telegram.service.ts.
 * Планировщик, сборщик и доставка берут время только из Clock, поэтому в
 * песочнице задержки не ждутся.
 */

export interface Channel {
  send(chatId: string, text: string): Promise<{ messageId: number }>;
  setTyping(chatId: string, on: boolean): Promise<void>;
  markRead(chatId: string): Promise<void>;
  /** Последние сообщения чата по возрастанию времени, не больше `limit`. */
  history(chatId: string, limit: number): Promise<HistoryMessage[]>;
}

export interface Clock {
  now(): Date;
  /** Пауза; с `signal` — прерываемая остановкой API (`TurnInterrupted`). */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

/**
 * Ход остановлен выключением API в безопасной точке: пауза или обращение к
 * модели прерваны, начатая отправка в Telegram — нет. Это не сбой: журнал и
 * задания остаются как есть, после старта ход подхватит восстановление
 * (services/bot-recovery.service.ts) — повторит или дошлёт.
 */
export class TurnInterrupted extends Error {
  constructor() {
    super('ход прерван остановкой API');
    this.name = 'TurnInterrupted';
  }
}

/** Бросает `TurnInterrupted`, если API уже останавливается. */
export function throwIfInterrupted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new TurnInterrupted();
}

export class RealClock implements Clock {
  now(): Date {
    return new Date();
  }

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new TurnInterrupted());
        return;
      }
      const onAbort = () => {
        clearTimeout(timer);
        reject(new TurnInterrupted());
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}

/**
 * Виртуальные часы песочницы: `sleep` не ждёт, а сдвигает время — задержки
 * доставки становятся числами. Двигаются только вперёд.
 */
export class VirtualClock implements Clock {
  private time: number;

  constructor(start: Date) {
    this.time = start.getTime();
  }

  now(): Date {
    return new Date(this.time);
  }

  async sleep(ms: number, signal?: AbortSignal): Promise<void> {
    throwIfInterrupted(signal);
    this.time += Math.max(0, ms);
  }

  /** Перемотка к моменту; в прошлое не отматывает. */
  advanceTo(moment: Date): void {
    this.time = Math.max(this.time, moment.getTime());
  }
}
