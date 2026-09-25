import { describe, expect, it } from 'vitest';
import {
  FULL_SYNC_TIMEOUT_MS,
  INCREMENTAL_SYNC_TIMEOUT_MS,
  OFFLINE_TICKS_LIMIT,
  SILENCE_LIMIT_MS,
  formatDuration,
  watchdogTick,
} from './live-account.js';
import type { ClientHealth, WatchdogState } from './live-account.js';

const NOW = 10 * 60 * 60_000;
const healthy: ClientHealth = {
  connected: true,
  lifecycle: 'connected',
  silentForMs: 5_000,
};

function state(patch: Partial<WatchdogState> = {}): WatchdogState {
  return {
    syncing: null,
    syncMode: null,
    syncStartedAt: 0,
    skippedTicks: 0,
    offlineTicks: 0,
    ...patch,
  };
}

describe('watchdogTick', () => {
  it('здоровый клиент — досинхронизация, счётчик офлайна сброшен', () => {
    const live = state({ offlineTicks: 1 });
    expect(watchdogTick(live, healthy, NOW)).toEqual({ action: 'sync' });
    expect(live.offlineTicks).toBe(0);
  });

  it('идёт досинхронизация — тик пропускается и считается', () => {
    const live = state({
      syncing: Promise.resolve(),
      syncMode: 'incremental',
      syncStartedAt: NOW - 60_000,
    });
    const verdict = watchdogTick(live, healthy, NOW);
    expect(verdict.action).toBe('skip');
    expect(live.skippedTicks).toBe(1);
  });

  it('досинхронизация дольше порога — клиент пересоздаётся', () => {
    const live = state({
      syncing: Promise.resolve(),
      syncMode: 'incremental',
      syncStartedAt: NOW - INCREMENTAL_SYNC_TIMEOUT_MS - 1,
    });
    const verdict = watchdogTick(live, healthy, NOW);
    expect(verdict).toMatchObject({ action: 'restart' });
    expect(verdict.action === 'restart' && verdict.reason).toMatch(
      /^Синхронизация зависла/,
    );
  });

  it('у первичной выгрузки свой, длинный порог', () => {
    const live = state({
      syncing: Promise.resolve(),
      syncMode: 'full',
      syncStartedAt: NOW - INCREMENTAL_SYNC_TIMEOUT_MS - 1,
    });
    expect(watchdogTick(live, healthy, NOW).action).toBe('skip');
    live.syncStartedAt = NOW - FULL_SYNC_TIMEOUT_MS - 1;
    expect(watchdogTick(live, healthy, NOW).action).toBe('restart');
  });

  it('мёртвый sender — пересоздать сразу', () => {
    const verdict = watchdogTick(
      state(),
      { ...healthy, lifecycle: 'dead' },
      NOW,
    );
    expect(verdict).toMatchObject({
      action: 'restart',
      reason: 'Соединение с Telegram потеряно, переподключаемся',
    });
  });

  it('долгая тишина соединения — пересоздать', () => {
    const verdict = watchdogTick(
      state(),
      { ...healthy, silentForMs: SILENCE_LIMIT_MS + 1 },
      NOW,
    );
    expect(verdict).toMatchObject({
      action: 'restart',
      reason: 'Соединение с Telegram молчит, переподключаемся',
    });
  });

  it('не подключён — ждём, но не дольше лимита тиков подряд', () => {
    const live = state();
    const offline = { ...healthy, connected: false };
    for (let tick = 1; tick < OFFLINE_TICKS_LIMIT; tick += 1) {
      expect(watchdogTick(live, offline, NOW).action).toBe('skip');
    }
    expect(watchdogTick(live, offline, NOW)).toMatchObject({
      action: 'restart',
      reason: 'Автопереподключение не справилось, пересоздаём соединение',
    });
    expect(live.offlineTicks).toBe(OFFLINE_TICKS_LIMIT);
  });
});

describe('formatDuration', () => {
  it('секунды, минуты, часы', () => {
    expect(formatDuration(45_000)).toBe('45 с');
    expect(formatDuration(125_000)).toBe('2 мин 5 с');
    expect(formatDuration(3 * 60 * 60_000 + 5 * 60_000)).toBe('3 ч 5 мин');
  });
});
