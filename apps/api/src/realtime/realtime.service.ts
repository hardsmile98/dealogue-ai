import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import type { RealtimeEvent } from './realtime.types.js';

const PING_MS = 25_000;

/**
 * Живые события для браузера: по одному потоку на пользователя (все его
 * вкладки делят поток). Поток создаётся с первым подписчиком и удаляется
 * с последним — отключившиеся пользователи не копятся в памяти.
 */
@Injectable()
export class RealtimeService implements OnModuleDestroy {
  private readonly streams = new Map<string, Subject<RealtimeEvent>>();
  private readonly pingTimer: NodeJS.Timeout;
  private subscribers = 0;

  constructor() {
    this.pingTimer = setInterval(
      () => this.broadcast({ type: 'ping', at: new Date().toISOString() }),
      PING_MS,
    );
  }

  onModuleDestroy(): void {
    clearInterval(this.pingTimer);
    for (const stream of this.streams.values()) stream.complete();
    this.streams.clear();
  }

  subscribe(userId: string): Observable<RealtimeEvent> {
    return new Observable<RealtimeEvent>((subscriber) => {
      let stream = this.streams.get(userId);
      if (!stream) {
        stream = new Subject<RealtimeEvent>();
        this.streams.set(userId, stream);
      }
      const subscription = stream.subscribe(subscriber);
      this.subscribers += 1;
      return () => {
        subscription.unsubscribe();
        this.subscribers -= 1;
        if (this.streams.get(userId) === stream && !stream.observed) {
          this.streams.delete(userId);
        }
      };
    });
  }

  publish(userId: string, event: RealtimeEvent): void {
    this.streams.get(userId)?.next(event);
  }

  /** Сколько подписчиков сейчас (для /health). */
  get connections(): number {
    return this.subscribers;
  }

  private broadcast(event: RealtimeEvent): void {
    for (const stream of this.streams.values()) stream.next(event);
  }
}
