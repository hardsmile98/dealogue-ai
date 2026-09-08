import { Injectable, Logger } from '@nestjs/common';
import teleproto from 'teleproto';
import type { TelegramClient } from 'teleproto';
import { TelegramUnavailableError } from '../lib/telegram-errors.js';
import { TelegramConfig } from '../telegram.config.js';
import type { MtProxyConfig } from '../telegram.config.js';
import { ConnectionTCPMTProxyPadded, needsPaddedTransport } from './mtproxy-padded-transport.js';

const { TelegramClient: TelegramClientCtor, sessions, Logger: TeleprotoLogger } = teleproto;

/** Секунды на установку TCP-соединения через прокси. */
const CONNECT_TIMEOUT_SEC = 12;

export interface ConnectedClient {
  client: TelegramClient;
  /** Индекс прокси из TELEGRAM_MTPROXY, через который удалось подключиться. */
  proxyIndex: number;
}

/**
 * Собирает клиентов teleproto с едиными настройками: MTProxy, ретраи,
 * автопереподключение, тихий лог. Умеет перебирать несколько прокси —
 * первый живой выигрывает.
 */
@Injectable()
export class TelegramClientFactory {
  private readonly logger = new Logger(TelegramClientFactory.name);
  /** С какого прокси начинать следующий перебор — чтобы не долбить один и тот же. */
  private rotation = 0;

  constructor(private readonly config: TelegramConfig) {}

  get credentials() {
    return { apiId: this.config.apiId, apiHash: this.config.apiHash };
  }

  create(sessionString: string, proxyIndex: number): TelegramClient {
    const proxy = this.config.proxies[proxyIndex];
    const client = new TelegramClientCtor(
      new sessions.StringSession(sessionString),
      this.config.apiId,
      this.config.apiHash,
      {
        proxy: proxy ? toProxyParam(proxy) : undefined,
        timeout: CONNECT_TIMEOUT_SEC,
        connectionRetries: 3,
        requestRetries: 3,
        retryDelay: 1500,
        autoReconnect: true,
        // Короткие FLOOD_WAIT библиотека пересиживает сама, длинные отдаёт нам.
        floodSleepThreshold: 30,
        deviceModel: 'Dealogue AI',
        appVersion: '1.0',
        langCode: 'ru',
        systemLangCode: 'ru',
        baseLogger: new TeleprotoLogger('error' as never),
      },
    );

    // teleproto при MTProxy жёстко ставит abridged-транспорт, а прокси
    // с секретами dd…/ee… принимают только padded intermediate — подменяем.
    if (proxy && needsPaddedTransport(proxy.secret)) {
      client._connection = ConnectionTCPMTProxyPadded as unknown as typeof client._connection;
    }
    return client;
  }

  /**
   * Подключается, перебирая прокси по кругу. Без прокси — одна прямая попытка.
   * Возвращает подключённого клиента и индекс сработавшего прокси.
   */
  async connect(sessionString: string): Promise<ConnectedClient> {
    const total = Math.max(1, this.config.proxies.length);
    const start = this.rotation % total;
    this.rotation += 1;

    let lastError: unknown = null;
    for (let step = 0; step < total; step += 1) {
      const proxyIndex = (start + step) % total;
      const client = this.create(sessionString, proxyIndex);
      try {
        await client.connect();
        return { client, proxyIndex };
      } catch (error) {
        lastError = error;
        const label = this.config.proxies[proxyIndex]
          ? `${this.config.proxies[proxyIndex].host}:${this.config.proxies[proxyIndex].port}`
          : 'напрямую';
        this.logger.warn(
          `Не удалось подключиться к Telegram (${label}): ${error instanceof Error ? error.message : error}`,
        );
        await safeDestroy(client);
      }
    }

    throw new TelegramUnavailableError(
      lastError instanceof Error
        ? `Не удалось подключиться к Telegram: ${lastError.message}`
        : undefined,
    );
  }
}

function toProxyParam(proxy: MtProxyConfig) {
  return {
    MTProxy: true as const,
    ip: proxy.host,
    port: proxy.port,
    secret: proxy.secret,
    timeout: CONNECT_TIMEOUT_SEC,
  };
}

export async function safeDestroy(client: TelegramClient): Promise<void> {
  try {
    await client.destroy();
  } catch {
    // Клиент и так мёртв — падать из-за этого не нужно.
  }
}
