import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import teleproto from 'teleproto';
import type { TelegramClient } from 'teleproto';
import { UpdateConnectionState } from 'teleproto/network/UpdateConnectionState.js';
import { runDetached, sleep, withTimeout } from '../../common/async.js';
import {
  TelegramClientFactory,
  safeDestroy,
} from '../client/telegram-client.factory.js';
import type {
  TelegramAccountEntity,
  TelegramAccountStatus,
} from '../entities/telegram-account.entity.js';
import { SessionCrypto } from '../lib/session-crypto.js';
import {
  AUTH_LOST_MESSAGE,
  describeError,
  isAuthLost,
  isFloodWait,
} from '../lib/telegram-errors.js';
import { TelegramAccountsRepository } from '../repositories/telegram-accounts.repository.js';
import { TelegramSyncService } from '../services/telegram-sync.service.js';
import type { SyncStats } from '../services/telegram-sync.service.js';
import { TelegramConfig } from '../telegram.config.js';
import {
  formatDuration,
  formatHealth,
  inspectClient,
  syncStageName,
} from './live-account.js';
import type { LiveAccount, SyncMode } from './live-account.js';
import { TelegramEventsService } from './telegram-events.service.js';
import { TelegramUpdatesService } from './telegram-updates.service.js';

const { Api: Tl, events } = teleproto;

const RETRY_BASE_MS = 15_000;
const RETRY_MAX_MS = 5 * 60_000;
/** Разбег между запусками аккаунтов при старте — чтобы не бить в прокси пачкой. */
const BOOT_STAGGER_MS = 700;
const LOGOUT_TIMEOUT_MS = 5_000;
/** Сколько ждать первый запрос (getMe) сразу после подключения. */
const PROBE_TIMEOUT_MS = 30_000;

/**
 * Сторожевые пороги. У запросов teleproto нет собственного таймаута: если
 * соединение «полуживое» (TCP открыт, ответы не приходят) или библиотека
 * застряла в reconnecting, промис запроса висит вечно — вместе с ним висела
 * бы и вся досинхронизация аккаунта до перезапуска процесса.
 */
/** Дольше этого досинхронизация считается зависшей — клиент пересоздаётся. */
const INCREMENTAL_SYNC_TIMEOUT_MS = 5 * 60_000;
/** Первичная выгрузка сотен диалогов идёт долго, но не бесконечно. */
const FULL_SYNC_TIMEOUT_MS = 60 * 60_000;
/**
 * Столько молчания от Telegram считаем мёртвым соединением. В норме teleproto
 * пингует DC каждые 9 с и получает pong, а досинхронизация ходит раз в
 * `TELEGRAM_RESYNC_INTERVAL_SEC` — тишина в 5 минут возможна только при
 * сломанном сокете или умершем цикле обновлений.
 */
const SILENCE_LIMIT_MS = 5 * 60_000;
/** Сколько подряд проверок клиент может «переподключаться», прежде чем пересоздадим его сами. */
const OFFLINE_TICKS_LIMIT = 2;
/** Досинхронизация дольше этого — повод для предупреждения в логе. */
const SLOW_SYNC_WARN_MS = 60_000;

/**
 * Живые подключения: по одному клиенту teleproto на подключённый аккаунт.
 * Поднимает их при старте, по расписанию досинхронизирует пропущенное,
 * переподключается через другой MTProxy при сбое и переводит аккаунт в
 * «отключён», когда Telegram отзывает сессию. Приём апдейтов —
 * TelegramUpdatesService, здесь только жизненный цикл.
 *
 * Каждый плановый тик — ещё и проверка здоровья: зависшая синхронизация,
 * долгое молчание соединения или мёртвый sender приводят к пересозданию
 * клиента, а не к тихому простою до перезапуска процесса.
 *
 * Всё, что работает в фоне (таймеры, обработчики, повторы), ловит свои
 * ошибки: временно недоступная база не должна ронять процесс.
 */
