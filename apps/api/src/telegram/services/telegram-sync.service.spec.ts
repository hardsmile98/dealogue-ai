import type { Api, TelegramClient } from 'teleproto';
import { describe, expect, it } from 'vitest';
import type { TelegramChatEntity } from '../entities/telegram-chat.entity.js';
import type { TelegramMessageEntity } from '../entities/telegram-message.entity.js';
import type { TelegramConfig } from '../telegram.config.js';
import type { TelegramIngestService } from './telegram-ingest.service.js';
import { TelegramSyncService } from './telegram-sync.service.js';

const user = (id: number) => ({
  className: 'User',
  id: { toString: () => String(id) },
});

const message = (id: number, out = false) =>
  ({
    className: 'Message',
    id,
    out,
    message: `m${id}`,
  }) as unknown as Api.Message;

const chat = (patch: Partial<TelegramChatEntity>) =>
  ({
    id: `chat-${patch.peerId}`,
    historySynced: true,
    readOutboxMaxId: 0,
    lastTelegramMessageId: 0,
    ...patch,
  }) as TelegramChatEntity;

/** Досинхронизация с Telegram, где за время офлайна что-то произошло. */
function setup(options: {
  dialogs: { peer: number; top: number; readOutboxMaxId?: number }[];
  chats: TelegramChatEntity[];
  /** Что Telegram отдаст догрузкой по собеседнику. */
  fresh: Record<number, Api.Message[]>;
  /** Какие id уже были в базе (живое событие успело раньше). */
  known?: number[];
}) {
  const client = {
    getDialogs: async () =>
      options.dialogs.map((dialog) => ({
        isUser: true,
        entity: user(dialog.peer),
        message: message(dialog.top),
        dialog: { readOutboxMaxId: dialog.readOutboxMaxId ?? 0 },
      })),
    getMessages: async (peer: { id: { toString(): string } }) => {
      const list = [...(options.fresh[Number(peer.id.toString())] ?? [])];
      return Object.assign(list, { total: list.length });
    },
  } as unknown as TelegramClient;
  const synced: string[] = [];
  const ingest = {
    upsertChats: async () =>
      new Map(options.chats.map((row) => [row.peerId, row])),
    applyReadOutbox: async (row: TelegramChatEntity, maxId: number) => {
      row.readOutboxMaxId = maxId;
      return true;
    },
    storeMessages: async (_row: TelegramChatEntity, items: Api.Message[]) =>
      items
        .filter((item) => !(options.known ?? []).includes(item.id))
        .map(
          (item) => ({ telegramMessageId: item.id }) as TelegramMessageEntity,
        ),
    upsertChat: async () => {
      throw new Error('не нужен');
    },
  } as unknown as TelegramIngestService;
  const service = new TelegramSyncService(
    { recentDialogsLimit: 50, messagesLimit: 50 } as TelegramConfig,
    ingest,
  );
  // Новый диалог выгружается целиком — здесь достаточно знать, что это случилось.
  service.syncDialog = async (_account, _client, _user, known) => {
    synced.push(known?.peerId ?? '');
    return known as TelegramChatEntity;
  };
  return { service, client, synced };
}

describe('досинхронизация: пропущенное за офлайн уходит в шину', () => {
  it('новые сообщения по возрастанию id, без уже сохранённых', async () => {
    const { service, client } = setup({
      dialogs: [{ peer: 1, top: 12 }],
      chats: [chat({ peerId: '1', lastTelegramMessageId: 9 })],
      fresh: { 1: [message(12), message(11, true), message(10)] },
      known: [11],
    });
    const stats = await service.incrementalSync('acc', client);
    expect(stats.missed).toHaveLength(1);
    expect(stats.missed[0]?.messages.map((item) => item.id)).toEqual([10, 12]);
    expect(stats.missed[0]?.readMaxId).toBeNull();
  });

  it('прочтение за офлайн — событием, даже без новых сообщений', async () => {
    const { service, client } = setup({
      dialogs: [{ peer: 2, top: 5, readOutboxMaxId: 5 }],
      chats: [
        chat({ peerId: '2', lastTelegramMessageId: 5, readOutboxMaxId: 3 }),
      ],
      fresh: {},
    });
    const stats = await service.incrementalSync('acc', client);
    expect(stats.missed).toEqual([
      expect.objectContaining({ messages: [], readMaxId: 5 }),
    ]);
  });

  it('новый диалог (лид написал, пока API стоял) — последнее сообщение', async () => {
    const { service, client, synced } = setup({
      dialogs: [{ peer: 3, top: 7 }],
      chats: [chat({ peerId: '3', historySynced: false })],
      fresh: {},
    });
    const stats = await service.incrementalSync('acc', client);
    expect(synced).toEqual(['3']);
    expect(stats.missed[0]?.messages.map((item) => item.id)).toEqual([7]);
  });

  it('ничего не произошло — пусто', async () => {
    const { service, client } = setup({
      dialogs: [{ peer: 4, top: 20, readOutboxMaxId: 20 }],
      chats: [
        chat({ peerId: '4', lastTelegramMessageId: 20, readOutboxMaxId: 20 }),
      ],
      fresh: {},
    });
    const stats = await service.incrementalSync('acc', client);
    expect(stats.missed).toEqual([]);
  });
});
