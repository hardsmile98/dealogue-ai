import type { Api } from 'teleproto';
import type { MessageDirection } from '../entities/telegram-chat.entity.js';
import type { MediaKind } from '../entities/telegram-message.entity.js';

/**
 * Разбор объектов Telegram API: собеседники, сообщения, вложения.
 * Только чистые функции — сверяются по `className`, поэтому тестируются
 * на простых объектах без живого клиента.
 */

/** Служебные аккаунты Telegram: уведомления (777000), Telegram Passport (42777). */
const SERVICE_USER_IDS = new Set(['777000', '42777']);

/** Пользователь из произвольной сущности teleproto или null, если это не User. */
export function asUser(entity: unknown): Api.User | null {
  const candidate = entity as { className?: string } | null | undefined;
  return candidate?.className === 'User' ? (entity as Api.User) : null;
}

/** Не человек-собеседник: бот, «Избранное», удалённый аккаунт, служба Telegram, поддержка. */
export function isNonHumanUser(user: Api.User): boolean {
  return Boolean(
    user.bot ||
    user.self ||
    user.deleted ||
    user.support ||
    SERVICE_USER_IDS.has(user.id.toString()),
  );
}

/** Диалог из getDialogs / iterDialogs — ровно те поля, что нужны синхронизации. */
export interface DialogLike {
  isUser: boolean;
  entity?: unknown;
  message?: Api.Message;
  /** Сырой Api.Dialog — оттуда берём, до какого id собеседник прочитал наши сообщения. */
  dialog?: { readOutboxMaxId?: number };
}

/** Личный собеседник-человек из диалога или null. */
export function privateUserOf(dialog: DialogLike): Api.User | null {
  if (!dialog.isUser) return null;
  const user = asUser(dialog.entity);
  return user && !isNonHumanUser(user) ? user : null;
}

/** Имя собеседника: «Имя Фамилия», иначе @username, иначе телефон. */
export function displayNameOf(user: Api.User): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  if (full) return full;
  if (user.username) return `@${user.username}`;
  if (user.phone) return `+${user.phone}`;
  return `Пользователь ${user.id.toString()}`;
}

/** Поля собеседника, которые хранит строка чата. */
export interface PeerFields {
  peerId: string;
  peerName: string;
  peerUsername: string | null;
  peerPhone: string | null;
  /** Нужен, чтобы писать собеседнику после перезапуска, когда кэш сущностей пуст. */
  peerAccessHash: string | null;
}

export function peerFieldsOf(user: Api.User): PeerFields {
  return {
    peerId: user.id.toString(),
    peerName: displayNameOf(user),
    peerUsername: user.username ?? null,
    peerPhone: user.phone ? `+${user.phone}` : null,
    peerAccessHash: user.accessHash ? user.accessHash.toString() : null,
  };
}

/** Вид вложения по медиа сообщения; null — текст без вложений. */
export function mediaKindOf(
  media: Api.TypeMessageMedia | undefined,
): MediaKind | null {
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
        if (attribute.className === 'DocumentAttributeSticker')
          return 'sticker';
        if (attribute.className === 'DocumentAttributeAudio') {
          return (attribute as Api.DocumentAttributeAudio).voice
            ? 'voice'
            : 'audio';
        }
        if (attribute.className === 'DocumentAttributeVideo') {
          return (attribute as Api.DocumentAttributeVideo).roundMessage
            ? 'video_note'
            : 'video';
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

export function messageSentAt(message: Api.Message): Date {
  return new Date(message.date * 1000);
}

/** Только обычные сообщения: сервисные («создал чат», «звонок») отбрасываем. */
export function onlyMessages(
  items: Iterable<Api.TypeMessage | undefined>,
): Api.Message[] {
  const result: Api.Message[] = [];
  for (const item of items) {
    if (item && item.className === 'Message') result.push(item as Api.Message);
  }
  return result;
}
