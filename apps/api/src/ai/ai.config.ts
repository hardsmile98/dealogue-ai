import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type AiProviderName = 'deepseek' | 'openai' | 'mock';

const PROVIDER_NAMES: AiProviderName[] = ['deepseek', 'openai', 'mock'];

/** Предустановки OpenAI-совместимых провайдеров. */
export const OPENAI_COMPATIBLE_PRESETS: Record<
  'deepseek' | 'openai',
  { baseUrl: string; defaultModel: string; models: string[]; keyEnv: string }
> = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat'],
    keyEnv: 'DEEPSEEK_API_KEY',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1-mini',
    models: ['gpt-4.1-mini', 'gpt-4.1'],
    keyEnv: 'OPENAI_API_KEY',
  },
};

/**
 * Настройки ИИ-агента из env. Читаются один раз. Без ключа выбранного
 * провайдера модуль поднимается «выключенным»: воркер не делает ходов,
 * эндпоинты настроек и библиотеки работают.
 */
@Injectable()
export class AiConfig {
  private readonly logger = new Logger(AiConfig.name);

  /** Глобальный выключатель (kill switch). */
  readonly enabled: boolean;
  readonly provider: AiProviderName;
  readonly model: string;
  readonly deepseekApiKey: string;
  readonly openaiApiKey: string;
  readonly openaiBaseUrl: string;
  /** HTTP CONNECT-прокси для запросов к провайдеру (http://user:pass@host:port). */
  readonly httpProxy: string | null;
  readonly maxOutputTokens: number;
  readonly requestTimeoutMs: number;
  readonly workerConcurrency: number;
  readonly workerPollMs: number;
  /** Новые аккаунты стартуют в сухом прогоне. */
  readonly defaultDryRun: boolean;
  /** Паузы «на чтение» и «печатает» при отправке; false — для отладки без ожиданий. */
  readonly humanDelays: boolean;
  readonly webUrl: string;

  constructor(config: ConfigService) {
    this.enabled = (config.get<string>('AI_ENABLED') ?? 'true') !== 'false';
    const provider = (config.get<string>('AI_PROVIDER') ?? 'deepseek').trim() as AiProviderName;
    this.provider = PROVIDER_NAMES.includes(provider) ? provider : 'deepseek';
    this.deepseekApiKey = config.get<string>('DEEPSEEK_API_KEY') ?? '';
    this.openaiApiKey = config.get<string>('OPENAI_API_KEY') ?? '';
    this.openaiBaseUrl =
      config.get<string>('OPENAI_BASE_URL') || OPENAI_COMPATIBLE_PRESETS.openai.baseUrl;
    this.httpProxy = config.get<string>('AI_HTTP_PROXY') || null;
    this.model = config.get<string>('AI_MODEL') || defaultModelFor(this.provider);
    this.maxOutputTokens = readInt(config, 'AI_MAX_OUTPUT_TOKENS', 2048);
    this.requestTimeoutMs = readInt(config, 'AI_REQUEST_TIMEOUT_SEC', 60) * 1000;
    this.workerConcurrency = readInt(config, 'AI_WORKER_CONCURRENCY', 3);
    this.workerPollMs = readInt(config, 'AI_WORKER_POLL_SEC', 3) * 1000;
    this.defaultDryRun = (config.get<string>('AI_DEFAULT_DRY_RUN') ?? 'true') !== 'false';
    this.humanDelays = (config.get<string>('AI_HUMAN_DELAYS') ?? 'true') !== 'false';
    this.webUrl = (config.get<string>('WEB_URL') ?? 'http://localhost:5173').replace(/\/+$/, '');

    if (!this.enabled) {
      this.logger.warn('AI_ENABLED=false — ИИ-агент выключен');
    } else if (!this.isProviderConfigured(this.provider)) {
      this.logger.warn(
        `Ключ провайдера ${this.provider} не задан — ИИ-агент не будет генерировать ответы`,
      );
    }
  }

  /** Есть ли всё нужное, чтобы звать провайдера. */
  isProviderConfigured(provider: AiProviderName): boolean {
    switch (provider) {
      case 'deepseek':
        return this.deepseekApiKey.length > 0;
      case 'openai':
        return this.openaiApiKey.length > 0;
      case 'mock':
        return true;
      default:
        return false;
    }
  }

  get ready(): boolean {
    return this.enabled && this.isProviderConfigured(this.provider);
  }
}

export function defaultModelFor(provider: AiProviderName): string {
  switch (provider) {
    case 'deepseek':
      return OPENAI_COMPATIBLE_PRESETS.deepseek.defaultModel;
    case 'openai':
      return OPENAI_COMPATIBLE_PRESETS.openai.defaultModel;
    case 'mock':
      return 'mock';
    default:
      return 'deepseek-chat';
  }
}

function readInt(config: ConfigService, key: string, fallback: number): number {
  const raw = config.get<string>(key);
  const value = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
