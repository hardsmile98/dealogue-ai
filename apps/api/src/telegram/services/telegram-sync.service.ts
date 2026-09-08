import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Api, TelegramClient } from 'teleproto';
import { TelegramAccountEntity } from '../entities/telegram-account.entity.js';
import type { TelegramChatEntity } from '../entities/telegram-chat.entity.js';
import { TelegramConfig } from '../telegram.config.js';
import { TelegramIngestService, onlyMessages } from './telegram-ingest.service.js';

/** Пауза между диалогами при первичной выгрузке — чтобы не ловить FLOOD_WAIT. */
const DIALOG_PAUSE_MS = 150;
/** Сколько самых старых сообщений смотреть в поисках первого не-сервисного. */
const OLDEST_PROBE = 5;
/** Сколько сообщений догружать за раз при досинхронизации. */
const CATCH_UP_LIMIT = 200;

interface DialogLike {
  isUser: boolean;
  entity?: unknown;
  message?: Api.Message;
}

/** Служебные аккаунты Telegram: уведомления (777000), Telegram Passport (42777). */
const SERVICE_USER_IDS = new Set(['777000', '42777']);

/** Не человек-собеседник: бот, «Избранное», удалённый аккаунт, служба Telegram, поддержка. */
export function isNonHumanUser(user: Api.User): boolean {
  return Boolean(
    user.bot || user.self || user.deleted || user.support || SERVICE_USER_IDS.has(user.id.toString()),
  );
}

/** Личный собеседник-человек из диалога или null. */
export function privateUserOf(dialog: DialogLike): Api.User | null {
  if (!dialog.isUser) return null;
  const entity = dialog.entity as { className?: string } | undefined;
  if (!entity || entity.className !== 'User') return null;
  const user = entity as Api.User;
  return isNonHumanUser(user) ? null : user;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Выгрузка истории из Telegram в базу. Две стратегии:
 * - полная — при первом подключении: все личные диалоги, последние N
 *   сообщений и самое первое сообщение каждого;
 * - инкрементальная — по расписанию и после переподключения: свежие
 *   диалоги, догрузка того, что пропустили события.
 */
@Injectable()
export class TelegramSyncService {
  private readonly logger = new Logger(TelegramSyncService.name);

  constructor(
    private readonly config: TelegramConfig,
    private readonly ingest: TelegramIngestService,
    @InjectRepository(TelegramAccountEntity)
    private readonly accounts: Repository<TelegramAccountEntity>,
  ) {}

  async fullSync(accountId: string, client: TelegramClient): Promise<void> {
    let processed = 0;
    for await (const dialog of client.iterDialogs({ limit: this.config.dialogsLimit })) {
      const user = privateUserOf(dialog);
      if (!user) continue;
      await this.syncDialog(accountId, client, user);
      processed += 1;
      await sleep(DIALOG_PAUSE_MS);
    }
    await this.accounts.update(accountId, { historySynced: true, lastSyncAt: new Date() });
    this.logger.log(`Аккаунт ${accountId}: первичная синхронизация, диалогов ${processed}`);
  }

  async incrementalSync(accountId: string, client: TelegramClient): Promise<void> {
    const dialogs = await client.getDialogs({ limit: this.config.recentDialogsLimit });
    let caughtUp = 0;
    for (const dialog of dialogs) {
      const user = privateUserOf(dialog);
      if (!user) continue;
      const chat = await this.ingest.upsertChat(accountId, user);

      if (!chat.historySynced) {
        await this.syncDialog(accountId, client, user, chat);
        caughtUp += 1;
        continue;
      }

      const newestId = dialog.message?.id ?? 0;
      if (newestId > chat.lastTelegramMessageId) {
        const fresh = await client.getMessages(user, {
          minId: chat.lastTelegramMessageId,
          limit: CATCH_UP_LIMIT,
        });
        await this.ingest.storeMessages(chat, onlyMessages(fresh), { total: fresh.total });
        caughtUp += 1;
      }
    }
    await this.accounts.update(accountId, { lastSyncAt: new Date() });
    if (caughtUp > 0) {
      this.logger.log(`Аккаунт ${accountId}: досинхронизировано диалогов ${caughtUp}`);
    }
  }

  /** Один диалог: последние N сообщений плюс самое первое — для статистики. */
  async syncDialog(
    accountId: string,
    client: TelegramClient,
    user: Api.User,
    known?: TelegramChatEntity,
  ): Promise<TelegramChatEntity> {
    const chat = known ?? (await this.ingest.upsertChat(accountId, user));
    const latest = await client.getMessages(user, { limit: this.config.messagesLimit });
    const oldest = await client.getMessages(user, { limit: OLDEST_PROBE, reverse: true });
    const first = onlyMessages(oldest)[0] ?? null;
    await this.ingest.storeMessages(chat, [...onlyMessages(latest), ...onlyMessages(oldest)], {
      total: latest.total,
      firstMessage: first,
    });
    return chat;
  }
}
