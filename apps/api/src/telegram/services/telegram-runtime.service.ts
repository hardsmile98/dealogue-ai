import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import teleproto from 'teleproto';
import type { Api, TelegramClient } from 'teleproto';
import type { NewMessageEvent } from 'teleproto/events/NewMessage.js';
import { UpdateConnectionState } from 'teleproto/network/UpdateConnectionState.js';
import {
  TelegramClientFactory,
  safeDestroy,
} from '../client/telegram-client.factory.js';
import { TelegramAccountEntity } from '../entities/telegram-account.entity.js';
import type { TelegramAccountStatus } from '../entities/telegram-account.entity.js';
import type { TelegramChatEntity } from '../entities/telegram-chat.entity.js';
import { SessionCrypto } from '../lib/session-crypto.js';
import {
  TelegramUnavailableError,
  describeError,
  isAuthLost,
  isFloodWait,
} from '../lib/telegram-errors.js';
import { TelegramConfig } from '../telegram.config.js';
import { TelegramDialogStartsService } from './telegram-dialog-starts.service.js';
import { TelegramEventsService } from './telegram-events.service.js';
import {
  TelegramIngestService,
  messageDirection,
} from './telegram-ingest.service.js';
import {
  TelegramSyncService,
  isNonHumanUser,
} from './telegram-sync.service.js';
import type { SyncStats } from './telegram-sync.service.js';

const { Api: Tl, events } = teleproto;

const AUTH_LOST_MESSAGE =
  'Сессия завершена на стороне Telegram. Переподключите аккаунт, чтобы продолжить отслеживание.';
const RETRY_BASE_MS = 15_000;
const RETRY_MAX_MS = 5 * 60_000;
const BOOT_STAGGER_MS = 700;
const LOGOUT_TIMEOUT_MS = 5_000;
/** Сколько ждать первый запрос (getMe) сразу после подключения. */
const PROBE_TIMEOUT_MS = 30_000;
/** Сколько свежих диалогов запросить, чтобы найти незнакомого собеседника. */
const RESOLVE_DIALOGS_LIMIT = 30;

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

type SyncMode = 'full' | 'incremental';

interface LiveAccount {
  id: string;
  /** Телефон — для читаемых логов. */
  label: string;
  client: TelegramClient;
  handler: (event: NewMessageEvent) => void;
  stateHandler: (update: UpdateConnectionState) => void;
  resyncTimer: NodeJS.Timeout | null;
  syncing: Promise<void> | null;
  syncMode: SyncMode | null;
  syncStartedAt: number;
  /** Сколько плановых тиков пропущено, потому что предыдущая синхронизация ещё идёт. */
  skippedTicks: number;
  /** Сколько тиков подряд клиент был не в состоянии connected. */
  offlineTicks: number;
  startedAt: number;
  /** Последнее событие соединения от teleproto и когда оно было. */
  connectionState: string;
  connectionStateAt: number;
  /** Диалоги, для которых уже запущена догрузка истории по живому событию. */
  pendingDialogs: Set<string>;
  /** Идущие запросы на резолв собеседника по peerId — чтобы не дублировать getDialogs. */
  resolving: Map<string, Promise<Api.User | 'skip' | null>>;
  stopped: boolean;
}

/** Внутренности teleproto, по которым видно, живо ли соединение на самом деле. */
interface ClientInternals {
  _sender?: { lifecycle?: string };
  _lastReceivedAt?: number;
}

interface ClientHealth {
  connected: boolean;
  lifecycle: string;
  /** Сколько мс от Telegram не приходило ни одного байта (включая pong). */
  silentForMs: number;
}

