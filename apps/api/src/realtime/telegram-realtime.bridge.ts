import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Subscription } from 'rxjs';
import { TelegramEventsService } from '../telegram/runtime/telegram-events.service.js';
import type { TelegramLiveEvent } from '../telegram/runtime/telegram-events.service.js';
import { RealtimeService } from './realtime.service.js';

/**
 * Пересылает в браузер события Telegram, по которым веб обновляет переписку:
 * новое сообщение (входящее или исходящее) и прочтение наших исходящих.
 * Владелец аккаунта приходит в самом событии — в базу за ним не ходим.
 */
@Injectable()
export class TelegramRealtimeBridge implements OnModuleInit, OnModuleDestroy {
  private subscription: Subscription | null = null;

  constructor(
    private readonly events: TelegramEventsService,
    private readonly realtime: RealtimeService,
  ) {}

  onModuleInit(): void {
    this.subscription = this.events.subscribe((event) => this.forward(event));
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }

  private forward(event: TelegramLiveEvent): void {
    switch (event.kind) {
      case 'message':
        this.realtime.publish(event.userId, {
          type: 'message.created',
          accountId: event.accountId,
          chatId: event.chat.id,
        });
        return;
      case 'read':
        this.realtime.publish(event.userId, {
          type: 'message.read',
          accountId: event.accountId,
          chatId: event.chat.id,
          maxId: event.maxId,
        });
        return;
      default:
        return;
    }
  }
}
