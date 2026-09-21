import { Injectable, Logger } from '@nestjs/common';
import { AiConfig } from '../../ai.config.js';
import { completeJson } from '../../llm/complete-json.js';
import { LlmError } from '../../llm/llm-provider.interface.js';
import type { LlmCompletionResult } from '../../llm/llm-provider.interface.js';
import { LlmProviderFactory } from '../../llm/llm-provider.factory.js';
import { COMPOSER_JSON_SCHEMA, composerOutputSchema } from './composer.schema.js';
import type { ComposerOutput } from './composer.schema.js';

export interface ComposeResult {
  output: ComposerOutput;
  raw: LlmCompletionResult;
  durationMs: number;
}

/**
 * Composer (раздел 4.2 ТЗ): один structured-вызов модели на ход.
 * Провайдер и предохранитель — из фабрики; повтор при невалидном JSON —
 * внутри completeJson. Промпты сюда приходят готовыми.
 */
@Injectable()
export class ComposerService {
  private readonly logger = new Logger(ComposerService.name);

  constructor(
    private readonly providers: LlmProviderFactory,
    private readonly config: AiConfig,
  ) {}

  get modelName(): string {
    return this.config.model;
  }

  async compose(system: string, user: string): Promise<ComposeResult> {
    const { provider, breaker, name } = this.providers.resolve();
    if (!breaker.allow()) {
      throw new LlmError('server', `Провайдер ${name} временно недоступен (предохранитель), повтор через ${Math.ceil(breaker.retryAfterMs / 1000)} с`);
    }
    const startedAt = Date.now();
    try {
      const { raw, data } = await completeJson(
        provider,
        {
          system,
          messages: [{ role: 'user', content: user }],
          schemaName: 'composer_turn',
          jsonSchema: COMPOSER_JSON_SCHEMA,
          maxTokens: this.config.maxOutputTokens,
          timeoutMs: this.config.requestTimeoutMs,
          model: this.config.model,
          temperature: this.config.temperature,
        },
        composerOutputSchema,
        'composer',
      );
      breaker.onSuccess();
      return { output: data, raw, durationMs: Date.now() - startedAt };
    } catch (error) {
      // Наши ошибки запроса и невалидный JSON — не повод открывать предохранитель.
      if (!(error instanceof LlmError) || error.retryable) breaker.onFailure();
      this.logger.warn(`Composer: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}
