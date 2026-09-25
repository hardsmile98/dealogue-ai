import { Injectable } from '@nestjs/common';
import type { Api } from 'teleproto';
import type { TelegramChatEntity } from '../entities/telegram-chat.entity.js';
import type { TelegramMessageEntity } from '../entities/telegram-message.entity.js';
import {
  mediaKindOf,
  messageDirection,
  messageSentAt,
  messageText,
  peerFieldsOf,
} from '../lib/telegram-objects.js';
import type { PeerFields } from '../lib/telegram-objects.js';
import { TelegramChatsRepository } from '../repositories/telegram-chats.repository.js';
import type { ChatIngestUpdate } from '../repositories/telegram-chats.repository.js';
import { TelegramMessagesRepository } from '../repositories/telegram-messages.repository.js';
import type { MessageRow } from '../repositories/telegram-messages.repository.js';
import { TelegramDialogStartsService } from './telegram-dialog-starts.service.js';

export interface StoreMessagesOptions {
  /** Общее число сообщений в диалоге по данным Telegram (если известно). */
  total?: number;
  /** Самое первое сообщение диалога — фиксирует firstMessageAt и код. */
  firstMessage?: Api.Message | null;
}

/**
 * Запись чатов и сообщений в базу. Идемпотентна: повторная запись тех же
 * сообщений ничего не ломает. На одно живое сообщение уходит три запроса:
 * найти чат, вставить сообщение, обновить агрегаты чата одним UPDATE.
 */
@Injectable()
export class TelegramIngestService {
  constructor(
    private readonly chats: TelegramChatsRepository,
    private readonly messages: TelegramMessagesRepository,
    private readonly dialogStarts: TelegramDialogStartsService,
  ) {}

  async upsertChat(
    accountId: string,
    user: Api.User,
  ): Promise<TelegramChatEntity> {
    const chats = await this.upsertChats(accountId, [user]);
    const chat = chats.get(user.id.toString());
    if (!chat)
      throw new Error(`Чат с собеседником ${user.id.toString()} не сохранился`);
    return chat;
  }

  /**
   * Чаты для пачки собеседников: одним запросом находит известные, одним —
   * заводит новые, и только если имя, username или телефон поменялись,
   * обновляет строку. Ключ результата — peerId.
   */
  async upsertChats(
    accountId: string,
    users: Api.User[],
  ): Promise<Map<string, TelegramChatEntity>> {
    const peers = new Map<string, PeerFields>();
    for (const user of users) {
      const peer = peerFieldsOf(user);
      peers.set(peer.peerId, peer);
    }

    const byPeer = new Map<string, TelegramChatEntity>();
    for (const chat of await this.chats.findByPeers(accountId, [
      ...peers.keys(),
    ])) {
      byPeer.set(chat.peerId, chat);
    }

    const missing = [...peers.values()].filter(
      (peer) => !byPeer.has(peer.peerId),
    );
    if (missing.length > 0) {
      for (const chat of await this.chats.insertMissing(accountId, missing)) {
        byPeer.set(chat.peerId, chat);
      }
      // Остались те, кого параллельно успела завести другая запись.
      const raced = missing.filter((peer) => !byPeer.has(peer.peerId));
      for (const chat of await this.chats.findByPeers(
        accountId,
        raced.map((peer) => peer.peerId),
      )) {
        byPeer.set(chat.peerId, chat);
      }
    }

    for (const peer of peers.values()) {
      const chat = byPeer.get(peer.peerId);
      if (!chat || !peerChanged(chat, peer)) continue;
      const updated = await this.chats.updatePeer(chat.id, peer);
      if (updated) byPeer.set(peer.peerId, updated);
    }
    return byPeer;
  }

  /**
   * Сохраняет сообщения и обновляет агрегаты чата. Объект `chat` обновляется
   * на месте — вызывающий код (события, синхронизация) видит свежие значения.
   */
  async storeMessages(
    chat: TelegramChatEntity,
    items: Api.Message[],
    options: StoreMessagesOptions = {},
  ): Promise<void> {
    const inserted = await this.messages.insertMany(chat.id, uniqueRows(items));

    let first: ChatIngestUpdate['first'] = null;
    if (options.firstMessage) {
      const message = options.firstMessage;
      const direction = messageDirection(message);
      // Начало диалога со стороны собеседника — источник правды для статистики.
      const leadCode =
        direction === 'in'
          ? await this.dialogStarts.record(chat, message)
          : null;
      if (direction === 'out') await this.dialogStarts.clear(chat.id);
      first = {
        at: messageSentAt(message),
        telegramMessageId: message.id,
        direction,
        leadCode,
      };
    }

    await this.applyToChat(chat, inserted, options.total ?? 0, first);
  }

