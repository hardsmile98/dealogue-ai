import { sleep } from '../../common/async.js';
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
  sleep(ms: number): Promise<void>;
}

export class RealClock implements Clock {
  now(): Date {
    return new Date();
  }

  sleep(ms: number): Promise<void> {
    return sleep(ms);
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

  async sleep(ms: number): Promise<void> {
    this.time += Math.max(0, ms);
  }

  /** Перемотка к моменту; в прошлое не отматывает. */
  advanceTo(moment: Date): void {
    this.time = Math.max(this.time, moment.getTime());
  }
}
