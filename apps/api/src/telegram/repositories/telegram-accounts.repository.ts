import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { DeepPartial } from 'typeorm';
import { execute } from '../../database/sql.js';
import { TelegramAccountEntity } from '../entities/telegram-account.entity.js';
import type { TelegramAccountStatus } from '../entities/telegram-account.entity.js';

/**
 * Таблица telegram_accounts. Статусы меняются точечными UPDATE по id —
 * без чтения строки и без перезаписи чужих полей, поэтому рантайм,
 * синхронизация и вход не затирают изменения друг друга.
 */
@Injectable()
export class TelegramAccountsRepository {
  constructor(
    @InjectRepository(TelegramAccountEntity)
    private readonly accounts: Repository<TelegramAccountEntity>,
  ) {}

  listByUser(userId: string): Promise<TelegramAccountEntity[]> {
    return this.accounts.find({
      where: { userId },
      order: { connectedAt: 'ASC' },
    });
  }

  /** Аккаунт, если он принадлежит пользователю; чужой неотличим от несуществующего. */
  findOwned(
    userId: string,
    accountId: string,
  ): Promise<TelegramAccountEntity | null> {
    return this.accounts.findOne({ where: { id: accountId, userId } });
  }

  findById(accountId: string): Promise<TelegramAccountEntity | null> {
    return this.accounts.findOne({ where: { id: accountId } });
  }

  findByPhone(
    userId: string,
    phone: string,
  ): Promise<TelegramAccountEntity | null> {
    return this.accounts.findOne({ where: { userId, phone } });
  }

  /** Аккаунты, которые рантайм поднимает при старте. */
  findBootable(): Promise<TelegramAccountEntity[]> {
    return this.accounts.find({
      where: { status: In<TelegramAccountStatus>(['connected', 'error']) },
      order: { connectedAt: 'ASC' },
    });
  }

  create(fields: DeepPartial<TelegramAccountEntity>): TelegramAccountEntity {
    return this.accounts.create(fields);
  }

  /** Вход завершён: новая строка или обновлённая существующая целиком. */
  save(account: TelegramAccountEntity): Promise<TelegramAccountEntity> {
    return this.accounts.save(account);
  }

  /** Чаты, сообщения и начала диалогов уходят каскадом. */
  async delete(accountId: string): Promise<void> {
    await this.accounts.delete({ id: accountId });
  }

  /** Пишет статус, только если он изменился: плановые тики не гоняют пустые UPDATE. */
  async setStatus(
    accountId: string,
    status: TelegramAccountStatus,
    statusMessage: string | null,
  ): Promise<void> {
    await execute(
      this.accounts.manager,
      `UPDATE telegram_accounts
       SET status = $2::varchar, status_message = $3::text, updated_at = now()
       WHERE id = $1 AND (status, status_message) IS DISTINCT FROM ($2::varchar, $3::text)`,
      [accountId, status, statusMessage],
    );
  }

  /**
   * Синхронизация прошла: аккаунт на связи, время отметки обновлено, после
   * первичной выгрузки — история считается загруженной. Один UPDATE вместо
   * отдельных записей статуса и времени.
   */
  async recordSync(
    accountId: string,
    options: { full: boolean },
  ): Promise<void> {
    await execute(
      this.accounts.manager,
      `UPDATE telegram_accounts
       SET last_sync_at = now(),
           status = 'connected',
           status_message = NULL,
           history_synced = history_synced OR $2::boolean,
           updated_at = now()
       WHERE id = $1`,
      [accountId, options.full],
    );
  }

  /** Сессия отозвана: аккаунт ждёт переподключения, сессия стирается. */
  async markDisconnected(
    accountId: string,
    statusMessage: string,
  ): Promise<void> {
    await execute(
      this.accounts.manager,
      `UPDATE telegram_accounts
       SET status = 'disconnected', status_message = $2::text, session_encrypted = NULL, updated_at = now()
       WHERE id = $1`,
      [accountId, statusMessage],
    );
  }
}
