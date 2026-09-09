import { Injectable, Logger } from '@nestjs/common';
import teleproto from 'teleproto';
import type { Api } from 'teleproto';
import type { TelegramChatEntity } from '../entities/telegram-chat.entity.js';
import { describeError } from '../lib/telegram-errors.js';
import { TelegramRuntimeService } from './telegram-runtime.service.js';

const { Api: Tl } = teleproto;

/** Сколько свежих диалогов просмотреть, если собеседник не резолвится иначе. */
const RESOLVE_DIALOGS_LIMIT = 50;

/** Аккаунт не подключён — отправлять не через что. */
export class AccountOfflineError extends Error {
  constructor(accountId: string) {
    super(`Аккаунт ${accountId} не подключён к Telegram`);
    this.name = 'AccountOfflineError';
  }
}

/** Не удалось построить InputPeer собеседника (нет access hash и нет в свежих диалогах). */
export class PeerUnresolvedError extends Error {
  constructor(peerId: string) {
    super(`Не удалось определить собеседника ${peerId} для отправки`);
    this.name = 'PeerUnresolvedError';
  }
}

/**
 * Исходящие действия от имени подключённого аккаунта: отправка текста,
 * «печатает…», отметка о прочтении, уведомление самому себе.
 * Единственное место, где приложение что-то пишет в Telegram.
 */
@Injectable()
export class TelegramOutboundService {
  private readonly logger = new Logger(TelegramOutboundService.name);

  constructor(private readonly runtime: TelegramRuntimeService) {}

  /** Отправить обычный текст (без markdown-разметки — как есть). */
  async sendText(accountId: string, chat: TelegramChatEntity, text: string): Promise<Api.Message> {
    const client = this.requireClient(accountId);
    const peer = await this.resolvePeer(accountId, chat);
    const result = await client.sendMessage(peer, {
      message: text,
      parseMode: false,
      linkPreview: false,
    });
    return result;
  }

  /** Показать или снять индикатор «печатает…». Ошибки глотаем — это косметика. */
  async setTyping(accountId: string, chat: TelegramChatEntity, on: boolean): Promise<void> {
    try {
      const client = this.requireClient(accountId);
      const peer = await this.resolvePeer(accountId, chat);
      await client.invoke(
        new Tl.messages.SetTyping({
          peer,
          action: on ? new Tl.SendMessageTypingAction() : new Tl.SendMessageCancelAction(),
        }),
      );
    } catch (error) {
      this.logger.debug(`Аккаунт ${accountId}: typing не удался — ${describeError(error)}`);
    }
  }

  /** Отметить диалог прочитанным. Ошибки глотаем. */
  async markRead(accountId: string, chat: TelegramChatEntity): Promise<void> {
    try {
      const client = this.requireClient(accountId);
      const peer = await this.resolvePeer(accountId, chat);
      await client.markAsRead(peer);
    } catch (error) {
      this.logger.debug(`Аккаунт ${accountId}: markAsRead не удался — ${describeError(error)}`);
    }
  }

  /**
   * Служебное сообщение от аккаунта: в «Избранное» (`'me'`) или указанному
   * собеседнику (@username / телефон). Используется для алертов менеджеру.
   */
  async sendToPeer(accountId: string, target: string, text: string): Promise<Api.Message> {
    const client = this.requireClient(accountId);
    const entity = target === 'me' || target === '' ? 'me' : target;
    return client.sendMessage(entity, { message: text, parseMode: false, linkPreview: false });
  }

  isOnline(accountId: string): boolean {
    return this.runtime.getClient(accountId) !== null;
  }

  // --- внутреннее -----------------------------------------------------------

  private requireClient(accountId: string) {
    const client = this.runtime.getClient(accountId);
    if (!client) throw new AccountOfflineError(accountId);
    return client;
  }

  /**
   * InputPeer собеседника: сначала кэш сущностей клиента (тёплый сразу после
   * входящего события), затем сохранённый access hash, в конце — скан свежих
   * диалогов (их ответ наполняет кэш).
   */
  private async resolvePeer(accountId: string, chat: TelegramChatEntity): Promise<Api.TypeInputPeer> {
    const client = this.requireClient(accountId);
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
    for (const handle of [chat.peerUsername ? `@${chat.peerUsername}` : null, chat.peerPhone].filter(Boolean)) {
      try {
        return await client.getInputEntity(handle as string);
      } catch {
        // пробуем следующий вариант
      }
    }
    const dialogs = await client.getDialogs({ limit: RESOLVE_DIALOGS_LIMIT });
    for (const dialog of dialogs) {
      const entity = dialog.entity as { className?: string; id?: { toString(): string } } | undefined;
      if (entity?.className === 'User' && entity.id?.toString() === chat.peerId) {
        return client.getInputEntity(entity as unknown as Api.User);
      }
    }
    throw new PeerUnresolvedError(chat.peerId);
  }
}
