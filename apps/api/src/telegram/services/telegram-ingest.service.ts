import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Api } from 'teleproto';
import { TelegramChatEntity } from '../entities/telegram-chat.entity.js';
import type { MessageDirection } from '../entities/telegram-chat.entity.js';
import { TelegramMessageEntity } from '../entities/telegram-message.entity.js';
import type { MediaKind } from '../entities/telegram-message.entity.js';
import { TelegramDialogStartsService } from './telegram-dialog-starts.service.js';

export interface StoreMessagesOptions {
  /** Общее число сообщений в диалоге по данным Telegram (если известно). */
  total?: number;
  /** Самое первое сообщение диалога — фиксирует firstMessageAt и код. */
  firstMessage?: Api.Message | null;
}

/** Имя собеседника: «Имя Фамилия», иначе @username, иначе телефон. */
export function displayNameOf(user: Api.User): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  if (full) return full;
  if (user.username) return `@${user.username}`;
  if (user.phone) return `+${user.phone}`;
  return `Пользователь ${user.id.toString()}`;
}

/** Вид вложения по медиа сообщения; null — текст без вложений. */
export function mediaKindOf(media: Api.TypeMessageMedia | undefined): MediaKind | null {
  if (!media) return null;
  switch (media.className) {
    case 'MessageMediaPhoto':
      return 'photo';
    case 'MessageMediaDocument': {
      const document = (media as Api.MessageMediaDocument).document;
      const attributes =
        document && document.className === 'Document'
          ? (document as Api.Document).attributes
          : [];
      for (const attribute of attributes) {
        if (attribute.className === 'DocumentAttributeSticker') return 'sticker';
        if (attribute.className === 'DocumentAttributeAudio') {
          return (attribute as Api.DocumentAttributeAudio).voice ? 'voice' : 'audio';
        }
        if (attribute.className === 'DocumentAttributeVideo') {
          return (attribute as Api.DocumentAttributeVideo).roundMessage ? 'video_note' : 'video';
        }
      }
      return 'document';
    }
    case 'MessageMediaWebPage':
      // Превью ссылки — это всё ещё текст.
      return null;
    default:
      return 'other';
  }
}

/** Подпись для сообщения без текста. */
export function describeMedia(media: Api.TypeMessageMedia | undefined): string {
  if (!media) return '[Сообщение]';
  switch (media.className) {
    case 'MessageMediaPhoto':
      return '[Фото]';
    case 'MessageMediaContact':
      return '[Контакт]';
    case 'MessageMediaGeo':
    case 'MessageMediaGeoLive':
    case 'MessageMediaVenue':
      return '[Геопозиция]';
    case 'MessageMediaPoll':
      return '[Опрос]';
    case 'MessageMediaDocument': {
      switch (mediaKindOf(media)) {
        case 'sticker':
          return '[Стикер]';
        case 'voice':
          return '[Голосовое сообщение]';
        case 'audio':
          return '[Аудио]';
        case 'video_note':
          return '[Видеосообщение]';
        case 'video':
          return '[Видео]';
        default:
          return '[Файл]';
      }
    }
    default:
      return '[Вложение]';
  }
}

export function messageText(message: Api.Message): string {
  const text = (message.message ?? '').trim();
  return text || describeMedia(message.media);
}

export function messageDirection(message: Api.Message): MessageDirection {
  return message.out ? 'out' : 'in';
}

/** Только обычные сообщения: сервисные («создал чат», «звонок») отбрасываем. */
export function onlyMessages(items: Iterable<Api.TypeMessage | undefined>): Api.Message[] {
  const result: Api.Message[] = [];
  for (const item of items) {
    if (item && item.className === 'Message') result.push(item as Api.Message);
  }
  return result;
}

/**
 * Запись чатов и сообщений в базу. Идемпотентна: повторная запись тех же
 * сообщений ничего не ломает (уникальный индекс + ON CONFLICT DO NOTHING).
 */
@Injectable()
export class TelegramIngestService {
  private readonly logger = new Logger(TelegramIngestService.name);

  constructor(
    @InjectRepository(TelegramChatEntity)
    private readonly chats: Repository<TelegramChatEntity>,
    @InjectRepository(TelegramMessageEntity)
    private readonly messages: Repository<TelegramMessageEntity>,
    private readonly dialogStarts: TelegramDialogStartsService,
  ) {}

  async upsertChat(accountId: string, user: Api.User): Promise<TelegramChatEntity> {
    const peerId = user.id.toString();
    const peerName = displayNameOf(user);
    const peerUsername = user.username ?? null;
    const peerPhone = user.phone ? `+${user.phone}` : null;
    // access hash нужен, чтобы писать собеседнику после перезапуска, когда кэш сущностей пуст.
    const peerAccessHash = user.accessHash ? user.accessHash.toString() : null;

    const existing = await this.chats.findOne({ where: { accountId, peerId } });
    if (existing) {
      if (
        existing.peerName !== peerName ||
        existing.peerUsername !== peerUsername ||
        existing.peerPhone !== peerPhone ||
        (peerAccessHash !== null && existing.peerAccessHash !== peerAccessHash)
      ) {
        existing.peerName = peerName;
        existing.peerUsername = peerUsername;
        existing.peerPhone = peerPhone;
        if (peerAccessHash !== null) existing.peerAccessHash = peerAccessHash;
        await this.chats.save(existing);
      }
      return existing;
    }

    try {
      return await this.chats.save(
        this.chats.create({ accountId, peerId, peerName, peerUsername, peerPhone, peerAccessHash }),
      );
    } catch (error) {
      // Гонка двух вставок (событие и синхронизация) — берём победителя.
      const winner = await this.chats.findOne({ where: { accountId, peerId } });
      if (winner) return winner;
      throw error;
    }
  }

