import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Subject } from 'rxjs';
import type { Observable } from 'rxjs';
import { Repository } from 'typeorm';
import { TelegramAccountEntity } from '../telegram/entities/telegram-account.entity.js';
import type { RealtimeEvent } from './realtime.types.js';

const PING_MS = 25_000;
const OWNER_CACHE_MS = 10 * 60_000;

/**
 * Живые события для браузера: по одному потоку на пользователя.
 * Публикация по accountId резолвит владельца через кэш.
 */
@Injectable()
export class RealtimeService implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly streams = new Map<string, Subject<RealtimeEvent>>();
  private readonly owners = new Map<string, { userId: string; at: number }>();
  private readonly pingTimer: NodeJS.Timeout;

  constructor(
    @InjectRepository(TelegramAccountEntity)
    private readonly accounts: Repository<TelegramAccountEntity>,
  ) {
    this.pingTimer = setInterval(() => this.broadcast({ type: 'ping', at: new Date().toISOString() }), PING_MS);
  }

  onModuleDestroy(): void {
    clearInterval(this.pingTimer);
    for (const stream of this.streams.values()) stream.complete();
    this.streams.clear();
  }

  subscribe(userId: string): Observable<RealtimeEvent> {
    let stream = this.streams.get(userId);
    if (!stream) {
      stream = new Subject<RealtimeEvent>();
      this.streams.set(userId, stream);
    }
    return stream.asObservable();
  }

  publish(userId: string, event: RealtimeEvent): void {
    this.streams.get(userId)?.next(event);
  }

  async publishForAccount(accountId: string, event: RealtimeEvent): Promise<void> {
    try {
      const userId = await this.ownerOf(accountId);
      if (userId) this.publish(userId, event);
    } catch (error) {
      this.logger.debug(`Не удалось опубликовать событие: ${error instanceof Error ? error.message : error}`);
    }
  }

  /** Сколько подписчиков сейчас (для /health). */
  get connections(): number {
    let total = 0;
    for (const stream of this.streams.values()) total += stream.observers.length;
    return total;
  }

  private broadcast(event: RealtimeEvent): void {
    for (const stream of this.streams.values()) stream.next(event);
  }

  private async ownerOf(accountId: string): Promise<string | null> {
    const cached = this.owners.get(accountId);
    if (cached && Date.now() - cached.at < OWNER_CACHE_MS) return cached.userId;
    const account = await this.accounts.findOne({ where: { id: accountId }, select: { id: true, userId: true } });
    if (!account) return null;
    this.owners.set(accountId, { userId: account.userId, at: Date.now() });
    return account.userId;
  }
}
