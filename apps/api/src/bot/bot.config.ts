import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-chat';
const DEFAULT_LLM_TIMEOUT_MS = 30_000;
const DEFAULT_LLM_CONCURRENCY = 8;
const DEFAULT_POLL_MS = 30_000;

/**
 * Настройки агента из окружения; формат проверен при старте
 * (config/env.validation.ts), здесь — значения по умолчанию.
 *
 * Без ключа модели агент собирается, но ходы падают с понятной ошибкой при
 * первом обращении к LLM — раздел настроек при этом работает.
 */
@Injectable()
export class BotConfig {
  readonly llmApiKey: string;
  readonly llmBaseUrl: string;
  /** Модель по умолчанию; на аккаунте её можно переопределить. */
  readonly defaultModel: string;
  /** Таймаут одного обращения к модели — от запроса до последнего байта ответа. */
  readonly llmTimeoutMs: number;
  /**
   * Сколько обращений к модели идёт одновременно — на все ходы процесса.
   * Ходы по заданиям и ответы клиентам ждут очереди здесь, а не в слотах
   * поллера: паузы «как человек» слотов модели не занимают.
   */
  readonly llmConcurrency: number;
  /** Как часто поллер лестницы забирает созревшие задания; 0 и меньше — выключен. */
  readonly schedulerPollMs: number;

  constructor(config: ConfigService) {
    this.llmApiKey = config.get<string>('DEEPSEEK_API_KEY') ?? '';
    this.llmBaseUrl = (
      config.get<string>('DEEPSEEK_BASE_URL') ?? DEFAULT_BASE_URL
    ).replace(/\/+$/, '');
    this.defaultModel = config.get<string>('BOT_LLM_MODEL') ?? DEFAULT_MODEL;
    this.llmTimeoutMs = readNumber(
      config,
      'BOT_LLM_TIMEOUT_MS',
      DEFAULT_LLM_TIMEOUT_MS,
      (value) => value > 0,
    );
    this.llmConcurrency = Math.floor(
      readNumber(
        config,
        'BOT_LLM_CONCURRENCY',
        DEFAULT_LLM_CONCURRENCY,
        (value) => value >= 1,
      ),
    );
    this.schedulerPollMs = readNumber(
      config,
      'BOT_SCHEDULER_POLL_MS',
      DEFAULT_POLL_MS,
    );
  }

  get llmEnabled(): boolean {
    return this.llmApiKey !== '';
  }
}

function readNumber(
  config: ConfigService,
  key: string,
  fallback: number,
  accept: (value: number) => boolean = () => true,
): number {
  const value = Number(config.get<string>(key) ?? fallback);
  return Number.isFinite(value) && accept(value) ? value : fallback;
}
