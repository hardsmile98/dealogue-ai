import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';
import type { Observable, Subscription } from 'rxjs';
import type { Api } from 'teleproto';
import { errorDetail } from '../../common/errors.js';
import type {
  MessageDirection,
  TelegramChatEntity,
} from '../entities/telegram-chat.entity.js';

/** Общее у всех событий: чей аккаунт и кто его владелец. */
interface AccountScoped {
  accountId: string;
  /** Владелец аккаунта — подписчикам не нужно искать его в базе. */
  userId: string;
}

/** Новое сообщение (входящее или исходящее) уже сохранено в базе. */
export interface TelegramMessageEvent extends AccountScoped {
  kind: 'message';
  chat: TelegramChatEntity;
  message: Api.Message;
  direction: MessageDirection;
}

/** Собеседник прочитал наши исходящие до maxId включительно (read_at уже проставлен). */
export interface TelegramReadEvent extends AccountScoped {
  kind: 'read';
  chat: TelegramChatEntity;
  maxId: number;
}

/** Собеседник печатает — в базу не пишется, нужно для продления дебаунса. */
export interface TelegramTypingEvent extends AccountScoped {
  kind: 'typing';
  peerId: string;
}

/** Клиент аккаунта поднят и готов принимать/отправлять сообщения. */
export interface TelegramAccountLiveEvent extends AccountScoped {
  kind: 'account-live';
}

/** Клиент аккаунта остановлен (ошибка, отзыв сессии, удаление). */
export interface TelegramAccountStoppedEvent extends AccountScoped {
  kind: 'account-stopped';
}

export type TelegramLiveEvent =
  | TelegramMessageEvent
  | TelegramReadEvent
  | TelegramTypingEvent
  | TelegramAccountLiveEvent
  | TelegramAccountStoppedEvent;

export type TelegramEventHandler = (
  event: TelegramLiveEvent,
) => void | Promise<void>;

/**
 * Шина живых событий Telegram. Модуль Telegram только публикует, подписчики
 * (пересылка в браузер, Telegram-канал агента) живут в других модулях.
 *
 * Подписываться — через `subscribe`: ошибка обработчика (и синхронная, и
 * отклонённый промис) уходит в лог. У «сырого» `events` так не выйдет —
 * rxjs перебрасывает ошибку подписчика асинхронно, и необработанная роняет
 * процесс вместе со всеми подключениями.
 */
@Injectable()
export class TelegramEventsService {
  private readonly logger = new Logger(TelegramEventsService.name);
  private readonly subject = new Subject<TelegramLiveEvent>();

  /** Поток для rx-конвейеров; ошибки в нём подписчик обязан ловить сам. */
  get events(): Observable<TelegramLiveEvent> {
    return this.subject.asObservable();
  }

  subscribe(handler: TelegramEventHandler): Subscription {
    return this.subject.subscribe((event) => {
      try {
        const result = handler(event);
        if (result instanceof Promise) {
          result.catch((error: unknown) => this.logFailure(event, error));
        }
      } catch (error) {
        this.logFailure(event, error);
      }
    });
  }

  emit(event: TelegramLiveEvent): void {
    this.subject.next(event);
  }

  private logFailure(event: TelegramLiveEvent, error: unknown): void {
    this.logger.error(
      `Подписчик не обработал «${event.kind}» (аккаунт ${event.accountId}): ${errorDetail(error)}`,
    );
  }
}