  async storeMessages(
    chat: TelegramChatEntity,
    items: Api.Message[],
    options: StoreMessagesOptions = {},
  ): Promise<void> {
    const readMax = chat.readOutboxMaxId;
    const rows = items.map((message) => {
      const direction = messageDirection(message);
      return {
        chatId: chat.id,
        telegramMessageId: message.id,
        direction,
        text: messageText(message),
        mediaKind: mediaKindOf(message.media),
        sentAt: new Date(message.date * 1000),
        // Догруженное исходящее, которое собеседник уже прочитал, — сразу с отметкой.
        readAt: direction === 'out' && message.id <= readMax ? new Date() : null,
      };
    });

    if (rows.length > 0) {
      await this.messages
        .createQueryBuilder()
        .insert()
        .into(TelegramMessageEntity)
        .values(rows)
        .orIgnore()
        .execute();
    }

    await this.refreshAggregates(chat, options);
  }

  /**
   * Исходящее, которое отправили мы сами (менеджер из веба):
   * пишем сразу, не дожидаясь эха от Telegram. Эхо потом попадёт в ON CONFLICT.
   */
  async storeOwnOutgoing(chat: TelegramChatEntity, message: Api.Message): Promise<TelegramMessageEntity> {
    await this.messages
      .createQueryBuilder()
      .insert()
      .into(TelegramMessageEntity)
      .values({
        chatId: chat.id,
        telegramMessageId: message.id,
        direction: 'out',
        text: messageText(message),
        mediaKind: mediaKindOf(message.media),
        sentAt: new Date(message.date * 1000),
        readAt: null,
      })
      .orIgnore()
      .execute();
    await this.refreshAggregates(chat, {});
    const row = await this.messages.findOne({ where: { chatId: chat.id, telegramMessageId: message.id } });
    if (!row) throw new Error(`Не удалось сохранить исходящее #${message.id}`);
    return row;
  }

  /**
   * Собеседник прочитал наши сообщения до `maxId`: отмечаем исходящие и
   * запоминаем границу на чате. Возвращает true, если что-то изменилось.
   */
  async applyReadOutbox(chat: TelegramChatEntity, maxId: number): Promise<boolean> {
    if (maxId <= chat.readOutboxMaxId) return false;
    const now = new Date();
    await this.messages
      .createQueryBuilder()
      .update(TelegramMessageEntity)
      .set({ readAt: now })
      .where('chat_id = :chatId AND direction = :direction AND telegram_message_id <= :maxId AND read_at IS NULL', {
        chatId: chat.id,
        direction: 'out',
        maxId,
      })
      .execute();
    chat.readOutboxMaxId = maxId;
    await this.chats.update(chat.id, { readOutboxMaxId: maxId });
    return true;
  }

  /** Пересчитывает «последнее сообщение», счётчик и, если передано, первое сообщение. */
  async refreshAggregates(
    chat: TelegramChatEntity,
    options: StoreMessagesOptions,
  ): Promise<void> {
    const latest = await this.messages.findOne({
      where: { chatId: chat.id },
      order: { sentAt: 'DESC', telegramMessageId: 'DESC' },
    });
    const maxRow = await this.messages
      .createQueryBuilder('m')
      .select('COALESCE(MAX(m.telegram_message_id), 0)', 'max')
      .where('m.chat_id = :chatId', { chatId: chat.id })
      .getRawOne<{ max: string | number }>();
    const stored = await this.messages.count({ where: { chatId: chat.id } });

    if (latest) {
      chat.lastMessageText = latest.text;
      chat.lastMessageAt = latest.sentAt;
      chat.lastMessageDirection = latest.direction;
    }
    chat.lastTelegramMessageId = Number(maxRow?.max ?? 0);
    chat.messagesCount = Math.max(stored, options.total ?? 0);

    if (options.firstMessage) {
      const first = options.firstMessage;
      const direction = messageDirection(first);
      chat.firstMessageAt = new Date(first.date * 1000);
      chat.firstMessageId = first.id;
      chat.firstMessageDirection = direction;
      chat.historySynced = true;
      if (direction === 'in') {
        // Начало диалога со стороны собеседника — источник правды для статистики.
        chat.leadCode = await this.dialogStarts.record(chat, first);
      } else {
        chat.leadCode = null;
        await this.dialogStarts.clear(chat.id);
      }
    }

    await this.chats.save(chat);
    this.logger.debug(`Чат ${chat.id}: сообщений ${chat.messagesCount}, код ${chat.leadCode ?? '—'}`);
  }
}