/**
 * Живые подключения: по одному клиенту teleproto на подключённый аккаунт.
 * Поднимает их при старте, ловит новые сообщения, по расписанию
 * досинхронизирует пропущенное, переподключается через другой MTProxy
 * при сбое и переводит аккаунт в «отключён», когда Telegram отзывает сессию.
 *
 * Каждый плановый тик — ещё и проверка здоровья: зависшая синхронизация,
 * долгое молчание соединения или мёртвый sender приводят к пересозданию
 * клиента, а не к тихому простою до перезапуска процесса.
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
    private readonly dialogStarts: TelegramDialogStartsService,
    private readonly events: TelegramEventsService,
    @InjectRepository(TelegramAccountEntity)
    private readonly accounts: Repository<TelegramAccountEntity>,
  ) {
    this.crypto = new SessionCrypto(
      config.sessionSecret || 'telegram-disabled',
    );
  }

  /** Живой клиент аккаунта или null, если он сейчас не подключён. */
  getClient(accountId: string): TelegramClient | null {
    const live = this.live.get(accountId);
    return live && !live.stopped ? live.client : null;
  }

  /** id всех подключённых сейчас аккаунтов. */
  liveAccountIds(): string[] {
    return [...this.live.keys()];
  }

  async onModuleInit(): Promise<void> {
    if (!this.config.enabled) return;
    // Если парсер кодов обновился — пересчитать старые начала диалогов, не мешая старту.
    void this.dialogStarts
      .reclassifyOutdated()
      .catch((error) =>
        this.logger.error(
          `Переклассификация не удалась: ${describeError(error)}`,
        ),
      );

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
    await Promise.all(
      [...this.live.keys()].map((id) => this.stop(id, { logout: false })),
    );
  }

  isLive(accountId: string): boolean {
    return this.live.has(accountId);
  }

  /** Подключить только что авторизованный клиент (после sign-in / password). */
  async attach(
    account: TelegramAccountEntity,
    client: TelegramClient,
  ): Promise<void> {
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
      this.retryAttempts.delete(account.id);
      this.logger.log(
        `Аккаунт ${account.phone}: подключён${this.config.proxies[proxyIndex] ? ` через MTProxy #${proxyIndex + 1}` : ''}`,
      );
      this.register(account, client);
    } catch (error) {
      if (isAuthLost(error)) {
        this.logger.warn(
          `Аккаунт ${account.phone}: сессия недействительна — ${describeError(error)}`,
        );
        await this.markDisconnected(account.id);
        return;
      }
      const message =
        error instanceof TelegramUnavailableError
          ? error.message
          : describeError(error);
      this.logger.warn(
        `Аккаунт ${account.phone}: не удалось поднять — ${message}`,
      );
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
      live.client.removeEventHandler(
        live.stateHandler as never,
        new events.Raw({ types: [UpdateConnectionState] }),
      );
    } catch {
      // Обработчики уже сняты вместе с клиентом.
    }

    if (options.logout) {
      try {
        await withTimeout(
          live.client.invoke(new Tl.auth.LogOut()),
          LOGOUT_TIMEOUT_MS,
        );
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
    this.events.emit({ kind: 'account-stopped', accountId });
  }

  // --- внутреннее -----------------------------------------------------------

  private async bootAll(rows: TelegramAccountEntity[]): Promise<void> {
    for (const row of rows) {
      if (this.shuttingDown) return;
      await this.startFromRow(row);
      await sleep(BOOT_STAGGER_MS);
    }
  }

  private register(
    account: TelegramAccountEntity,
    client: TelegramClient,
  ): void {
    const now = Date.now();
    const live: LiveAccount = {
      id: account.id,
      label: account.phone,
      client,
      handler: () => undefined,
      stateHandler: () => undefined,
      resyncTimer: null,
      syncing: null,
      syncMode: null,
      syncStartedAt: 0,
      skippedTicks: 0,
      offlineTicks: 0,
      startedAt: now,
      connectionState: 'connected',
      connectionStateAt: now,
      pendingDialogs: new Set(),
      resolving: new Map(),
      stopped: false,
    };
    live.handler = (event) => {
      void this.onNewMessage(live, event);
    };
    live.stateHandler = (update) => this.onConnectionState(live, update);
    this.live.set(account.id, live);

    client.addEventHandler(live.handler, new events.NewMessage({}));
    client.addEventHandler(
      live.stateHandler as never,
      new events.Raw({ types: [UpdateConnectionState] }),
    );
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
      void this.onResyncTick(live);
    }, this.config.resyncIntervalMs);

    void this.runSync(live, account.historySynced ? 'incremental' : 'full');
    this.events.emit({ kind: 'account-live', accountId: account.id });
  }

  /**
   * Плановый тик: сначала проверка здоровья, потом досинхронизация.
   * Именно здесь ловятся случаи, когда аккаунт «завис» без единой ошибки.
   */
  private async onResyncTick(live: LiveAccount): Promise<void> {
    if (live.stopped) return;
    const health = this.inspect(live);

    if (live.syncing) {
      live.skippedTicks += 1;
      const runningFor = Date.now() - live.syncStartedAt;
      const limit =
        live.syncMode === 'full'
          ? FULL_SYNC_TIMEOUT_MS
          : INCREMENTAL_SYNC_TIMEOUT_MS;
      const stage = syncStageName(live.syncMode);
      if (runningFor > limit) {
        this.logger.error(
          `Аккаунт ${live.label}: ${stage} зависла на ${formatDuration(runningFor)} (пропущено тиков: ${live.skippedTicks}; ${formatHealth(health)}) — пересоздаём клиент`,
        );
        await this.restart(
          live,
          `Синхронизация зависла (${formatDuration(runningFor)}), переподключаемся`,
        );
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
      await this.restart(
        live,
        'Соединение с Telegram потеряно, переподключаемся',
      );
      return;
    }

    if (health.silentForMs > SILENCE_LIMIT_MS) {
      this.logger.error(
        `Аккаунт ${live.label}: от Telegram ничего не приходило ${formatDuration(health.silentForMs)} (${formatHealth(health)}) — пересоздаём клиент`,
      );
      await this.restart(
        live,
        'Соединение с Telegram молчит, переподключаемся',
      );
      return;
    }

    if (!health.connected) {
      live.offlineTicks += 1;
      if (live.offlineTicks >= OFFLINE_TICKS_LIMIT) {
        this.logger.error(
          `Аккаунт ${live.label}: клиент не подключён уже ${live.offlineTicks} тика подряд (${formatHealth(health)}) — пересоздаём клиент`,
        );
        await this.restart(
          live,
          'Автопереподключение не справилось, пересоздаём соединение',
        );
        return;
      }
      this.logger.warn(
        `Аккаунт ${live.label}: клиент не подключён, досинхронизацию откладываем (${formatHealth(health)})`,
      );
      return;
    }

    live.offlineTicks = 0;
    void this.runSync(live, 'incremental');
  }

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
        await this.setStatus(live.id, 'connected', null);
      } catch (error) {
        await this.handleFailure(live, error, stage);
      } finally {
        live.syncing = null;
        live.syncMode = null;
      }
    })();
    return live.syncing;
  }

  private logSyncDone(
    live: LiveAccount,
    stage: string,
    stats: SyncStats,
  ): void {
    const tookMs = Date.now() - live.syncStartedAt;
    const summary = `${stage} за ${formatDuration(tookMs)}: диалогов ${stats.dialogs}, догружено ${stats.caughtUp}`;
    if (tookMs > SLOW_SYNC_WARN_MS) {
      this.logger.warn(
        `Аккаунт ${live.label}: медленная ${summary} (${this.describeHealth(live)})`,
      );
    } else if (stats.caughtUp > 0 || stage !== 'досинхронизация') {
      this.logger.log(`Аккаунт ${live.label}: ${summary}`);
    } else {
      this.logger.debug(`Аккаунт ${live.label}: ${summary}`);
    }
  }

  /** teleproto сообщает о connected / disconnected / broken главного соединения. */
  private onConnectionState(
    live: LiveAccount,
    update: UpdateConnectionState,
  ): void {
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

  private async onNewMessage(
    live: LiveAccount,
    event: NewMessageEvent,
  ): Promise<void> {
    if (live.stopped || !event.isPrivate) return;
    const message = event.message;
    if (!message || message.className !== 'Message') return;
    const peer = message.peerId;
    if (!(peer instanceof Tl.PeerUser)) return;
    const peerId = peer.userId.toString();

    try {
      const resolved = await this.resolvePeerUser(live, peerId, event);
      if (resolved === 'skip') return;
      if (resolved === null) {
        // Собеседника не нашли даже в свежих диалогах — пусть подберёт синхронизация.
        this.logger.warn(
          `Аккаунт ${live.label}: не удалось определить собеседника ${peerId}, догружаем через синхронизацию`,
        );
        void this.runSync(live, 'incremental');
        return;
      }
      const user = resolved;

      const chat = await this.ingest.upsertChat(live.id, user);
      this.logger.log(
        `Аккаунт ${live.label}: ${message.out ? 'исходящее для' : 'входящее от'} ${chat.peerName} (#${message.id})`,
      );
      if (chat.historySynced) {
        await this.ingest.storeMessages(chat, [message]);
        this.emitMessage(live.id, chat, message);
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
      this.emitMessage(live.id, chat, message);
    } catch (error) {
      await this.handleFailure(live, error, 'обработка сообщения');
    }
  }

  private emitMessage(
    accountId: string,
    chat: TelegramChatEntity,
    message: Api.Message,
  ): void {
    this.events.emit({
      kind: 'message',
      accountId,
      chat,
      message,
      direction: messageDirection(message),
    });
  }

  /**
   * Личные сообщения приходят как updateShortMessage — без данных о
   * собеседнике. `event.getChat()` берёт пользователя из кэша сущностей,
   * который живёт в памяти и наполняется ответами getDialogs/getMessages.
   * Для нового собеседника или сразу после перезапуска кэш пуст — тогда
   * подтягиваем свежие диалоги: их ответ содержит пользователей с access hash.
   * Несколько сообщений подряд от одного неизвестного собеседника ждут один
   * и тот же запрос, а не плодят свои.
   */
  private async resolvePeerUser(
    live: LiveAccount,
    peerId: string,
    event: NewMessageEvent,
  ): Promise<Api.User | 'skip' | null> {
    const classify = (entity: unknown): Api.User | 'skip' | null => {
      const candidate = entity as { className?: string } | undefined;
      if (!candidate || candidate.className !== 'User') return null;
      const user = candidate as Api.User;
      return isNonHumanUser(user) ? 'skip' : user;
    };

    const cached = classify(await event.getChat().catch(() => undefined));
    if (cached !== null) return cached;

    let pending = live.resolving.get(peerId);
    if (!pending) {
      pending = (async () => {
        const dialogs = await live.client.getDialogs({
          limit: RESOLVE_DIALOGS_LIMIT,
        });
        for (const dialog of dialogs) {
          const entity = dialog.entity as
            { className?: string; id?: { toString(): string } } | undefined;
          if (
            entity?.className === 'User' &&
            entity.id?.toString() === peerId
          ) {
            return classify(entity);
          }
        }
        return null;
      })().finally(() => live.resolving.delete(peerId));
      live.resolving.set(peerId, pending);
    }
    return pending;
  }

  private async handleFailure(
    live: LiveAccount,
    error: unknown,
    stage: string,
  ): Promise<void> {
    if (live.stopped) return;
    if (isAuthLost(error)) {
      await this.handleAuthLost(live);
      return;
    }
    const message = describeError(error);
    const health = this.inspect(live);
    this.logger.warn(
      `Аккаунт ${live.label}: ${stage} — ${message} (${formatHealth(health)})`,
    );
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

  private inspect(live: LiveAccount): ClientHealth {
    const internals = live.client as unknown as ClientInternals;
    const lastReceivedAt =
      typeof internals._lastReceivedAt === 'number' &&
      internals._lastReceivedAt > 0
        ? internals._lastReceivedAt
        : live.startedAt;
    return {
      connected: Boolean(live.client.connected),
      lifecycle: internals._sender?.lifecycle ?? 'нет sender',
      silentForMs: Date.now() - lastReceivedAt,
    };
  }

  private describeHealth(live: LiveAccount): string {
    return `${formatHealth(this.inspect(live))}, событие соединения: ${live.connectionState} ${formatDuration(Date.now() - live.connectionStateAt)} назад`;
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
    this.logger.log(
      `Аккаунт ${accountId}: повторное подключение через ${Math.round(delay / 1000)} с`,
    );

    const timer = setTimeout(async () => {
      this.retryTimers.delete(accountId);
      const row = await this.accounts.findOne({ where: { id: accountId } });
      if (!row || row.status === 'disconnected') return;
      await this.startFromRow(row);
    }, delay);
    this.retryTimers.set(accountId, timer);
  }
}

function syncStageName(mode: SyncMode | null): string {
  return mode === 'full' ? 'первичная синхронизация' : 'досинхронизация';
}

function connectionStateName(state: number): string {
  if (state === UpdateConnectionState.connected) return 'connected';
  if (state === UpdateConnectionState.disconnected) return 'disconnected';
  if (state === UpdateConnectionState.broken) return 'broken';
  return `state=${state}`;
}

function formatHealth(health: ClientHealth): string {
  return `connected=${health.connected}, lifecycle=${health.lifecycle}, тишина ${formatDuration(health.silentForMs)}`;
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 90) return `${seconds} с`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 90) return `${minutes} мин ${seconds % 60} с`;
  const hours = Math.floor(minutes / 60);
  return `${hours} ч ${minutes % 60} мин`;
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
