import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelegramAccountEntity } from '../entities/telegram-account.entity.js';
import { TelegramChatEntity } from '../entities/telegram-chat.entity.js';
import { TelegramConfig } from '../telegram.config.js';
import { toAccountDto } from '../telegram.types.js';
import type { TelegramAccountDto } from '../telegram.types.js';
import { TelegramDialogStartsService } from './telegram-dialog-starts.service.js';
import { TelegramRuntimeService } from './telegram-runtime.service.js';

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
    @InjectRepository(TelegramAccountEntity)
    private readonly accounts: Repository<TelegramAccountEntity>,
    @InjectRepository(TelegramChatEntity)
    private readonly chats: Repository<TelegramChatEntity>,
  ) {}

  async list(userId: string): Promise<TelegramAccountDto[]> {
    const rows = await this.accounts.find({
      where: { userId },
      order: { connectedAt: 'ASC' },
    });
    const today = await this.newChatsToday(rows.map((row) => row.id));
    return rows.map((row) => toAccountDto(row, today.get(row.id) ?? 0));
  }

  async describe(account: TelegramAccountEntity): Promise<TelegramAccountDto> {
    const today = await this.newChatsToday([account.id]);
    return toAccountDto(account, today.get(account.id) ?? 0);
  }

  async remove(account: TelegramAccountEntity): Promise<void> {
    await this.runtime.stop(account.id, { logout: true });
    await this.accounts.delete({ id: account.id });
  }

  /** Аккаунт пользователя или 404: чужой аккаунт неотличим от несуществующего. */
  async requireAccount(
    userId: string,
    accountId: string,
  ): Promise<TelegramAccountEntity> {
    const account = await this.accounts.findOne({
      where: { id: accountId, userId },
    });
    if (!account) throw new NotFoundException('Аккаунт не найден');
    return account;
  }

  /** Чат внутри аккаунта или 404. */
  async requireChat(
    account: TelegramAccountEntity,
    chatId: string,
  ): Promise<TelegramChatEntity> {
    const chat = await this.chats.findOne({
      where: { id: chatId, accountId: account.id },
    });
    if (!chat) throw new NotFoundException('Чат не найден');
    return chat;
  }

  private newChatsToday(accountIds: string[]): Promise<Map<string, number>> {
    return this.dialogStarts.countToday(accountIds, this.config.timezone);
  }
}
