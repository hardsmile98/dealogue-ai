import { Logger } from '@nestjs/common';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import type { Dispatcher } from 'undici';
import { wellFormed } from '../lib/text.js';
import { extractJson } from './json-parse.js';
import { LlmError } from './llm-provider.interface.js';
import type {
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmProvider,
} from './llm-provider.interface.js';

export interface OpenAiCompatibleOptions {
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  httpProxy?: string | null;
  /**
   * Пробовать `response_format: json_schema` (strict). DeepSeek его не
   * поддерживает — там сразу `json_object` со схемой в промпте.
   */
  supportsJsonSchema: boolean;
}

interface ChatCompletionResponse {
  model?: string;
  choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_cache_hit_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
  error?: { message?: string; type?: string };
}

/**
 * Провайдер для любого OpenAI-совместимого API: DeepSeek, OpenAI, локальные
 * модели. Без SDK — обычный fetch (undici), чтобы прокси задавался одинаково.
 */
export class OpenAiCompatibleProvider implements LlmProvider {
  private readonly logger = new Logger(OpenAiCompatibleProvider.name);
  private readonly dispatcher: Dispatcher | undefined;
  private jsonSchemaBroken = false;

  readonly name: string;

  constructor(private readonly options: OpenAiCompatibleOptions) {
    this.name = options.name;
    this.dispatcher = options.httpProxy ? new ProxyAgent(options.httpProxy) : undefined;
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const useSchema = this.options.supportsJsonSchema && !this.jsonSchemaBroken;
    try {
      return await this.call(request, useSchema);
    } catch (error) {
      // Бэкенд не принял json_schema — запоминаем и откатываемся на json_object.
      if (useSchema && error instanceof LlmError && error.kind === 'bad_request') {
        this.logger.warn(`${this.name}: json_schema отклонён, переходим на json_object`);
        this.jsonSchemaBroken = true;
        return this.call(request, false);
      }
      throw error;
    }
  }

  private async call(request: LlmCompletionRequest, useSchema: boolean): Promise<LlmCompletionResult> {
    const model = request.model ?? this.options.defaultModel;
    // В режиме json_object схема живёт в промпте; слово «JSON» в нём обязательно (иначе DeepSeek/OpenAI вернут 400).
    const system = useSchema
      ? request.system
      : `${request.system}\n\nОтвечай только одним валидным JSON-объектом по этой JSON Schema, без пояснений и markdown:\n${JSON.stringify(request.jsonSchema)}`;
    const body = {
      model,
      messages: [
        // Одинокие суррогаты (обрубки эмодзи, в т.ч. из самого Telegram) ломают JSON у провайдера.
        { role: 'system', content: wellFormed(system) },
        ...request.messages.map((m) => ({ role: m.role, content: wellFormed(m.content) })),
      ],
      max_tokens: request.maxTokens,
      temperature: request.temperature ?? 1,
      stream: false,
      response_format: useSchema
        ? {
            type: 'json_schema',
            json_schema: { name: request.schemaName, schema: request.jsonSchema, strict: true },
          }
        : { type: 'json_object' },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    let response: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      response = await undiciFetch(`${this.options.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        dispatcher: this.dispatcher,
      });
    } catch (error) {
      clearTimeout(timer);
      const reason = error instanceof Error ? error.message : String(error);
      const hint = this.options.httpProxy ? '' : ' (если API недоступен из вашей сети — задайте AI_HTTP_PROXY)';
      throw new LlmError('network', `${this.name}: сеть недоступна — ${reason}${hint}`);
    }
    clearTimeout(timer);

    const raw = await response.text();
    let parsed: ChatCompletionResponse = {};
    try {
      parsed = JSON.parse(raw) as ChatCompletionResponse;
    } catch {
      // не JSON — обработаем по статусу ниже
    }

    if (!response.ok) {
      const message = parsed.error?.message ?? raw.slice(0, 300);
      throw new LlmError(kindOf(response.status), `${this.name}: HTTP ${response.status} — ${message}`, response.status);
    }

    const choice = parsed.choices?.[0];
    if (choice?.message?.refusal) {
      throw new LlmError('refusal', `${this.name}: модель отказалась — ${choice.message.refusal}`);
    }
    const text = choice?.message?.content ?? '';
    const usage = parsed.usage ?? {};
    return {
      text,
      json: extractJson(text),
      model: parsed.model ?? model,
      stopReason: choice?.finish_reason ?? 'stop',
      usage: {
        inputTokens: usage.prompt_tokens ?? 0,
        outputTokens: usage.completion_tokens ?? 0,
        cacheHitTokens: usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? 0,
      },
    };
  }
}

function kindOf(status: number): LlmError['kind'] {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server';
  return 'bad_request';
}
