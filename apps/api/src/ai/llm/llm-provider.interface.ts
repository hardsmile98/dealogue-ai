export type LlmRole = 'user' | 'assistant';

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface LlmCompletionRequest {
  system: string;
  messages: LlmMessage[];
  /** Имя схемы ответа (для провайдеров с json_schema). */
  schemaName: string;
  /** JSON Schema ожидаемого ответа. */
  jsonSchema: Record<string, unknown>;
  maxTokens: number;
  timeoutMs: number;
  /** Переопределение модели (из настроек аккаунта). */
  model?: string;
  temperature?: number;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens: number;
}

export interface LlmCompletionResult {
  /** Сырой текст ответа модели. */
  text: string;
  /** Распарсенный JSON или null, если модель вернула не JSON. */
  json: unknown | null;
  model: string;
  stopReason: string;
  usage: LlmUsage;
}

export interface LlmProvider {
  readonly name: string;
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResult>;
}

/** Классификация ошибок провайдера — от неё зависит, повторять ли запрос. */
export type LlmErrorKind =
  | 'auth' // неверный ключ — повторять бессмысленно
  | 'rate_limit' // 429 — повторить позже
  | 'server' // 5xx — повторить позже
  | 'network' // сеть/прокси/таймаут — повторить позже
  | 'bad_request' // 400 — наша ошибка в запросе
  | 'refusal' // модель отказалась отвечать
  | 'invalid_json'; // ответ не разобрался как JSON

export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }

  get retryable(): boolean {
    return this.kind === 'rate_limit' || this.kind === 'server' || this.kind === 'network';
  }
}

export function isLlmError(error: unknown): error is LlmError {
  return error instanceof LlmError;
}
