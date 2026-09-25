import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Доступ к модели. Без ключа агент собирается, но ходы падают с понятной
 * ошибкой при первом обращении к LLM — раздел настроек при этом работает.
 */
@Injectable()
export class BotLlmConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  /** Модель по умолчанию; на аккаунте её можно переопределить. */
  readonly defaultModel: string;
  readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('DEEPSEEK_API_KEY') ?? '';
    this.baseUrl = (config.get<string>('DEEPSEEK_BASE_URL') ?? 'https://api.deepseek.com').replace(/\/+$/, '');
    this.defaultModel = config.get<string>('BOT_LLM_MODEL') ?? 'deepseek-chat';
    const timeout = Number(config.get<string>('BOT_LLM_TIMEOUT_MS') ?? 30_000);
    this.timeoutMs = Number.isFinite(timeout) && timeout > 0 ? timeout : 30_000;
  }

  get enabled(): boolean {
    return this.apiKey !== '';
  }
}
