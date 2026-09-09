import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AiConfig, OPENAI_COMPATIBLE_PRESETS } from '../ai.config.js';
import type { AiProviderName } from '../ai.config.js';
import { AnthropicProvider } from './anthropic.provider.js';
import { CircuitBreaker } from './circuit-breaker.js';
import type { LlmProvider } from './llm-provider.interface.js';
import { MockProvider } from './mock.provider.js';
import { OpenAiCompatibleProvider } from './openai-compatible.provider.js';

/**
 * Создаёт провайдеров по имени и держит по одному экземпляру и одному
 * предохранителю на каждого (у DeepSeek и OpenAI — разные цепи).
 */
@Injectable()
export class LlmProviderFactory {
  private readonly providers = new Map<AiProviderName, LlmProvider>();
  private readonly breakers = new Map<AiProviderName, CircuitBreaker>();

  constructor(private readonly config: AiConfig) {}

  /** Провайдер аккаунта: из настроек или из env. Бросает 503, если не настроен. */
  resolve(name: string | null | undefined): { provider: LlmProvider; breaker: CircuitBreaker; name: AiProviderName } {
    const resolved = (name ?? this.config.provider) as AiProviderName;
    if (!this.config.isProviderConfigured(resolved)) {
      throw new ServiceUnavailableException(
        `Провайдер ${resolved} не настроен: задайте ключ в .env`,
      );
    }
    return { provider: this.get(resolved), breaker: this.breaker(resolved), name: resolved };
  }

  get(name: AiProviderName): LlmProvider {
    const existing = this.providers.get(name);
    if (existing) return existing;
    const created = this.create(name);
    this.providers.set(name, created);
    return created;
  }

  breaker(name: AiProviderName): CircuitBreaker {
    let breaker = this.breakers.get(name);
    if (!breaker) {
      breaker = new CircuitBreaker();
      this.breakers.set(name, breaker);
    }
    return breaker;
  }

  /** Для /ai/providers и /health. */
  describe(): { name: AiProviderName; models: string[]; configured: boolean; breaker: CircuitBreaker['state'] }[] {
    return (['deepseek', 'openai', 'anthropic', 'mock'] as AiProviderName[]).map((name) => ({
      name,
      models: modelsFor(name),
      configured: this.config.isProviderConfigured(name),
      breaker: this.breaker(name).state,
    }));
  }

  private create(name: AiProviderName): LlmProvider {
    switch (name) {
      case 'deepseek':
        return new OpenAiCompatibleProvider({
          name: 'deepseek',
          baseUrl: OPENAI_COMPATIBLE_PRESETS.deepseek.baseUrl,
          apiKey: this.config.deepseekApiKey,
          defaultModel: OPENAI_COMPATIBLE_PRESETS.deepseek.defaultModel,
          httpProxy: this.config.httpProxy,
          supportsJsonSchema: false,
        });
      case 'openai':
        return new OpenAiCompatibleProvider({
          name: 'openai',
          baseUrl: this.config.openaiBaseUrl,
          apiKey: this.config.openaiApiKey,
          defaultModel: OPENAI_COMPATIBLE_PRESETS.openai.defaultModel,
          httpProxy: this.config.httpProxy,
          supportsJsonSchema: true,
        });
      case 'anthropic':
        return new AnthropicProvider(this.config.anthropicApiKey);
      case 'mock':
        return new MockProvider();
      default:
        return new MockProvider();
    }
  }
}

function modelsFor(name: AiProviderName): string[] {
  switch (name) {
    case 'deepseek':
      return OPENAI_COMPATIBLE_PRESETS.deepseek.models;
    case 'openai':
      return OPENAI_COMPATIBLE_PRESETS.openai.models;
    case 'anthropic':
      return ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'];
    case 'mock':
      return ['mock'];
    default:
      return [];
  }
}
