import type { ZodType } from 'zod';
import { clipStart } from '../lib/text.js';
import { LlmError } from './llm-provider.interface.js';
import type {
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmProvider,
} from './llm-provider.interface.js';

/**
 * Вызов модели с разбором ответа по схеме и одним повтором-починкой: модели
 * возвращают её же ответ с указанием, что не сошлось. Если и второй раз не
 * вышло — LlmError('invalid_json') с человеческой причиной (пустой ответ,
 * обрыв по лимиту токенов, не JSON, не та схема), а не сообщением zod про null.
 */
export async function completeJson<T>(
  provider: LlmProvider,
  request: LlmCompletionRequest,
  schema: ZodType<T>,
  label: string,
): Promise<{ raw: LlmCompletionResult; data: T }> {
  let raw = await provider.complete(request);
  let parsed = schema.safeParse(raw.json);
  if (parsed.success) return { raw, data: parsed.data };

  raw = await provider.complete({
    ...request,
    messages: [
      ...request.messages,
      { role: 'assistant', content: clipStart(raw.text, 2000) || '{}' },
      {
        role: 'user',
        content: `Предыдущий ответ не подошёл (${reason(raw, parsed.error)}). Верни только один валидный JSON-объект по схеме, без пояснений и markdown, и уложись в лимит токенов — сокращай списки, но не обрывай JSON.`,
      },
    ],
  });
  parsed = schema.safeParse(raw.json);
  if (parsed.success) return { raw, data: parsed.data };

  throw new LlmError('invalid_json', `${label}: ${reason(raw, parsed.error)}`);
}

/** Почему ответ не подошёл — по сырому ответу, а не только по ошибке схемы. */
function reason(raw: LlmCompletionResult, error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  if (raw.json === null) {
    if (!raw.text.trim()) return `${raw.model} вернул пустой ответ`;
    if (raw.stopReason === 'length') return `ответ ${raw.model} обрезан лимитом токенов (${raw.usage.outputTokens})`;
    return `ответ ${raw.model} не разобрался как JSON: ${clipStart(raw.text.replace(/\s+/g, ' '), 200)}`;
  }
  const issue = error.issues[0];
  const path = issue?.path.map(String).join('.');
  return `ответ не по схеме (${path ? `${path}: ` : ''}${issue?.message ?? 'invalid'})`;
}