  /**
   * Исходящее, которое отправили мы сами (менеджер из веба): пишем сразу,
   * не дожидаясь эха от Telegram. Если эхо успело раньше — сообщение уже в
   * базе и учтено в агрегатах, отдаём сохранённую строку.
   */
  async storeOwnOutgoing(
    chat: TelegramChatEntity,
    message: Api.Message,
  ): Promise<TelegramMessageEntity> {
    const [row] = await this.messages.insertMany(chat.id, [
      toMessageRow(message),
    ]);
    if (row) {
      await this.applyToChat(chat, [row], 0, null);
      return row;
    }
    const existing = await this.messages.findByTelegramId(chat.id, message.id);
    if (!existing)
      throw new Error(`Не удалось сохранить исходящее #${message.id}`);
    return existing;
  }

  /**
   * Собеседник прочитал наши сообщения до `maxId`: отмечаем исходящие и
   * сдвигаем границу на чате. Отметка идемпотентна и идёт первой — если
   * сдвиг границы не запишется, следующее событие повторит всё целиком.
   * Возвращает true, если граница сдвинулась.
   */
  async applyReadOutbox(
    chat: TelegramChatEntity,
    maxId: number,
  ): Promise<boolean> {
    if (maxId <= chat.readOutboxMaxId) return false;
    await this.messages.markReadUpTo(chat.id, maxId);
    const advanced = await this.chats.advanceReadOutbox(chat.id, maxId);
    if (advanced) chat.readOutboxMaxId = maxId;
    return advanced;
  }

  private async applyToChat(
    chat: TelegramChatEntity,
    inserted: TelegramMessageEntity[],
    total: number,
    first: ChatIngestUpdate['first'],
  ): Promise<void> {
    // Все сообщения уже были в базе, а счётчик не отстаёт от Telegram — писать нечего.
    if (inserted.length === 0 && first === null && total <= chat.messagesCount)
      return;

    const newest = inserted.reduce<TelegramMessageEntity | null>(
      (best, row) => (best === null || isNewer(row, best) ? row : best),
      null,
    );
    const updated = await this.chats.applyIngest(chat.id, {
      inserted: inserted.length,
      newest: newest && {
        text: newest.text,
        sentAt: newest.sentAt,
        direction: newest.direction,
      },
      maxTelegramMessageId: Math.max(
        0,
        ...inserted.map((row) => row.telegramMessageId),
      ),
      total,
      first,
    });
    if (updated) Object.assign(chat, updated);
  }
}

function toMessageRow(message: Api.Message): MessageRow {
  return {
    telegramMessageId: message.id,
    direction: messageDirection(message),
    text: messageText(message),
    mediaKind: mediaKindOf(message.media),
    sentAt: messageSentAt(message),
  };
}

/** Последние N и самые первые сообщения короткого диалога пересекаются — дубли не шлём. */
function uniqueRows(items: Api.Message[]): MessageRow[] {
  const rows = new Map<number, MessageRow>();
  for (const message of items) rows.set(message.id, toMessageRow(message));
  return [...rows.values()];
}

/** Порядок переписки: по времени, при равенстве — по id Telegram. */
function isNewer(a: TelegramMessageEntity, b: TelegramMessageEntity): boolean {
  const diff = a.sentAt.getTime() - b.sentAt.getTime();
  return diff > 0 || (diff === 0 && a.telegramMessageId > b.telegramMessageId);
}

function peerChanged(chat: TelegramChatEntity, peer: PeerFields): boolean {
  return (
    chat.peerName !== peer.peerName ||
    chat.peerUsername !== peer.peerUsername ||
    chat.peerPhone !== peer.peerPhone ||
    (peer.peerAccessHash !== null &&
      chat.peerAccessHash !== peer.peerAccessHash)
  );
}
