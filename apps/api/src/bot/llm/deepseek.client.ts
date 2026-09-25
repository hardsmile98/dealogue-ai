import { Injectable, Logger } from '@nestjs/common';
import { BotLlmConfig } from './bot-llm.config.js';
import { LlmError } from './llm.types.js';
import type { LlmClient, LlmRequest, LlmResponse } from './llm.types.js';

interface ChatCompletion {
  choices?: { message?: { content?: string | null } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_cache_hit_tokens?: number;
  };
  error?: { message?: string };
}

/**
 * DeepSeek через OpenAI-совместимый /chat/completions. Кэш префикса на
 * стороне провайдера автоматический: статичная часть промпта должна идти
 * первой (docs/agent-architecture.md, раздел 7).
 */
@Injectable()
export class DeepSeekClient implements LlmClient {
  private readonly logger = new Logger(DeepSeekClient.name);

  constructor(private readonly config: BotLlmConfig) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    if (!this.config.enabled) {
      throw new LlmError('Не задан DEEPSEEK_API_KEY', null, false);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          temperature: request.temperature,
          max_tokens: request.maxTokens ?? 2048,
          stream: false,
          ...(request.json ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: controller.signal,
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === 'AbortError'
        ? `таймаут ${this.config.timeoutMs} мс`
        : error instanceof Error ? error.message : String(error);
      throw new LlmError(`DeepSeek недоступен: ${reason}`, null, true);
    } finally {
      clearTimeout(timer);
    }

    const latencyMs = Date.now() - startedAt;
    const body = (await response.json().catch(() => null)) as ChatCompletion | null;
    if (!response.ok) {
      const detail = body?.error?.message ?? response.statusText;
      const retryable = response.status === 429 || response.status >= 500;
      throw new LlmError(`DeepSeek ответил ${response.status}: ${detail}`, response.status, retryable);
    }
    const text = body?.choices?.[0]?.message?.content ?? '';
    if (!text.trim()) throw new LlmError('DeepSeek вернул пустой ответ', response.status, true);
    const usage = body?.usage
      ? {
          promptTokens: body.usage.prompt_tokens ?? 0,
          completionTokens: body.usage.completion_tokens ?? 0,
          cachedTokens: body.usage.prompt_cache_hit_tokens ?? 0,
        }
      : null;
    this.logger.debug(
      `${request.model}: ${latencyMs} мс, промпт ${usage?.promptTokens ?? '?'} (из кэша ${usage?.cachedTokens ?? '?'}), ответ ${usage?.completionTokens ?? '?'}`,
    );
    return { text, usage, latencyMs };
  }
}
