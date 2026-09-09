import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type AiProviderName = 'deepseek' | 'openai' | 'anthropic' | 'mock';

const PROVIDER_NAMES: AiProviderName[] = ['deepseek', 'openai', 'anthropic', 'mock'];

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

export const ANTHROPIC_MODELS = ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'];

/**
 * Настройки ИИ-агента из env. Читаются один раз. Без ключа выбранного
 * провайдера модуль поднимается «выключенным»: воркер не берёт reply/followup,
 * эндпоинты настроек работают, генерация отвечает 503.
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
  readonly anthropicApiKey: string;
  readonly anthropicFallbacks: boolean;
  /** HTTP CONNECT-прокси для запросов к провайдеру (http://user:pass@host:port). */
  readonly httpProxy: string | null;
  readonly maxOutputTokens: number;
  readonly requestTimeoutMs: number;
  readonly workerConcurrency: number;
  readonly workerPollMs: number;
  readonly followupsPerHour: number;
  readonly digestMaxDialogs: number;
  readonly importMaxAgeDays: number;
  readonly webUrl: string;

  constructor(config: ConfigService) {
    this.enabled = (config.get<string>('AI_ENABLED') ?? 'true') !== 'false';
    const provider = (config.get<string>('AI_PROVIDER') ?? 'deepseek').trim() as AiProviderName;
    this.provider = PROVIDER_NAMES.includes(provider) ? provider : 'deepseek';
    this.deepseekApiKey = config.get<string>('DEEPSEEK_API_KEY') ?? '';
    this.openaiApiKey = config.get<string>('OPENAI_API_KEY') ?? '';
    this.openaiBaseUrl =
      config.get<string>('OPENAI_BASE_URL') ?? OPENAI_COMPATIBLE_PRESETS.openai.baseUrl;
    this.anthropicApiKey = config.get<string>('ANTHROPIC_API_KEY') ?? '';
    this.anthropicFallbacks = config.get<string>('AI_ANTHROPIC_FALLBACKS') === 'true';
    this.httpProxy = config.get<string>('AI_HTTP_PROXY') || null;
    this.model = config.get<string>('AI_MODEL') || defaultModelFor(this.provider);
    this.maxOutputTokens = readInt(config, 'AI_MAX_OUTPUT_TOKENS', 2048);
    this.requestTimeoutMs = readInt(config, 'AI_REQUEST_TIMEOUT_SEC', 60) * 1000;
    this.workerConcurrency = readInt(config, 'AI_WORKER_CONCURRENCY', 3);
    this.workerPollMs = readInt(config, 'AI_WORKER_POLL_SEC', 3) * 1000;
    this.followupsPerHour = readInt(config, 'AI_FOLLOWUPS_PER_HOUR', 30);
    this.digestMaxDialogs = readInt(config, 'AI_DIGEST_MAX_DIALOGS', 400);
    this.importMaxAgeDays = readInt(config, 'AI_IMPORT_MAX_AGE_DAYS', 730);
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
      case 'anthropic':
        return this.anthropicApiKey.length > 0;
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
    case 'anthropic':
      return ANTHROPIC_MODELS[0];
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
