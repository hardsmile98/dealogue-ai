import { LlmError } from './llm-provider.interface.js';
import type {
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmProvider,
} from './llm-provider.interface.js';

/**
 * Заглушка второго провайдера. Подключается позже: `npm i @anthropic-ai/sdk`,
 * затем `client.messages.parse` с `output_config.format` (structured output),
 * прокси через `fetchOptions.dispatcher`. Пока сообщает, что не настроен, —
 * чтобы выбор провайдера в настройках не ломал приложение.
 */
export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';

  constructor(private readonly apiKey: string) {}

  async complete(_request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    if (!this.apiKey) throw new LlmError('auth', 'anthropic: ANTHROPIC_API_KEY не задан');
    throw new LlmError(
      'bad_request',
      'anthropic: адаптер ещё не подключён — установите @anthropic-ai/sdk и реализуйте AnthropicProvider',
    );
  }
}
