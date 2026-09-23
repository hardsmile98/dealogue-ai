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
    typeof internals._lastReceivedAt === 'number' && internals._lastReceivedAt > 0
      ? internals._lastReceivedAt
      : live.startedAt;
  return {
    connected: Boolean(live.client.connected),
    lifecycle: internals._sender?.lifecycle ?? 'нет sender',
    silentForMs: Date.now() - lastReceivedAt,
  };
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
