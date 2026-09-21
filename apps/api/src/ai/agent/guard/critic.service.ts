import { Injectable, Logger } from '@nestjs/common';
import { AiConfig } from '../../ai.config.js';
import { completeJson } from '../../llm/complete-json.js';
import { LlmProviderFactory } from '../../llm/llm-provider.factory.js';
import type { GuardViolation } from '../agent.types.js';
import { CRITIC_JSON_SCHEMA, CRITIC_SYSTEM, buildCriticPrompt, criticOutputSchema, shouldReview } from './critic.js';
import type { CriticInput } from './critic.js';

/** Разбор ответа: что исправить и во что обошёлся вызов. */
export interface CriticResult {
  violations: GuardViolation[];
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
}

/** Критику нужен разбор, а не сочинение: температура ноль. */
const TEMPERATURE = 0;
/** Ответ короткий — списка замечаний хватает с запасом. */
const MAX_TOKENS = 500;

/**
 * Смысловая проверка ответа второй моделью (правила отбора и промпт — в
 * `critic.ts`). Зовётся из TurnGeneration после guard'а и только пока
 * остаётся попытка переписать ответ.
 *
 * Критик — подсказка, а не условие хода: выключенный флагом, открытый
 * предохранитель, таймаут и любая ошибка провайдера означают «замечаний
 * нет». Ход из-за критика не падает и в передачу менеджеру не уходит.
 */
@Injectable()
export class CriticService {
  private readonly logger = new Logger(CriticService.name);

  constructor(
    private readonly providers: LlmProviderFactory,
    private readonly config: AiConfig,
  ) {}

  get enabled(): boolean {
    return this.config.criticEnabled;
  }

  /** Замечания к ответу или null, если разбор не нужен и не удался. */
  async review(input: CriticInput): Promise<CriticResult | null> {
    if (!this.enabled) return null;
    if (!shouldReview({ stage: input.stage, confidence: input.confidence, firstReply: input.firstReply })) return null;
    if (!input.reply.trim()) return null;

    const startedAt = Date.now();
    try {
      const { provider, breaker } = this.providers.resolve();
      // Предохранитель открыт — провайдер и так на ладан дышит, не добиваем его разбором.
      if (!breaker.allow()) return null;

      const { raw, data } = await completeJson(
        provider,
        {
          system: CRITIC_SYSTEM,
          messages: [{ role: 'user', content: buildCriticPrompt(input) }],
          schemaName: 'critic_review',
          jsonSchema: CRITIC_JSON_SCHEMA,
          maxTokens: MAX_TOKENS,
          timeoutMs: this.config.requestTimeoutMs,
          model: this.config.model,
          temperature: TEMPERATURE,
        },
        criticOutputSchema,
        'critic',
      );

      // `ok` и непустой список — противоречие; верим списку, он конкретнее.
      const violations: GuardViolation[] = data.violations.map((detail) => ({
        check: 'critic',
        messageIndex: null,
        detail,
      }));
      return {
        violations,
        tokensIn: raw.usage.inputTokens,
        tokensOut: raw.usage.outputTokens,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      this.logger.warn(`Разбор ответа не удался: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
}
