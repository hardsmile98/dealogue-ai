import type { TelegramClient } from 'teleproto';

export type SyncMode = 'full' | 'incremental';

/** Живое подключение одного аккаунта — всё, что рантайм держит в памяти. */
export interface LiveAccount {
  id: string;
  /** Владелец аккаунта — события сразу несут, кому их показывать. */
  userId: string;
  /** Телефон — для читаемых логов. */
  label: string;
  client: TelegramClient;
  /** Снимает все обработчики апдейтов с клиента. */
  unbind: () => void;
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
  stopped: boolean;
  /** Первая синхронизация после подключения прошла — база догнала Telegram. */
  caughtUp: boolean;
}

export interface ClientHealth {
  connected: boolean;
  lifecycle: string;
  /** Сколько мс от Telegram не приходило ни одного байта (включая pong). */
  silentForMs: number;
}

/** Внутренности teleproto, по которым видно, живо ли соединение на самом деле. */
interface ClientInternals {
  _sender?: { lifecycle?: string };
  _lastReceivedAt?: number;
}

export function inspectClient(live: LiveAccount): ClientHealth {
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

/**
 * Сторожевые пороги. У запросов teleproto нет собственного таймаута: если
 * соединение «полуживое» (TCP открыт, ответы не приходят) или библиотека
 * застряла в reconnecting, промис запроса висит вечно — вместе с ним висела
 * бы и вся досинхронизация аккаунта до перезапуска процесса.
 */
/** Дольше этого досинхронизация считается зависшей — клиент пересоздаётся. */
export const INCREMENTAL_SYNC_TIMEOUT_MS = 5 * 60_000;
/** Первичная выгрузка сотен диалогов идёт долго, но не бесконечно. */
export const FULL_SYNC_TIMEOUT_MS = 60 * 60_000;
/**
 * Столько молчания от Telegram считаем мёртвым соединением. В норме teleproto
 * пингует DC каждые 9 с и получает pong, а досинхронизация ходит раз в
 * `TELEGRAM_RESYNC_INTERVAL_SEC` — тишина в 5 минут возможна только при
 * сломанном сокете или умершем цикле обновлений.
 */
export const SILENCE_LIMIT_MS = 5 * 60_000;
/** Сколько подряд проверок клиент может «переподключаться», прежде чем пересоздадим его сами. */
export const OFFLINE_TICKS_LIMIT = 2;

/** Что делать на плановом тике: досинхронизировать, пропустить или пересоздать клиент. */
export type WatchdogVerdict =
  | { action: 'sync' }
  /** Тик пропускается; `log` — предупреждение. */
  | { action: 'skip'; log: string }
  /** Клиент пересоздаётся; `log` — ошибка в лог, `reason` — статус аккаунта. */
  | { action: 'restart'; log: string; reason: string };

export type WatchdogState = Pick<
  LiveAccount,
  'syncing' | 'syncMode' | 'syncStartedAt' | 'skippedTicks' | 'offlineTicks'
>;

/**
 * Проверка здоровья на плановом тике — именно здесь ловятся случаи, когда
 * аккаунт «завис» без единой ошибки: синхронизация идёт дольше порога,
 * sender мёртв, соединение молчит или несколько тиков подряд не подключено.
 * Счётчики пропущенных и офлайн-тиков обновляет в `live`.
 */
export function watchdogTick(
  live: WatchdogState,
  health: ClientHealth,
  now = Date.now(),
): WatchdogVerdict {
  if (live.syncing) {
    live.skippedTicks += 1;
    const runningFor = now - live.syncStartedAt;
    const limit =
      live.syncMode === 'full'
        ? FULL_SYNC_TIMEOUT_MS
        : INCREMENTAL_SYNC_TIMEOUT_MS;
    const stage = syncStageName(live.syncMode);
    if (runningFor > limit) {
      return {
        action: 'restart',
        log: `${stage} зависла на ${formatDuration(runningFor)} (пропущено тиков: ${live.skippedTicks}; ${formatHealth(health)}) — пересоздаём клиент`,
        reason: `Синхронизация зависла (${formatDuration(runningFor)}), переподключаемся`,
      };
    }
    return {
      action: 'skip',
      log: `тик пропущен — ${stage} идёт уже ${formatDuration(runningFor)} (${formatHealth(health)})`,
    };
  }

  if (health.lifecycle === 'dead') {
    return {
      action: 'restart',
      log: `sender teleproto мёртв и сам не восстановится (${formatHealth(health)}) — пересоздаём клиент`,
      reason: 'Соединение с Telegram потеряно, переподключаемся',
    };
  }

  if (health.silentForMs > SILENCE_LIMIT_MS) {
    return {
      action: 'restart',
      log: `от Telegram ничего не приходило ${formatDuration(health.silentForMs)} (${formatHealth(health)}) — пересоздаём клиент`,
      reason: 'Соединение с Telegram молчит, переподключаемся',
    };
  }

  if (!health.connected) {
    live.offlineTicks += 1;
    if (live.offlineTicks >= OFFLINE_TICKS_LIMIT) {
      return {
        action: 'restart',
        log: `клиент не подключён уже ${live.offlineTicks} тика подряд (${formatHealth(health)}) — пересоздаём клиент`,
        reason: 'Автопереподключение не справилось, пересоздаём соединение',
      };
    }
    return {
      action: 'skip',
      log: `клиент не подключён, досинхронизацию откладываем (${formatHealth(health)})`,
    };
  }

  live.offlineTicks = 0;
  return { action: 'sync' };
}

export function formatHealth(health: ClientHealth): string {
  return `connected=${health.connected}, lifecycle=${health.lifecycle}, тишина ${formatDuration(health.silentForMs)}`;
}

export function syncStageName(mode: SyncMode | null): string {
  return mode === 'full' ? 'первичная синхронизация' : 'досинхронизация';
}

export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 90) return `${seconds} с`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 90) return `${minutes} мин ${seconds % 60} с`;
  const hours = Math.floor(minutes / 60);
  return `${hours} ч ${minutes % 60} мин`;
}
