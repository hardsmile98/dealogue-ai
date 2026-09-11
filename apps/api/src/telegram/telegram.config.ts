import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MtProxyConfig {
  host: string;
  port: number;
  secret: string;
}

export type ClientLogLevel = 'none' | 'error' | 'warn' | 'info' | 'debug';
const CLIENT_LOG_LEVELS: readonly string[] = [
  'none',
  'error',
  'warn',
  'info',
  'debug',
];

/**
 * Настройки раздела Telegram. Всё читается один раз при старте;
 * если api_id / api_hash не заданы — модуль поднимается в «выключенном»
 * режиме и все эндпоинты отвечают 503, а не падают.
 */
@Injectable()
export class TelegramConfig {
  private readonly logger = new Logger(TelegramConfig.name);

  readonly apiId: number;
  readonly apiHash: string;
  readonly proxies: MtProxyConfig[];
  readonly sessionSecret: string;
  readonly timezone: string;
  /** Сколько диалогов вытягивать при первичной синхронизации. */
  readonly dialogsLimit: number;
  /** Сколько последних сообщений на диалог хранить при первичной синхронизации. */
  readonly messagesLimit: number;
  /** Сколько свежих диалогов проверять при периодической досинхронизации. */
  readonly recentDialogsLimit: number;
  readonly resyncIntervalMs: number;
  /** Сколько живёт незавершённая попытка входа (номер → код → пароль). */
  readonly loginAttemptTtlMs: number;
  /**
   * Уровень внутренних логов teleproto (обрывы соединения, реконнекты, пинги).
   * По умолчанию `warn`; для разбора зависаний ставьте `info` или `debug`.
   */
  readonly clientLogLevel: ClientLogLevel;

  constructor(config: ConfigService) {
    this.apiId = Number(config.get<string>('TELEGRAM_API_ID') ?? 0);
    this.apiHash = config.get<string>('TELEGRAM_API_HASH') ?? '';
    this.sessionSecret = config.get<string>('TELEGRAM_SESSION_SECRET') ?? '';
    this.timezone = config.get<string>('TELEGRAM_TIMEZONE') ?? 'Europe/Moscow';
    this.dialogsLimit = readInt(config, 'TELEGRAM_SYNC_DIALOGS_LIMIT', 300);
    this.messagesLimit = readInt(config, 'TELEGRAM_SYNC_MESSAGES_LIMIT', 100);
    this.recentDialogsLimit = readInt(
      config,
      'TELEGRAM_RESYNC_DIALOGS_LIMIT',
      40,
    );
    this.resyncIntervalMs =
      readInt(config, 'TELEGRAM_RESYNC_INTERVAL_SEC', 120) * 1000;
    this.loginAttemptTtlMs =
      readInt(config, 'TELEGRAM_LOGIN_ATTEMPT_TTL_SEC', 600) * 1000;
    this.proxies = parseProxies(config.get<string>('TELEGRAM_MTPROXY') ?? '');
    this.clientLogLevel = readLogLevel(
      config,
      'TELEGRAM_CLIENT_LOG_LEVEL',
      'warn',
    );

    if (!this.enabled) {
      this.logger.warn(
        'TELEGRAM_API_ID / TELEGRAM_API_HASH не заданы — раздел Telegram выключен',
      );
    } else if (!this.sessionSecret) {
      throw new Error(
        'TELEGRAM_SESSION_SECRET обязателен: им шифруются сессии Telegram в базе',
      );
    } else if (this.proxies.length === 0) {
      this.logger.warn(
        'TELEGRAM_MTPROXY не задан — подключение к Telegram пойдёт напрямую',
      );
    }
  }

  get enabled(): boolean {
    return this.apiId > 0 && this.apiHash.length > 0;
  }
}

function readInt(config: ConfigService, key: string, fallback: number): number {
  const raw = config.get<string>(key);
  const value = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readLogLevel(
  config: ConfigService,
  key: string,
  fallback: ClientLogLevel,
): ClientLogLevel {
  const raw = (config.get<string>(key) ?? '').trim().toLowerCase();
  return CLIENT_LOG_LEVELS.includes(raw) ? (raw as ClientLogLevel) : fallback;
}

/**
 * `host:port:secret,host2:port2:secret2` — несколько прокси через запятую.
 * Порядок важен: подключаемся к первому живому, при сбое переходим к следующему.
 */
export function parseProxies(raw: string): MtProxyConfig[] {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [host, port, ...secretParts] = entry.split(':');
      const secret = secretParts.join(':').trim();
      const portNumber = Number(port);
      if (!host || !Number.isInteger(portNumber) || !secret) {
        throw new Error(
          `TELEGRAM_MTPROXY: ожидается host:port:secret, получено «${entry}»`,
        );
      }
      return { host: host.trim(), port: portNumber, secret };
    });
}