@Injectable()
export class TelegramRuntimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramRuntimeService.name);
  private readonly live = new Map<string, LiveAccount>();
  /** Аккаунты, которые прямо сейчас подключаются, — второй клиент на ту же сессию недопустим. */
  private readonly starting = new Set<string>();
  /** Остановлены, пока подключались (удаление, повторный вход): результат подключения выбрасываем. */
  private readonly abandoned = new Set<string>();
  private readonly retryTimers = new Map<string, NodeJS.Timeout>();
  private readonly retryAttempts = new Map<string, number>();
  private shuttingDown = false;

  constructor(
    private readonly config: TelegramConfig,
    private readonly factory: TelegramClientFactory,
    private readonly crypto: SessionCrypto,
    private readonly sync: TelegramSyncService,
    private readonly updates: TelegramUpdatesService,
    private readonly events: TelegramEventsService,
    private readonly accounts: TelegramAccountsRepository,
  ) {}

  /** Живой клиент аккаунта или null, если он сейчас не подключён. */
  getClient(accountId: string): TelegramClient | null {
    const live = this.live.get(accountId);
    return live && !live.stopped ? live.client : null;
  }

  /** id всех подключённых сейчас аккаунтов. */
  liveAccountIds(): string[] {
    return [...this.live.keys()];
  }

  isLive(accountId: string): boolean {
    return this.live.has(accountId);
  }

  async onModuleInit(): Promise<void> {
    if (!this.config.enabled) return;
    const rows = await this.accounts.findBootable();
    this.logger.log(`Поднимаем ${rows.length} аккаунт(ов) Telegram`);
    // Не блокируем старт HTTP: аккаунты подключаются в фоне, с разбегом.
    runDetached(this.bootAll(rows), this.logger, 'Запуск аккаунтов');
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    for (const timer of this.retryTimers.values()) clearTimeout(timer);
    this.retryTimers.clear();
    await Promise.all(
      [...this.live.keys()].map((id) => this.stop(id, { logout: false })),
    );
  }

  /** Подключить только что авторизованный клиент (после sign-in / password). */
  async attach(account: TelegramAccountEntity, client: TelegramClient): Promise<void> {
    await this.stop(account.id, { logout: false });
    this.retryAttempts.delete(account.id);
    this.register(account, client);
  }

  /** Поднять аккаунт из сохранённой сессии. Повторный вызов, пока идёт первый, ничего не делает. */
  async startFromRow(account: TelegramAccountEntity): Promise<void> {
    if (this.shuttingDown || this.live.has(account.id) || this.starting.has(account.id)) {
      return;
    }
    if (!account.sessionEncrypted) {
      await this.markDisconnected(account.id);
      return;
    }

    this.starting.add(account.id);
    try {
      const { client, proxyIndex } = await this.factory.connect(
        this.crypto.decrypt(account.sessionEncrypted),
        account.phone,
      );
      // getMe вместо isUserAuthorized: тот на любую ошибку (в т.ч. сетевую)
      // отвечает false, и мы бы стёрли сессию из-за мигнувшего прокси. Здесь
      // отзыв сессии уходит в isAuthLost, остальное — в повторное подключение.
      // Заодно teleproto запоминает «себя» и не ходит за этим при первом событии.
      try {
        await withTimeout(client.getMe(), PROBE_TIMEOUT_MS);
      } catch (error) {
        await safeDestroy(client);
        throw error;
      }
      if (this.shuttingDown || this.abandoned.has(account.id)) {
        await safeDestroy(client);
        return;
      }
      this.retryAttempts.delete(account.id);
      this.logger.log(
        `Аккаунт ${account.phone}: подключён${this.config.proxies[proxyIndex] ? ` через MTProxy #${proxyIndex + 1}` : ''}`,
      );
      this.register(account, client);
    } catch (error) {
      if (this.abandoned.has(account.id)) return;
      if (isAuthLost(error)) {
        this.logger.warn(
          `Аккаунт ${account.phone}: сессия недействительна — ${describeError(error)}`,
        );
        await this.markDisconnected(account.id);
        return;
      }
      const message = describeError(error);
      this.logger.warn(`Аккаунт ${account.phone}: не удалось поднять — ${message}`);
      await this.setStatus(account.id, 'error', message);
      this.scheduleRetry(account.id);
    } finally {
      this.starting.delete(account.id);
      this.abandoned.delete(account.id);
    }
  }

  /** Остановить клиент. С `logout` аккаунт уходит насовсем — сессия завершается в Telegram. */
  async stop(accountId: string, options: { logout: boolean }): Promise<void> {
    const timer = this.retryTimers.get(accountId);
    if (timer) {
      clearTimeout(timer);
      this.retryTimers.delete(accountId);
    }
    if (options.logout) this.retryAttempts.delete(accountId);
    if (this.starting.has(accountId)) this.abandoned.add(accountId);

    const live = this.live.get(accountId);
    if (!live) return;
    live.stopped = true;
    this.live.delete(accountId);
    if (live.resyncTimer) clearInterval(live.resyncTimer);
    live.unbind();

    if (options.logout) {
      try {
        await withTimeout(live.client.invoke(new Tl.auth.LogOut()), LOGOUT_TIMEOUT_MS);
      } catch (error) {
        this.logger.warn(
          `Аккаунт ${live.label}: не удалось разлогиниться — ${describeError(error)}`,
        );
      }
    }
    // destroy() отклоняет все висящие запросы — вместе с ними завершится и зависшая синхронизация.
    await safeDestroy(live.client);
    this.logger.log(
      `Аккаунт ${live.label}: клиент остановлен (прожил ${formatDuration(Date.now() - live.startedAt)})`,
    );
    this.events.emit({ kind: 'account-stopped', accountId, userId: live.userId });
  }

  // --- внутреннее -----------------------------------------------------------

  /**
   * Запуски идут с разбегом, но не ждут друг друга: аккаунт за медленным
   * или мёртвым прокси не задерживает подключение остальных.
   */
  private async bootAll(rows: TelegramAccountEntity[]): Promise<void> {
    for (const row of rows) {
      if (this.shuttingDown) return;
      runDetached(this.startFromRow(row), this.logger, `Аккаунт ${row.phone}: запуск`);
      await sleep(BOOT_STAGGER_MS);
    }
  }

  private register(account: TelegramAccountEntity, client: TelegramClient): void {
    const now = Date.now();
    const live: LiveAccount = {
      id: account.id,
      userId: account.userId,
      label: account.phone,
      client,
      unbind: () => undefined,
      resyncTimer: null,
      syncing: null,
      syncMode: null,
      syncStartedAt: 0,
      skippedTicks: 0,
      offlineTicks: 0,
      startedAt: now,
      connectionState: 'connected',
      connectionStateAt: now,
      stopped: false,
    };
    this.live.set(account.id, live);

    const unbindUpdates = this.updates.bind(live, {
      requestSync: (target) => this.requestSync(target),
      fail: (target, error, stage) => this.handleFailure(target, error, stage),
    });
    const stateFilter = new events.Raw({ types: [UpdateConnectionState] });
    const onState = (update: UpdateConnectionState) => this.onConnectionState(live, update);
    client.addEventHandler(onState as never, stateFilter);
    live.unbind = () => {
      unbindUpdates();
      try {
        client.removeEventHandler(onState as never, stateFilter);
      } catch {
        // Обработчик уже снят вместе с клиентом.
      }
    };

    client.onError = async (error: Error) => {
      if (isAuthLost(error)) {
        await this.handleAuthLost(live);
      } else {
        // Сюда teleproto отдаёт и неудачные пинги, и ошибки реконнекта — с состоянием они информативнее.
        this.logger.warn(
          `Аккаунт ${live.label}: ошибка клиента — ${describeError(error)} (${this.describeHealth(live)})`,
        );
      }
    };

    live.resyncTimer = setInterval(() => {
      runDetached(this.onResyncTick(live), this.logger, `Аккаунт ${live.label}: плановый тик`);
    }, this.config.resyncIntervalMs);

    runDetached(
      this.runSync(live, account.historySynced ? 'incremental' : 'full'),
      this.logger,
      `Аккаунт ${live.label}: синхронизация`,
    );
    this.events.emit({ kind: 'account-live', accountId: account.id, userId: account.userId });
  }

  private requestSync(live: LiveAccount): void {
    runDetached(this.runSync(live, 'incremental'), this.logger, `Аккаунт ${live.label}: синхронизация`);
  }

  /**
   * Плановый тик: сначала проверка здоровья, потом досинхронизация.
   * Именно здесь ловятся случаи, когда аккаунт «завис» без единой ошибки.
   */
  private async onResyncTick(live: LiveAccount): Promise<void> {
    if (live.stopped) return;
    const health = inspectClient(live);

    if (live.syncing) {
      live.skippedTicks += 1;
      const runningFor = Date.now() - live.syncStartedAt;
      const limit =
        live.syncMode === 'full' ? FULL_SYNC_TIMEOUT_MS : INCREMENTAL_SYNC_TIMEOUT_MS;
      const stage = syncStageName(live.syncMode);
      if (runningFor > limit) {
        this.logger.error(
          `Аккаунт ${live.label}: ${stage} зависла на ${formatDuration(runningFor)} (пропущено тиков: ${live.skippedTicks}; ${formatHealth(health)}) — пересоздаём клиент`,
        );
        await this.restart(live, `Синхронизация зависла (${formatDuration(runningFor)}), переподключаемся`);
        return;
      }
      this.logger.warn(
        `Аккаунт ${live.label}: тик пропущен — ${stage} идёт уже ${formatDuration(runningFor)} (${formatHealth(health)})`,
      );
      return;
    }

    if (health.lifecycle === 'dead') {
      this.logger.error(
        `Аккаунт ${live.label}: sender teleproto мёртв и сам не восстановится (${formatHealth(health)}) — пересоздаём клиент`,
      );
      await this.restart(live, 'Соединение с Telegram потеряно, переподключаемся');
      return;
    }

    if (health.silentForMs > SILENCE_LIMIT_MS) {
      this.logger.error(
        `Аккаунт ${live.label}: от Telegram ничего не приходило ${formatDuration(health.silentForMs)} (${formatHealth(health)}) — пересоздаём клиент`,
      );
      await this.restart(live, 'Соединение с Telegram молчит, переподключаемся');
      return;
    }

    if (!health.connected) {
      live.offlineTicks += 1;
      if (live.offlineTicks >= OFFLINE_TICKS_LIMIT) {
        this.logger.error(
          `Аккаунт ${live.label}: клиент не подключён уже ${live.offlineTicks} тика подряд (${formatHealth(health)}) — пересоздаём клиент`,
        );
        await this.restart(live, 'Автопереподключение не справилось, пересоздаём соединение');
        return;
      }
      this.logger.warn(
        `Аккаунт ${live.label}: клиент не подключён, досинхронизацию откладываем (${formatHealth(health)})`,
      );
      return;
    }

    live.offlineTicks = 0;
    this.requestSync(live);
  }

  /** Синхронизация аккаунта; параллельный вызов получает уже идущую. Не отказывает. */
  private runSync(live: LiveAccount, mode: SyncMode): Promise<void> {
    if (live.syncing) return live.syncing;
    live.syncMode = mode;
    live.syncStartedAt = Date.now();
    live.skippedTicks = 0;
    const stage = syncStageName(mode);
    this.logger.debug(`Аккаунт ${live.label}: ${stage} начата`);

    live.syncing = (async () => {
      try {
        const stats =
          mode === 'full'
            ? await this.sync.fullSync(live.id, live.client)
            : await this.sync.incrementalSync(live.id, live.client);
        if (live.stopped) return;
        this.logSyncDone(live, stage, stats);
        await this.accounts.recordSync(live.id, { full: mode === 'full' });
      } catch (error) {
        await this.handleFailure(live, error, stage);
      } finally {
        live.syncing = null;
        live.syncMode = null;
      }
    })();
    return live.syncing;
  }

  private logSyncDone(live: LiveAccount, stage: string, stats: SyncStats): void {
    const tookMs = Date.now() - live.syncStartedAt;
    const summary = `${stage} за ${formatDuration(tookMs)}: диалогов ${stats.dialogs}, догружено ${stats.caughtUp}`;
    if (tookMs > SLOW_SYNC_WARN_MS) {
      this.logger.warn(`Аккаунт ${live.label}: медленная ${summary} (${this.describeHealth(live)})`);
    } else if (stats.caughtUp > 0 || stage !== syncStageName('incremental')) {
      this.logger.log(`Аккаунт ${live.label}: ${summary}`);
    } else {
      this.logger.debug(`Аккаунт ${live.label}: ${summary}`);
    }
  }

  /** teleproto сообщает о connected / disconnected / broken главного соединения. */
  private onConnectionState(live: LiveAccount, update: UpdateConnectionState): void {
    if (live.stopped) return;
    const state = connectionStateName(update.state);
    const previous = live.connectionState;
    const heldFor = Date.now() - live.connectionStateAt;
    live.connectionState = state;
    live.connectionStateAt = Date.now();
    if (state === previous) return;
    const text = `Аккаунт ${live.label}: соединение ${previous} → ${state} (в прошлом состоянии ${formatDuration(heldFor)})`;
    if (state === 'connected') this.logger.log(text);
    else this.logger.warn(text);
  }

  /** Решает, что делать с ошибкой синхронизации или приёма. Сама не бросает. */
  private async handleFailure(live: LiveAccount, error: unknown, stage: string): Promise<void> {
    if (live.stopped) return;
    if (isAuthLost(error)) {
      await this.handleAuthLost(live);
      return;
    }
    const message = describeError(error);
    const health = inspectClient(live);
    this.logger.warn(`Аккаунт ${live.label}: ${stage} — ${message} (${formatHealth(health)})`);
    await this.setStatus(live.id, 'error', message);

    if (isFloodWait(error)) return; // подождём следующего цикла — библиотека сама выдержит паузу

    if (!health.connected || health.lifecycle === 'dead') {
      // Соединение потеряно, а автопереподключение не справилось — пересоздаём клиент.
      await this.restart(live, message);
    }
  }

  /** Снести клиент и поднять заново (через другой MTProxy, если их несколько). */
  private async restart(live: LiveAccount, reason: string): Promise<void> {
    if (live.stopped || this.shuttingDown) return;
    this.logger.log(`Аккаунт ${live.label}: пересоздаём клиент — ${reason}`);
    await this.setStatus(live.id, 'error', reason);
    await this.stop(live.id, { logout: false });
    this.scheduleRetry(live.id);
  }

  private async handleAuthLost(live: LiveAccount): Promise<void> {
    if (live.stopped) return;
    this.logger.warn(`Аккаунт ${live.label}: сессия отозвана Telegram`);
    await this.stop(live.id, { logout: false });
    await this.markDisconnected(live.id);
  }

  private describeHealth(live: LiveAccount): string {
    return `${formatHealth(inspectClient(live))}, событие соединения: ${live.connectionState} ${formatDuration(Date.now() - live.connectionStateAt)} назад`;
  }

  /** Статус — лучшее усилие: без базы аккаунт продолжает работать, запись догонит следующий цикл. */
  private async setStatus(
    accountId: string,
    status: TelegramAccountStatus,
    statusMessage: string | null,
  ): Promise<void> {
    try {
      await this.accounts.setStatus(accountId, status, statusMessage);
    } catch (error) {
      this.logger.warn(`Аккаунт ${accountId}: статус «${status}» не записан — ${describeError(error)}`);
    }
  }

  private async markDisconnected(accountId: string): Promise<void> {
    try {
      await this.accounts.markDisconnected(accountId, AUTH_LOST_MESSAGE);
    } catch (error) {
      this.logger.error(`Аккаунт ${accountId}: не удалось отметить отключение — ${describeError(error)}`);
    }
  }

  private scheduleRetry(accountId: string): void {
    if (this.shuttingDown || this.retryTimers.has(accountId)) return;
    const attempt = this.retryAttempts.get(accountId) ?? 0;
    const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** attempt);
    this.retryAttempts.set(accountId, attempt + 1);
    this.logger.log(
      `Аккаунт ${accountId}: повторное подключение через ${Math.round(delay / 1000)} с`,
    );

    const timer = setTimeout(() => {
      this.retryTimers.delete(accountId);
      runDetached(this.retry(accountId), this.logger, `Аккаунт ${accountId}: повторное подключение`);
    }, delay);
    this.retryTimers.set(accountId, timer);
  }

  private async retry(accountId: string): Promise<void> {
    let row: TelegramAccountEntity | null;
    try {
      row = await this.accounts.findById(accountId);
    } catch (error) {
      // База недоступна — не теряем аккаунт, попробуем позже.
      this.logger.warn(`Аккаунт ${accountId}: не удалось прочитать из базы — ${describeError(error)}`);
      this.scheduleRetry(accountId);
      return;
    }
    if (!row || row.status === 'disconnected') return;
    await this.startFromRow(row);
  }
}

function connectionStateName(state: number): string {
  if (state === UpdateConnectionState.connected) return 'connected';
  if (state === UpdateConnectionState.disconnected) return 'disconnected';
  if (state === UpdateConnectionState.broken) return 'broken';
  return `state=${state}`;
}
