import { Injectable, Logger } from '@nestjs/common';
import type { Api } from 'teleproto';
import { TimeoutError, withTimeout } from '../../common/async.js';
import { errorMessage } from '../../common/errors.js';
import type { TelegramChatEntity } from '../../telegram/entities/telegram-chat.entity.js';
import { TelegramAccountsRepository } from '../../telegram/repositories/telegram-accounts.repository.js';
import { TelegramChatsRepository } from '../../telegram/repositories/telegram-chats.repository.js';
import { TelegramMessagesRepository } from '../../telegram/repositories/telegram-messages.repository.js';
import { TelegramEventsService } from '../../telegram/runtime/telegram-events.service.js';
import {
  SEND_TIMEOUT_MS,
  TelegramOutboundService,
} from '../../telegram/runtime/telegram-outbound.service.js';
import { TelegramIngestService } from '../../telegram/services/telegram-ingest.service.js';
import type { Channel } from '../core/channel.js';
import { OwnOutgoing } from '../core/telegram-inbox.js';

/**
 * Сколько помнить зависшую отправку. Дольше соединение «полуживым» не
 * бывает: клиент Telegram либо отдаст ответ, либо переподключится и
 * отклонит запрос.
 */
const HUNG_SEND_MAX_MS = 10 * 60_000;

/**
 * `Channel` агента над Telegram-модулем (docs/agent-architecture.md,
 * раздел 8): отправка — через TelegramOutboundService, история — из
 * telegram_messages, имя клиента — из профиля собеседника (telegram_chats).
 * Здесь же реестр своих исходящих: всё остальное исходящее в чате агента
 * написал человек.
 *
 * Канал живёт один ход (или один пересчёт лестницы), поэтому строка чата
 * читается им один раз, а не перед каждой частью, «печатает» и «прочитано».
 */
@Injectable()
export class BotTelegramChannels {
  private readonly logger = new Logger(BotTelegramChannels.name);
  /** Свои исходящие — всё остальное исходящее написал человек. */
  readonly own = new OwnOutgoing();
  /** Владелец аккаунта не меняется — в базу за ним ходим один раз. */
  private readonly owners = new Map<string, string>();
  /**
   * Отправки, которые не уложились в таймаут и ещё могут дойти, — по чату и
   * тексту. Досылка того же текста ждёт их, а не шлёт второй раз.
   */
  private readonly hung = new Map<string, Promise<Api.Message>>();

  constructor(
    private readonly outbound: TelegramOutboundService,
    private readonly ingest: TelegramIngestService,
    private readonly accounts: TelegramAccountsRepository,
    private readonly chats: TelegramChatsRepository,
    private readonly messages: TelegramMessagesRepository,
    private readonly events: TelegramEventsService,
  ) {}

  /**
   * Канал готов к ходу: клиент подключён и первая синхронизация после
   * подключения прошла. Раньше база отстаёт от Telegram — можно напомнить
   * клиенту, который уже ответил, пока API стоял.
   */
  isReady(accountId: string): boolean {
    return this.outbound.isCaughtUp(accountId);
  }

  /** Почему канал не готов: `syncing` — подключён и догружает пропущенное. */
  unavailable(accountId: string): 'syncing' | 'offline' {
    return this.outbound.isOnline(accountId) ? 'syncing' : 'offline';
  }

  forAccount(accountId: string): Channel {
    const chats = new Map<string, Promise<TelegramChatEntity | null>>();
    const chatOf = (chatId: string): Promise<TelegramChatEntity | null> => {
      let chat = chats.get(chatId);
      if (!chat) {
        chat = this.chats.findOwned(accountId, chatId);
        chats.set(chatId, chat);
        // Сбой чтения не запоминаем — следующий вызов попробует снова.
        chat.catch(() => chats.delete(chatId));
      }
      return chat;
    };

    return {
      send: async (chatId, text) => {
        const chat = await chatOf(chatId);
        if (!chat) {
          throw new Error(`Чат ${chatId} не найден у аккаунта ${accountId}`);
        }
        const earlier = await this.awaitHung(chatId, text);
        if (earlier) return { messageId: earlier.id };
        return this.send(accountId, chat, text);
      },
      setTyping: async (chatId, on) => {
        const chat = await chatOf(chatId);
        if (chat) await this.outbound.setTyping(accountId, chat, on);
      },
      markRead: async (chatId) => {
        const chat = await chatOf(chatId);
        if (chat) await this.outbound.markRead(accountId, chat);
      },
      history: async (chatId, limit) => {
        const rows = await this.messages.page(chatId, null, limit);
        return rows.reverse().map((row) => ({
          id: row.telegramMessageId,
          direction: row.direction,
          text: row.text,
          mediaKind: row.mediaKind,
          sentAt: row.sentAt,
          readAt: row.readAt,
        }));
      },
      clientName: async (chatId) =>
        (await chatOf(chatId))?.peerName.trim() || null,
    };
  }

