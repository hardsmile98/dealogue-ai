import { Injectable, Logger } from '@nestjs/common';
import teleproto from 'teleproto';
import type { Api, TelegramClient } from 'teleproto';
import { withTimeout } from '../../common/async.js';
import type { TelegramChatEntity } from '../entities/telegram-chat.entity.js';
import {
  AccountOfflineError,
  PeerUnresolvedError,
  describeError,
} from '../lib/telegram-errors.js';
import { asUser } from '../lib/telegram-objects.js';
import { TelegramRuntimeService } from './telegram-runtime.service.js';

const { Api: Tl } = teleproto;

/** Сколько свежих диалогов просмотреть, если собеседник не резолвится иначе. */
const RESOLVE_DIALOGS_LIMIT = 50;
/**
 * У запросов teleproto нет своего таймаута: по «полуживому» соединению
 * отправка висела бы вечно вместе с HTTP-запросом менеджера.
 */
const SEND_TIMEOUT_MS = 30_000;
/** «Печатает…» и прочтение — косметика, ждать их долго незачем. */
const ACTION_TIMEOUT_MS = 10_000;

/**
 * Исходящие действия от имени подключённого аккаунта: отправка текста,
 * «печатает…», отметка о прочтении.
 * Единственное место, где приложение что-то пишет в Telegram.
 *
 * Ошибки — AccountOfflineError, PeerUnresolvedError, TimeoutError и
 * RPC-ошибки teleproto; для HTTP их переводит toHttpException.
 */
@Injectable()
export class TelegramOutboundService {
  private readonly logger = new Logger(TelegramOutboundService.name);

  constructor(private readonly runtime: TelegramRuntimeService) {}

  /** Отправить обычный текст (без markdown-разметки — как есть). */
  async sendText(
    accountId: string,
    chat: TelegramChatEntity,
    text: string,
  ): Promise<Api.Message> {
    const client = this.requireClient(accountId);
    return withTimeout(
      (async () => {
        const peer = await this.resolvePeer(client, chat);
        return client.sendMessage(peer, {
          message: text,
          parseMode: false,
          linkPreview: false,
        });
      })(),
      SEND_TIMEOUT_MS,
    );
  }

  /** Показать или снять индикатор «печатает…». Ошибки глотаем — это косметика. */
  async setTyping(
    accountId: string,
    chat: TelegramChatEntity,
    on: boolean,
  ): Promise<void> {
    try {
      const client = this.requireClient(accountId);
      await withTimeout(
        (async () => {
          const peer = await this.resolvePeer(client, chat);
          await client.invoke(
            new Tl.messages.SetTyping({
              peer,
              action: on
                ? new Tl.SendMessageTypingAction()
                : new Tl.SendMessageCancelAction(),
            }),
          );
        })(),
        ACTION_TIMEOUT_MS,
      );
    } catch (error) {
      this.logger.debug(
        `Аккаунт ${accountId}: typing не удался — ${describeError(error)}`,
      );
    }
  }

  /** Отметить диалог прочитанным. Ошибки глотаем. */
  async markRead(accountId: string, chat: TelegramChatEntity): Promise<void> {
    try {
      const client = this.requireClient(accountId);
      await withTimeout(
        (async () => {
          const peer = await this.resolvePeer(client, chat);
          await client.markAsRead(peer);
        })(),
        ACTION_TIMEOUT_MS,
      );
    } catch (error) {
      this.logger.debug(
        `Аккаунт ${accountId}: markAsRead не удался — ${describeError(error)}`,
      );
    }
  }

  isOnline(accountId: string): boolean {
    return this.runtime.getClient(accountId) !== null;
  }

  // --- внутреннее -----------------------------------------------------------

  private requireClient(accountId: string): TelegramClient {
    const client = this.runtime.getClient(accountId);
    if (!client) throw new AccountOfflineError(accountId);
    return client;
  }

  /**
   * InputPeer собеседника: сначала кэш сущностей клиента (тёплый сразу после
   * входящего события), затем сохранённый access hash, в конце — скан свежих
   * диалогов (их ответ наполняет кэш).
   */
  private async resolvePeer(
    client: TelegramClient,
    chat: TelegramChatEntity,
  ): Promise<Api.TypeInputPeer> {
    try {
      return await client.getInputEntity(chat.peerId);
    } catch {
      // Кэш пуст — идём дальше.
    }
    if (chat.peerAccessHash) {
      return new Tl.InputPeerUser({
        userId: teleproto.helpers.returnBigInt(chat.peerId),
        accessHash: teleproto.helpers.returnBigInt(chat.peerAccessHash),
      });
    }
    // Username и телефон резолвятся через Telegram без кэша.
    const handles = [
      chat.peerUsername ? `@${chat.peerUsername}` : null,
      chat.peerPhone,
    ];
    for (const handle of handles) {
      if (!handle) continue;
      try {
        return await client.getInputEntity(handle);
      } catch {
        // пробуем следующий вариант
      }
    }
    const dialogs = await client.getDialogs({ limit: RESOLVE_DIALOGS_LIMIT });
    for (const dialog of dialogs) {
      const user = asUser(dialog.entity);
      if (user && user.id.toString() === chat.peerId) {
        return client.getInputEntity(user);
      }
    }
    throw new PeerUnresolvedError(chat.peerId);
  }
}
