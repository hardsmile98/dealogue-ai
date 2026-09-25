import { describe, expect, it, vi } from 'vitest';
import type { TelegramChatEntity } from '../../telegram/entities/telegram-chat.entity.js';
import type { TelegramAccountsRepository } from '../../telegram/repositories/telegram-accounts.repository.js';
import type { TelegramChatsRepository } from '../../telegram/repositories/telegram-chats.repository.js';
import type { TelegramMessagesRepository } from '../../telegram/repositories/telegram-messages.repository.js';
import type { TelegramEventsService } from '../../telegram/runtime/telegram-events.service.js';
import type { TelegramOutboundService } from '../../telegram/runtime/telegram-outbound.service.js';
import type { TelegramIngestService } from '../../telegram/services/telegram-ingest.service.js';
import { BotTelegramChannels } from './bot-telegram-channels.service.js';

const CHAT = { id: 'chat-1', accountId: 'acc-1' } as TelegramChatEntity;

function setup(chat: TelegramChatEntity | null = CHAT) {
  let ownDuringSend = false;
  let channels!: BotTelegramChannels;
  const outbound = {
    isOnline: vi.fn(() => true),
    sendText: vi.fn(
      async (_accountId: string, _chat: unknown, text: string) => {
        ownDuringSend = channels.own.isOwn('chat-1', -1, text);
        return { id: 501, message: text };
      },
    ),
    setTyping: vi.fn(async () => undefined),
    markRead: vi.fn(async () => undefined),
  };
  const ingest = { storeOwnOutgoing: vi.fn(async () => ({})) };
  const accounts = {
    findById: vi.fn(async () => ({ id: 'acc-1', userId: 'user-1' })),
  };
  const chats = { findOwned: vi.fn(async () => chat) };
  const messages = { page: vi.fn(async () => []) };
  const events = { emit: vi.fn() };
  channels = new BotTelegramChannels(
    outbound as unknown as TelegramOutboundService,
    ingest as unknown as TelegramIngestService,
    accounts as unknown as TelegramAccountsRepository,
    chats as unknown as TelegramChatsRepository,
    messages as unknown as TelegramMessagesRepository,
    events as unknown as TelegramEventsService,
  );
  return {
    channels,
    outbound,
    ingest,
    accounts,
    chats,
    events,
    ownDuringSend: () => ownDuringSend,
  };
}

describe('BotTelegramChannels', () => {
  it('отправка: своё исходящее узнаётся и во время отправки, и по id после', async () => {
    const t = setup();
    const channel = t.channels.forAccount('acc-1');
    await expect(channel.send('chat-1', 'Привет')).resolves.toEqual({
      messageId: 501,
    });
    expect(t.ownDuringSend()).toBe(true);
    expect(t.channels.own.isOwn('chat-1', 501, 'другой текст')).toBe(true);
    expect(t.channels.own.isOwn('chat-1', 777, 'Привет')).toBe(false);
    expect(t.ingest.storeOwnOutgoing).toHaveBeenCalledWith(CHAT, {
      id: 501,
      message: 'Привет',
    });
    expect(t.events.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'message',
        accountId: 'acc-1',
        userId: 'user-1',
        direction: 'out',
      }),
    );
  });

  it('строка чата читается один раз на канал, владелец аккаунта — один раз вообще', async () => {
    const t = setup();
    const channel = t.channels.forAccount('acc-1');
    await channel.markRead('chat-1');
    await channel.setTyping('chat-1', true);
    await channel.send('chat-1', 'раз');
    await channel.send('chat-1', 'два');
    expect(t.chats.findOwned).toHaveBeenCalledTimes(1);
    await t.channels.forAccount('acc-1').send('chat-1', 'три');
    expect(t.chats.findOwned).toHaveBeenCalledTimes(2);
    expect(t.accounts.findById).toHaveBeenCalledTimes(1);
  });

  it('чужой или удалённый чат: отправка — ошибка, «печатает» и прочтение — молча', async () => {
    const t = setup(null);
    const channel = t.channels.forAccount('acc-1');
    await expect(channel.send('chat-1', 'текст')).rejects.toThrow(
      /не найден у аккаунта acc-1/,
    );
    await channel.setTyping('chat-1', true);
    await channel.markRead('chat-1');
    expect(t.outbound.setTyping).not.toHaveBeenCalled();
    expect(t.outbound.markRead).not.toHaveBeenCalled();
    expect(t.channels.own.isOwn('chat-1', 0, 'текст')).toBe(false);
  });

  it('сбой отправки снимает текст из «отправляется сейчас»', async () => {
    const t = setup();
    t.outbound.sendText.mockRejectedValueOnce(new Error('offline'));
    await expect(
      t.channels.forAccount('acc-1').send('chat-1', 'упадёт'),
    ).rejects.toThrow('offline');
    expect(t.channels.own.isOwn('chat-1', 0, 'упадёт')).toBe(false);
    expect(t.events.emit).not.toHaveBeenCalled();
  });
});
