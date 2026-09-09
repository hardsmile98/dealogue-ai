import { LlmError } from './llm-provider.interface.js';
import type {
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmProvider,
} from './llm-provider.interface.js';

/**
 * Детерминированный провайдер для тестов без внешнего API. Реагирует на
 * ключевые слова в последнем сообщении пользователя и на тип схемы.
 */
export class MockProvider implements LlmProvider {
  readonly name = 'mock';

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const last = [...request.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const lower = last.toLowerCase();

    if (/ошибка/.test(lower)) {
      throw new LlmError('server', 'mock: искусственная ошибка провайдера', 500);
    }

    const json = this.decide(request.schemaName, lower, last);
    return {
      text: JSON.stringify(json),
      json,
      model: 'mock',
      stopReason: 'stop',
      usage: { inputTokens: request.system.length / 4, outputTokens: 40, cacheHitTokens: 0 },
    };
  }

  private decide(schemaName: string, lower: string, original: string): Record<string, unknown> {
    if (schemaName === 'digest_partial') {
      return {
        styleObservations: ['пишет коротко, без точек в конце', 'обращается на «вы»'],
        phrases: [
          { intent: 'greeting', text: 'Здравствуйте! Подскажите, что вас интересует?' },
          { intent: 'price', text: 'Стоимость зависит от формата, могу рассчитать под вас' },
        ],
        faq: [{ q: 'Сколько стоит?', a: 'Зависит от формата, рассчитаю под вашу задачу' }],
        objections: [{ objection: 'Дорого', answer: 'Есть рассрочка, могу расписать варианты' }],
        facts: ['Есть рассрочка'],
        exemplars: [],
      };
    }
    if (schemaName === 'digest_reduce') {
      return {
        styleGuide: 'Mock: коротко, дружелюбно, на «вы», без точки в конце.',
        phrasebook: [{ intent: 'greeting', phrases: ['Здравствуйте! Подскажите, что вас интересует?'] }],
        faq: [{ q: 'Сколько стоит?', a: 'Зависит от формата', seen: 3 }],
        objections: [{ objection: 'Дорого', answer: 'Есть рассрочка', seen: 2 }],
        facts: ['Есть рассрочка'],
      };
    }

    const followup = /касание \d+ из \d+/i.exec(original);
    if (followup) {
      return {
        messages: [`Mock follow-up: ${followup[0]}`],
        stage: 'offer',
        confidence: 0.8,
        ready_to_pay: false,
        needs_human: false,
        silent: false,
        reason: 'mock followup',
      };
    }
    if (/тишина/.test(lower)) {
      return base({ silent: true, messages: [], reason: 'mock silent' });
    }
    if (/оплат|реквизит/.test(lower)) {
      return base({ messages: ['Mock: отлично, передаю менеджеру для оформления'], stage: 'payment', ready_to_pay: true });
    }
    if (/менеджер|человек/.test(lower)) {
      return base({ messages: ['Mock: сейчас подключу коллегу'], needs_human: true });
    }
    return base({ messages: [`Mock: ответ на «${original.slice(0, 60)}»`] });
  }
}

function base(patch: Record<string, unknown>): Record<string, unknown> {
  return {
    messages: [],
    stage: 'qualify',
    confidence: 0.9,
    ready_to_pay: false,
    needs_human: false,
    silent: false,
    reason: 'mock',
    ...patch,
  };
}