  /**
   * Отправка с таймаутом. Текст считается своим, пока идёт отправка, —
   * эхо от Telegram может прийти раньше ответа. Не уложилась в таймаут —
   * запрос не отменяется, а продолжает считаться своим до конца: дошёл
   * поздно — это наше сообщение (своё, записанное), а не сообщение
   * менеджера; досылка того же текста дождётся его (`awaitHung`).
   */
  private async send(
    accountId: string,
    chat: TelegramChatEntity,
    text: string,
  ): Promise<{ messageId: number }> {
    const done = this.own.sending(chat.id, text);
    const request = this.outbound.startSend(accountId, chat, text);
    let hung = false;
    try {
      const sent = await withTimeout(request, SEND_TIMEOUT_MS);
      await this.accept(accountId, chat, sent);
      return { messageId: sent.id };
    } catch (error) {
      if (error instanceof TimeoutError) {
        hung = true;
        this.watchHung(accountId, chat, text, request, done);
      }
      throw error;
    } finally {
      if (!hung) done();
    }
  }

  /** Зависшая отправка доводится в фоне: дошла — записываем её как свою. */
  private watchHung(
    accountId: string,
    chat: TelegramChatEntity,
    text: string,
    request: Promise<Api.Message>,
    done: () => void,
  ): void {
    const key = hungKey(chat.id, text);
    const tracked = request.then(async (sent) => {
      await this.accept(accountId, chat, sent);
      this.logger.warn(
        `Чат ${chat.id}: отправка дошла после таймаута (#${sent.id}) — записана как своя`,
      );
      return sent;
    });
    tracked.catch(() => undefined);
    this.hung.set(key, tracked);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      if (this.hung.get(key) === tracked) this.hung.delete(key);
      done();
    };
    const expire = setTimeout(release, HUNG_SEND_MAX_MS);
    expire.unref?.();
    tracked
      .finally(() => {
        clearTimeout(expire);
        release();
      })
      .catch(() => undefined);
  }

  /**
   * Прошлая отправка этого же текста зависла: ждём её не дольше обычного
   * таймаута. Дошла — её сообщение и есть ответ; не дошла — null, можно
   * отправлять; всё ещё висит — `TimeoutError`, досылка попробует позже.
   */
  private async awaitHung(
    chatId: string,
    text: string,
  ): Promise<Api.Message | null> {
    const earlier = this.hung.get(hungKey(chatId, text));
    if (!earlier) return null;
    try {
      return await withTimeout(earlier, SEND_TIMEOUT_MS);
    } catch (error) {
      if (error instanceof TimeoutError) throw error;
      return null;
    }
  }

  /**
   * Сообщение ушло: оно своё, в базе и в вебе. Сбой записи не делает его
   * неотправленным — эхо от Telegram запишет его позже, а повторять
   * отправку из-за этого нельзя.
   */
  private async accept(
    accountId: string,
    chat: TelegramChatEntity,
    sent: Api.Message,
  ): Promise<void> {
    this.own.sent(chat.id, sent.id);
    try {
      await this.ingest.storeOwnOutgoing(chat, sent);
      const userId = await this.ownerOf(accountId);
      if (userId) {
        // В веб — как любое исходящее; своё эхо канал узнает по id.
        this.events.emit({
          kind: 'message',
          accountId,
          userId,
          chat,
          message: sent,
          direction: 'out',
        });
      }
    } catch (error) {
      this.logger.warn(
        `Чат ${chat.id}: отправленное #${sent.id} не записано — ${errorMessage(error)}`,
      );
    }
  }

  private async ownerOf(accountId: string): Promise<string | null> {
    const known = this.owners.get(accountId);
    if (known) return known;
    const account = await this.accounts.findById(accountId);
    if (!account) return null;
    this.owners.set(accountId, account.userId);
    return account.userId;
  }
}

function hungKey(chatId: string, text: string): string {
  return `${chatId}\u0000${text}`;
}
