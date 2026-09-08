import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import teleproto from 'teleproto';
import type { Api, TelegramClient } from 'teleproto';
import type { NewMessageEvent } from 'teleproto/events/NewMessage.js';
import { TelegramClientFactory, safeDestroy } from '../client/telegram-client.factory.js';
import { TelegramAccountEntity } from '../entities/telegram-account.entity.js';
import type { TelegramAccountStatus } from '../entities/telegram-account.entity.js';
import { SessionCrypto } from '../lib/session-crypto.js';
import {
  TelegramUnavailableError,
  describeError,
  isAuthLost,
  isFloodWait,
} from '../lib/telegram-errors.js';
import { TelegramConfig } from '../telegram.config.js';
import { TelegramIngestService } from './telegram-ingest.service.js';
import { TelegramSyncService } from './telegram-sync.service.js';

const { Api: Tl, events } = teleproto;

const AUTH_LOST_MESSAGE =
  'Сессия завершена на стороне Telegram. Переподключите аккаунт, чтобы продолжить отслеживание.';
const RETRY_BASE_MS = 15_000;
const RETRY_MAX_MS = 5 * 60_000;
const BOOT_STAGGER_MS = 700;
const LOGOUT_TIMEOUT_MS = 5_000;

interface LiveAccount {
  id: string;
  client: TelegramClient;
  handler: (event: NewMessageEvent) => void;
  resyncTimer: NodeJS.Timeout | null;
  syncing: Promise<void> | null;
  /** Диалоги, для которых уже запущена догрузка истории по живому событию. */
  pendingDialogs: Set<string>;
  stopped: boolean;
}

/**
 * Живые подключения: по одному клиенту teleproto на подключённый аккаунт.
 * Поднимает их при старте, ловит новые сообщения, по расписанию
 * досинхронизирует пропущенное, переподключается через другой MTProxy
 * при сбое и переводит аккаунт в «отключён», когда Telegram отзывает сессию.
 */
