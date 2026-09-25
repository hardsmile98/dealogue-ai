import { Injectable } from '@nestjs/common';
import type { TelegramChatEntity } from '../../telegram/entities/telegram-chat.entity.js';
import { TelegramAccountsRepository } from '../../telegram/repositories/telegram-accounts.repository.js';
import { TelegramChatsRepository } from '../../telegram/repositories/telegram-chats.repository.js';
import { TelegramMessagesRepository } from '../../telegram/repositories/telegram-messages.repository.js';
import { TelegramEventsService } from '../../telegram/runtime/telegram-events.service.js';
import { TelegramOutboundService } from '../../telegram/runtime/telegram-outbound.service.js';
import { TelegramIngestService } from '../../telegram/services/telegram-ingest.service.js';
import type { Channel } from '../core/channel.js';
import { OwnOutgoing } from '../core/telegram-inbox.js';

/**
 * `Channel` агента над Telegram-модулем (docs/agent-architecture.md,
 * раздел 8): отправка — через TelegramOutboundService, история — из
 * telegram_messages. Здесь же реестр своих исходящих: всё остальное
 * исходящее в чате агента написал человек.
 *
 * Канал живёт один ход (или один пересчёт лестницы), поэтому строка чата
 * читается им один раз, а не перед каждой частью, «печатает» и «прочитано».
 */
@Injectable()
export class BotTelegramChannels {
  /** Свои исходящие — всё остальное исходящее написал человек. */
  readonly own = new OwnOutgoing();
  /** Владелец аккаунта не меняется — в базу за ним ходим один раз. */
  private readonly owners = new Map<string, string>();

  constructor(
    private readonly outbound: TelegramOutboundService,
    private readonly ingest: TelegramIngestService,
    private readonly accounts: TelegramAccountsRepository,
    private readonly chats: TelegramChatsRepository,
    private readonly messages: TelegramMessagesRepository,
    private readonly events: TelegramEventsService,
  ) {}

  isOnline(accountId: string): boolean {
    return this.outbound.isOnline(accountId);
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
        const done = this.own.sending(chatId, text);
        try {
          const sent = await this.outbound.sendText(accountId, chat, text);
          this.own.sent(chatId, sent.id);
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
          return { messageId: sent.id };
        } finally {
          done();
        }
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
    };
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
