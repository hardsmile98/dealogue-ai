import { LlmError } from './llm-provider.interface.js';
import type {
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmProvider,
} from './llm-provider.interface.js';

/**
 * Детерминированный провайдер для тестов и песочницы без сети. Отвечает
 * по схеме Composer, реагируя на ключевые слова в промпте хода:
 * «ошибка» → сбой провайдера, «оплат/реквизит» → ready_to_pay,
 * «вы бот» → suspects_bot, «не пишите» → refusal, «тишина» → send:false.
 * Обязательные блоки из задачи вставляет маркерами.
 */
export class MockProvider implements LlmProvider {
  readonly name = 'mock';

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const user = [...request.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const newMessages = section(user, 'НОВЫЕ СООБЩЕНИЯ КЛИЕНТА');
    const lower = newMessages.toLowerCase();

    if (/ошибка провайдера/.test(lower)) {
      throw new LlmError('server', 'mock: искусственная ошибка провайдера', 500);
    }

    const json = this.decide(user, lower);
    return {
      text: JSON.stringify(json),
      json,
      model: 'mock',
      stopReason: 'stop',
      usage: { inputTokens: Math.round((request.system.length + user.length) / 4), outputTokens: 60, cacheHitTokens: 0 },
    };
  }

  private decide(user: string, lower: string): Record<string, unknown> {
    const stage = /ЭТАП:\s*([a-z_]+)/.exec(user)?.[1] ?? 'greeting';
    const required = [...user.matchAll(/\[\[BLOCK:([a-z0-9_.-]+)\]\] — [^\n]*\(ОБЯЗАТЕЛЬНО/g)].map((m) => m[1]);
    const escalation = (reason: string, note: string) => this.base(stage, { escalation: { reason, note } }, { send: false, messages: [], silentReason: note });

    if (/оплат|реквизит|беру/.test(lower)) return escalation('ready_to_pay', 'mock: клиент готов платить');
    if (/вы бот|ты бот|это бот/.test(lower)) return escalation('suspects_bot', 'mock: подозревает бота');
    if (/не пишите|отпишите/.test(lower)) return escalation('refusal', 'mock: просит не писать');
    if (/тишина/.test(lower)) return this.base(stage, {}, { send: false, messages: [], silentReason: 'mock: уместно промолчать' });

    const messages: string[] = [];
    if (stage === 'greeting') messages.push('Привет! Рад знакомству. Напишите, пожалуйста, дату и место рождения — посмотрю вашу карту.');
    else if (/касание|напомни|молчит/i.test(user)) messages.push('Mock: мягкое касание — как вы, есть вопросы?');
    else messages.push(`Mock: ответ на «${section(user, 'НОВЫЕ СООБЩЕНИЯ КЛИЕНТА').slice(0, 60).replace(/\s+/g, ' ').trim()}»`);
    for (const kind of required) messages.push(`[[BLOCK:${kind}]]`);
    if (required.includes('diagnostics')) messages.push('Что откликнулось? Есть вопросы?');

    const birth = /(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(lower);
    const card = {
      birthDate: birth ? `${birth[3]}-${birth[2].padStart(2, '0')}-${birth[1].padStart(2, '0')}` : null,
      birthDateText: birth ? birth[0] : null,
      birthPlace: /москв/.test(lower) ? 'Москва' : null,
      gender: null,
      language: 'ru',
      requestSummary: /отношен|муж|парн|развод/.test(lower) ? 'проблемы в отношениях' : null,
      requestCategoryKey: null,
      minorHint: false,
      openThreads: [],
      facts: [],
      cleared: [],
      evidence: [],
    };
    const progress = stage === 'greeting' || card.requestSummary ? 'advance' : 'stay';
    return this.base(stage, { card, stageProgress: progress }, { send: true, messages, silentReason: null });
  }

  private base(stage: string, analysis: Record<string, unknown>, reply: Record<string, unknown>): Record<string, unknown> {
    return {
      analysis: {
        clientIntent: `mock: этап ${stage}`,
        card: {},
        escalation: null,
        stageProgress: 'stay',
        confidence: 0.9,
        replyPlan: `mock: план ответа на этапе ${stage}`,
        ...analysis,
      },
      reply,
    };
  }
}

function section(text: string, title: string): string {
  const start = text.indexOf(title);
  if (start === -1) return '';
  const rest = text.slice(start + title.length);
  const end = rest.search(/\n[А-ЯЁ][А-ЯЁ ]{4,}[:(]/);
  return end === -1 ? rest : rest.slice(0, end);
}
