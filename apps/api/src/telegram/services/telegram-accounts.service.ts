import { Injectable, NotFoundException } from '@nestjs/common';
import type { TelegramAccountEntity } from '../entities/telegram-account.entity.js';
import type { TelegramChatEntity } from '../entities/telegram-chat.entity.js';
import { TelegramAccountsRepository } from '../repositories/telegram-accounts.repository.js';
import { TelegramChatsRepository } from '../repositories/telegram-chats.repository.js';
import { TelegramRuntimeService } from '../runtime/telegram-runtime.service.js';
import { TelegramConfig } from '../telegram.config.js';
import { toAccountDto } from '../telegram.types.js';
import type { TelegramAccountDto } from '../telegram.types.js';
import { TelegramDialogStartsService } from './telegram-dialog-starts.service.js';

/** Аккаунт и, если в пути был `:chatId`, чат — оба уже проверены на владение. */
export interface AccountAccess {
  account: TelegramAccountEntity;
  chat: TelegramChatEntity | null;
}

/**
 * Аккаунты пользователя: список, карточка, удаление — и единая точка
 * проверки владения аккаунтом и чатом (её вызывает AccountAccessGuard).
 */
@Injectable()
export class TelegramAccountsService {
  constructor(
    private readonly config: TelegramConfig,
    private readonly runtime: TelegramRuntimeService,
    private readonly dialogStarts: TelegramDialogStartsService,
    private readonly accounts: TelegramAccountsRepository,
    private readonly chats: TelegramChatsRepository,
  ) {}

  async list(userId: string): Promise<TelegramAccountDto[]> {
    const rows = await this.accounts.listByUser(userId);
    const today = await this.newChatsToday(rows.map((row) => row.id));
    return rows.map((row) => toAccountDto(row, today.get(row.id) ?? 0));
  }

  async describe(account: TelegramAccountEntity): Promise<TelegramAccountDto> {
    const today = await this.newChatsToday([account.id]);
    return toAccountDto(account, today.get(account.id) ?? 0);
  }

  async remove(account: TelegramAccountEntity): Promise<void> {
    await this.runtime.stop(account.id, { logout: true });
    await this.accounts.delete(account.id);
  }

  /**
   * Аккаунт и чат одним заходом: оба запроса идут параллельно, поэтому
   * проверка доступа к переписке стоит одного обращения к базе по времени.
   * Чат ищется только внутри аккаунта из пути, а решение принимается по
   * аккаунту первым — чужой чат наружу не просочится.
   */
  async requireAccess(
    userId: string,
    accountId: string,
    chatId?: string,
  ): Promise<AccountAccess> {
    const [account, chat] = await Promise.all([
      this.accounts.findOwned(userId, accountId),
      chatId === undefined ? null : this.chats.findOwned(accountId, chatId),
    ]);
    if (!account) throw new NotFoundException('Аккаунт не найден');
    if (chatId !== undefined && !chat)
      throw new NotFoundException('Чат не найден');
    return { account, chat };
  }

  private newChatsToday(accountIds: string[]): Promise<Map<string, number>> {
    return this.dialogStarts.countToday(accountIds, this.config.timezone);
  }
}
