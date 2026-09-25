import { Injectable, Logger } from '@nestjs/common';
import { errorMessage } from '../../common/errors.js';
import { BotConfig } from '../bot.config.js';
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
 *
 * Таймаут `BOT_LLM_TIMEOUT_MS` покрывает весь обмен — и ожидание заголовков,
 * и чтение тела: оборвавшаяся на середине передача не повесит ход.
 */
@Injectable()
export class DeepSeekClient implements LlmClient {
  private readonly logger = new Logger(DeepSeekClient.name);

  constructor(private readonly config: BotConfig) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    if (!this.config.llmEnabled) {
      throw new LlmError('Не задан DEEPSEEK_API_KEY', null, false);
    }
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.config.llmTimeoutMs,
    );
    const startedAt = Date.now();
    let status: number;
    let statusText: string;
    let raw: string;
    try {
      const response = await fetch(
        `${this.config.llmBaseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.config.llmApiKey}`,
          },
          body: JSON.stringify({
            model: request.model,
            messages: request.messages,
            temperature: request.temperature,
            max_tokens: request.maxTokens ?? 2048,
            stream: false,
            ...(request.json
              ? { response_format: { type: 'json_object' } }
              : {}),
          }),
          signal: controller.signal,
        },
      );
      status = response.status;
      statusText = response.statusText;
      raw = await response.text();
    } catch (error) {
      const reason = controller.signal.aborted
        ? `таймаут ${this.config.llmTimeoutMs} мс`
        : errorMessage(error);
      throw new LlmError(`DeepSeek недоступен: ${reason}`, null, true);
    } finally {
      clearTimeout(timer);
    }

    const latencyMs = Date.now() - startedAt;
    const body = parseBody(raw);
    if (status < 200 || status >= 300) {
      const detail = body?.error?.message ?? statusText;
      const retryable = status === 429 || status >= 500;
      throw new LlmError(
        `DeepSeek ответил ${status}: ${detail}`,
        status,
        retryable,
      );
    }
    const text = body?.choices?.[0]?.message?.content ?? '';
    if (!text.trim()) {
      throw new LlmError('DeepSeek вернул пустой ответ', status, true);
    }
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

/** Тело ответа как JSON; не JSON (страница прокси, обрыв) — null. */
function parseBody(raw: string): ChatCompletion | null {
  try {
    return JSON.parse(raw) as ChatCompletion;
  } catch {
    return null;
  }
}