@Injectable()
export class TelegramRuntimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramRuntimeService.name);
  private readonly live = new Map<string, LiveAccount>();
  private readonly retryTimers = new Map<string, NodeJS.Timeout>();
  private readonly retryAttempts = new Map<string, number>();
  private readonly crypto: SessionCrypto;
  private shuttingDown = false;

  constructor(
    private readonly config: TelegramConfig,
    private readonly factory: TelegramClientFactory,
    private readonly sync: TelegramSyncService,
    private readonly ingest: TelegramIngestService,
    @InjectRepository(TelegramAccountEntity)
    private readonly accounts: Repository<TelegramAccountEntity>,
  ) {
    this.crypto = new SessionCrypto(config.sessionSecret || 'telegram-disabled');
  }

  async onModuleInit(): Promise<void> {
    if (!this.config.enabled) return;
    const rows = await this.accounts.find({
      where: { status: In<TelegramAccountStatus>(['connected', 'error']) },
      order: { connectedAt: 'ASC' },
    });
    this.logger.log(`Поднимаем ${rows.length} аккаунт(ов) Telegram`);
    // Не блокируем старт HTTP: аккаунты подключаются в фоне, с разбегом.
    void this.bootAll(rows);
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    for (const timer of this.retryTimers.values()) clearTimeout(timer);
    this.retryTimers.clear();
    await Promise.all([...this.live.keys()].map((id) => this.stop(id, { logout: false })));
  }

  isLive(accountId: string): boolean {
    return this.live.has(accountId);
  }

  /** Подключить только что авторизованный клиент (после sign-in / password). */
  async attach(account: TelegramAccountEntity, client: TelegramClient): Promise<void> {
    await this.stop(account.id, { logout: false });
    this.register(account, client);
  }

  /** Поднять аккаунт из сохранённой сессии. */
  async startFromRow(account: TelegramAccountEntity): Promise<void> {
    if (this.shuttingDown || this.live.has(account.id)) return;
    if (!account.sessionEncrypted) {
      await this.markDisconnected(account.id);
      return;
    }

    try {
      const { client, proxyIndex } = await this.factory.connect(
        this.crypto.decrypt(account.sessionEncrypted),
      );
      if (!(await client.isUserAuthorized())) {
        await safeDestroy(client);
        await this.markDisconnected(account.id);
        return;
      }
      this.retryAttempts.delete(account.id);
      this.logger.log(
        `Аккаунт ${account.phone}: подключён${this.config.proxies[proxyIndex] ? ` через MTProxy #${proxyIndex + 1}` : ''}`,
      );
      this.register(account, client);
    } catch (error) {
      if (isAuthLost(error)) {
        await this.markDisconnected(account.id);
        return;
      }
      const message =
        error instanceof TelegramUnavailableError ? error.message : describeError(error);
      await this.setStatus(account.id, 'error', message);
      this.scheduleRetry(account.id);
    }
  }

  async stop(accountId: string, options: { logout: boolean }): Promise<void> {
    const timer = this.retryTimers.get(accountId);
    if (timer) {
      clearTimeout(timer);
      this.retryTimers.delete(accountId);
    }

    const live = this.live.get(accountId);
    if (!live) return;
    live.stopped = true;
    this.live.delete(accountId);
    if (live.resyncTimer) clearInterval(live.resyncTimer);

    try {
      live.client.removeEventHandler(live.handler, new events.NewMessage({}));
    } catch {
      // Обработчик уже снят вместе с клиентом.
    }

    if (options.logout) {
      try {
        await withTimeout(live.client.invoke(new Tl.auth.LogOut()), LOGOUT_TIMEOUT_MS);
      } catch (error) {
        this.logger.warn(`Аккаунт ${accountId}: не удалось разлогиниться — ${describeError(error)}`);
      }
    }
    await safeDestroy(live.client);
  }

  // --- внутреннее -----------------------------------------------------------

  private async bootAll(rows: TelegramAccountEntity[]): Promise<void> {
    for (const row of rows) {
      if (this.shuttingDown) return;
      await this.startFromRow(row);
      await sleep(BOOT_STAGGER_MS);
    }
  }

  private register(account: TelegramAccountEntity, client: TelegramClient): void {
    const live: LiveAccount = {
      id: account.id,
      client,
      handler: () => undefined,
      resyncTimer: null,
      syncing: null,
      pendingDialogs: new Set(),
      stopped: false,
    };
    live.handler = (event) => {
      void this.onNewMessage(live, event);
    };
    this.live.set(account.id, live);

    client.addEventHandler(live.handler, new events.NewMessage({}));
    client.onError = async (error: Error) => {
      if (isAuthLost(error)) {
        await this.handleAuthLost(live);
      } else {
        this.logger.warn(`Аккаунт ${account.id}: ${describeError(error)}`);
      }
    };

    live.resyncTimer = setInterval(() => {
      void this.runSync(live, 'incremental');
    }, this.config.resyncIntervalMs);

    void this.runSync(live, account.historySynced ? 'incremental' : 'full');
  }

  private runSync(live: LiveAccount, mode: 'full' | 'incremental'): Promise<void> {
    if (live.syncing) return live.syncing;
    live.syncing = (async () => {
      try {
        if (mode === 'full') await this.sync.fullSync(live.id, live.client);
        else await this.sync.incrementalSync(live.id, live.client);
        if (!live.stopped) await this.setStatus(live.id, 'connected', null);
      } catch (error) {
        await this.handleFailure(live, error, mode === 'full' ? 'первичная синхронизация' : 'досинхронизация');
      } finally {
        live.syncing = null;
      }
    })();
    return live.syncing;
  }

  private async onNewMessage(live: LiveAccount, event: NewMessageEvent): Promise<void> {
    if (live.stopped || !event.isPrivate) return;
    const message = event.message;
    if (!message || message.className !== 'Message') return;

    try {
      const entity = (await event.getChat()) as { className?: string } | undefined;
      if (!entity || entity.className !== 'User') return;
      const user = entity as Api.User;
      if (user.bot || user.self || user.deleted) return;

      const chat = await this.ingest.upsertChat(live.id, user);
      if (chat.historySynced) {
        await this.ingest.storeMessages(chat, [message]);
        return;
      }

      // Новый для нас диалог: истории ещё нет, первое сообщение неизвестно —
      // забираем её целиком, но один раз, даже если сообщения сыплются пачкой.
      if (live.pendingDialogs.has(chat.peerId)) return;
      live.pendingDialogs.add(chat.peerId);
      try {
        await this.sync.syncDialog(live.id, live.client, user, chat);
      } finally {
        live.pendingDialogs.delete(chat.peerId);
      }
    } catch (error) {
      await this.handleFailure(live, error, 'обработка сообщения');
    }
  }

  private async handleFailure(live: LiveAccount, error: unknown, stage: string): Promise<void> {
    if (live.stopped) return;
    if (isAuthLost(error)) {
      await this.handleAuthLost(live);
      return;
    }
    const message = describeError(error);
    this.logger.warn(`Аккаунт ${live.id}: ${stage} — ${message}`);
    await this.setStatus(live.id, 'error', message);

    if (isFloodWait(error)) return; // подождём следующего цикла — библиотека сама выдержит паузу

    if (!live.client.connected) {
      // Соединение потеряно, а автопереподключение не справилось — пересоздаём клиент.
      await this.stop(live.id, { logout: false });
      this.scheduleRetry(live.id);
    }
  }

  private async handleAuthLost(live: LiveAccount): Promise<void> {
    if (live.stopped) return;
    this.logger.warn(`Аккаунт ${live.id}: сессия отозвана Telegram`);
    await this.stop(live.id, { logout: false });
    await this.markDisconnected(live.id);
  }

  private async markDisconnected(accountId: string): Promise<void> {
    await this.accounts.update(accountId, {
      status: 'disconnected',
      statusMessage: AUTH_LOST_MESSAGE,
      sessionEncrypted: null,
    });
  }

  private async setStatus(
    accountId: string,
    status: TelegramAccountStatus,
    statusMessage: string | null,
  ): Promise<void> {
    await this.accounts.update(accountId, { status, statusMessage });
  }

  private scheduleRetry(accountId: string): void {
    if (this.shuttingDown || this.retryTimers.has(accountId)) return;
    const attempt = this.retryAttempts.get(accountId) ?? 0;
    const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** attempt);
    this.retryAttempts.set(accountId, attempt + 1);
    this.logger.log(`Аккаунт ${accountId}: повторное подключение через ${Math.round(delay / 1000)} с`);

    const timer = setTimeout(async () => {
      this.retryTimers.delete(accountId);
      const row = await this.accounts.findOne({ where: { id: accountId } });
      if (!row || row.status === 'disconnected') return;
      await this.startFromRow(row);
    }, delay);
    this.retryTimers.set(accountId, timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Таймаут ${ms} мс`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
