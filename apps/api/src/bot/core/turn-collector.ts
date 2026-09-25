import type { IncomingMessage } from './types.js';

export interface QuietOptions {
  /** Окно тишины после этого сообщения, мс (уже со случайностью). */
  quietMs: number;
  /** Верхняя граница ожидания от первого сообщения хода, мс. */
  maxMs: number;
}

interface Pending {
  messages: IncomingMessage[];
  firstAt: number;
  deadline: number;
  hardDeadline: number;
}

/**
 * Сборщик хода (раздел 3.2): копит сообщения клиента, пока тот не затихнет.
 * Время получает снаружи, поэтому одинаково работает с реальными и
 * виртуальными часами. У каждого чата счётчик поколений: новое сообщение
 * во время генерации увеличивает его, и результат со старым номером
 * выбрасывается (`isStale`).
 */
export class TurnCollector {
  private readonly pending = new Map<string, Pending>();
  private readonly generation = new Map<string, number>();

  /** Сообщение клиента: открывает или продлевает окно тишины и увеличивает поколение. */
  push(chatId: string, message: IncomingMessage, now: Date, options: QuietOptions): number {
    const at = now.getTime();
    const current = this.pending.get(chatId);
    if (current) {
      current.messages.push(message);
      current.deadline = Math.min(at + options.quietMs, current.hardDeadline);
    } else {
      this.pending.set(chatId, {
        messages: [message],
        firstAt: at,
        deadline: at + options.quietMs,
        hardDeadline: at + options.maxMs,
      });
    }
    return this.bump(chatId);
  }

  /** «Печатает»: продлевает окно, но не поколение — текста ещё нет. */
  typing(chatId: string, now: Date, extendMs: number): void {
    const current = this.pending.get(chatId);
    if (!current) return;
    current.deadline = Math.min(Math.max(current.deadline, now.getTime() + extendMs), current.hardDeadline);
  }

  /** Чаты, у которых окно тишины закрылось. */
  due(now: Date): string[] {
    const at = now.getTime();
    const ready: string[] = [];
    for (const [chatId, pending] of this.pending) {
      if (pending.deadline <= at) ready.push(chatId);
    }
    return ready;
  }

  /** Забирает собранный ход; сообщения, пришедшие после, пойдут в следующий. */
  take(chatId: string): { messages: IncomingMessage[]; generationSeq: number } | null {
    const pending = this.pending.get(chatId);
    if (!pending) return null;
    this.pending.delete(chatId);
    return { messages: pending.messages, generationSeq: this.generation.get(chatId) ?? 0 };
  }

  /** Сообщение, пришедшее после закрытия окна, но до начала генерации, включается в ход. */
  drain(chatId: string): IncomingMessage[] {
    const pending = this.pending.get(chatId);
    if (!pending) return [];
    this.pending.delete(chatId);
    return pending.messages;
  }

  /**
   * Чат ушёл менеджеру: собранное выбрасывается, идущий ход становится
   * устаревшим и останавливается на ближайшей проверке.
   */
  invalidate(chatId: string): void {
    this.pending.delete(chatId);
    this.bump(chatId);
  }

  hasPending(chatId: string): boolean {
    return this.pending.has(chatId);
  }

  currentGeneration(chatId: string): number {
    return this.generation.get(chatId) ?? 0;
  }

  isStale(chatId: string, generationSeq: number): boolean {
    return this.currentGeneration(chatId) !== generationSeq;
  }

  private bump(chatId: string): number {
    const next = (this.generation.get(chatId) ?? 0) + 1;
    this.generation.set(chatId, next);
    return next;
  }
}
