import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Subscription } from 'rxjs';
import { TelegramEventsService } from '../telegram/services/telegram-events.service.js';
import type { TelegramLiveEvent } from '../telegram/services/telegram-events.service.js';
import { RealtimeService } from './realtime.service.js';

/**
 * Пересылает в браузер события Telegram, по которым веб обновляет переписку:
 * новое сообщение (входящее или исходящее) и прочтение наших исходящих.
 */
@Injectable()
export class TelegramRealtimeBridge implements OnModuleInit, OnModuleDestroy {
  private subscription: Subscription | null = null;

  constructor(
    private readonly events: TelegramEventsService,
    private readonly realtime: RealtimeService,
  ) {}

  onModuleInit(): void {
    this.subscription = this.events.events.subscribe((event) =>
      this.forward(event),
    );
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }

  private forward(event: TelegramLiveEvent): void {
    switch (event.kind) {
      case 'message':
        void this.realtime.publishForAccount(event.accountId, {
          type: 'message.created',
          accountId: event.accountId,
          chatId: event.chat.id,
        });
        return;
      case 'read':
        void this.realtime.publishForAccount(event.accountId, {
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
