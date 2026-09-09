import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import type { Observable } from 'rxjs';
import type { Api } from 'teleproto';
import type { MessageDirection, TelegramChatEntity } from '../entities/telegram-chat.entity.js';

/** Новое сообщение (входящее или исходящее) уже сохранено в базе. */
export interface TelegramMessageEvent {
  kind: 'message';
  accountId: string;
  chat: TelegramChatEntity;
  message: Api.Message;
  direction: MessageDirection;
}

/** Клиент аккаунта поднят и готов принимать/отправлять сообщения. */
export interface TelegramAccountLiveEvent {
  kind: 'account-live';
  accountId: string;
}

/** Клиент аккаунта остановлен (ошибка, отзыв сессии, удаление). */
export interface TelegramAccountStoppedEvent {
  kind: 'account-stopped';
  accountId: string;
}

export type TelegramLiveEvent =
  | TelegramMessageEvent
  | TelegramAccountLiveEvent
  | TelegramAccountStoppedEvent;

/**
 * Шина живых событий Telegram. Модуль Telegram только публикует —
 * подписчики (например, ИИ-агент) живут в других модулях и не могут
 * своими ошибками сломать приём сообщений: `next` у Subject синхронный,
 * но каждый подписчик обязан ловить свои исключения сам.
 */
@Injectable()
export class TelegramEventsService {
  private readonly subject = new Subject<TelegramLiveEvent>();

  get events(): Observable<TelegramLiveEvent> {
    return this.subject.asObservable();
  }

  emit(event: TelegramLiveEvent): void {
    try {
      this.subject.next(event);
    } catch {
      // Подписчик бросил синхронно — приём сообщений от этого страдать не должен.
    }
  }
}
