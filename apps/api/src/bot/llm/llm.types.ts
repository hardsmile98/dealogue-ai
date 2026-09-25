export type LlmRole = 'system' | 'user' | 'assistant';

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface LlmRequest {
  model: string;
  messages: LlmMessage[];
  temperature: number;
  /** Просить у модели строго JSON (response_format json_object). */
  json: boolean;
  maxTokens?: number;
  /** Остановка API: обращение обрывается, ход подхватит восстановление. */
  signal?: AbortSignal;
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  /** Сколько токенов промпта пришло из кэша префикса. */
  cachedTokens: number;
}

export interface LlmResponse {
  text: string;
  usage: LlmUsage | null;
  /** Сколько заняло обращение, мс. */
  latencyMs: number;
}

/** Единственное, что ядро знает о модели. Telegram-провайдеров не касается. */
export interface LlmClient {
  complete(request: LlmRequest): Promise<LlmResponse>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    /** HTTP-статус ответа провайдера, если был. */
    readonly status: number | null = null,
    /** Повторять ли обращение: сеть, 429, 5xx — да; 4xx по нашей вине — нет. */
    readonly retryable = true,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}
