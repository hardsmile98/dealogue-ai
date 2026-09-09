import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { completeJson } from './complete-json.js';
import { LlmError } from './llm-provider.interface.js';
import type { LlmCompletionRequest, LlmCompletionResult, LlmProvider } from './llm-provider.interface.js';

const Schema = z.object({ styleGuide: z.string() });

const request: LlmCompletionRequest = {
  system: 'system',
  messages: [{ role: 'user', content: 'наблюдения' }],
  schemaName: 'digest_reduce',
  jsonSchema: {},
  maxTokens: 100,
  timeoutMs: 1000,
};

/** Провайдер, отдающий заранее заданные ответы по очереди. */
function fake(...replies: Partial<LlmCompletionResult>[]): LlmProvider & { calls: LlmCompletionRequest[] } {
  const calls: LlmCompletionRequest[] = [];
  return {
    name: 'fake',
    calls,
    async complete(req) {
      calls.push(req);
      const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
      return {
        text: '',
        json: null,
        model: 'fake-model',
        stopReason: 'stop',
        usage: { inputTokens: 0, outputTokens: 0, cacheHitTokens: 0 },
        ...reply,
      };
    },
  };
}

describe('completeJson', () => {
  it('разбирает удачный ответ без повтора', async () => {
    const provider = fake({ text: '{"styleGuide":"ок"}', json: { styleGuide: 'ок' } });
    const { data } = await completeJson(provider, request, Schema, 'Сводка профиля');
    expect(data).toEqual({ styleGuide: 'ок' });
    expect(provider.calls).toHaveLength(1);
  });

  it('чинит ответ вторым запросом, вернув модели её же вывод', async () => {
    const provider = fake({ text: 'извините, не могу' }, { text: '{"styleGuide":"ок"}', json: { styleGuide: 'ок' } });
    const { data } = await completeJson(provider, request, Schema, 'Сводка профиля');
    expect(data).toEqual({ styleGuide: 'ок' });
    expect(provider.calls).toHaveLength(2);
    const repair = provider.calls[1].messages;
    expect(repair.at(-2)).toEqual({ role: 'assistant', content: 'извините, не могу' });
    expect(repair.at(-1)?.content).toContain('не подошёл');
  });

  it('пустой ответ модели называет причиной, а не ошибкой схемы', async () => {
    const provider = fake({ text: '' });
    await expect(completeJson(provider, request, Schema, 'Сводка профиля')).rejects.toMatchObject({
      kind: 'invalid_json',
      message: 'Сводка профиля: fake-model вернул пустой ответ',
    });
  });

  it('обрыв по лимиту токенов виден в сообщении', async () => {
    const provider = fake({ text: '{"styleGuide":"нача', stopReason: 'length', usage: { inputTokens: 0, outputTokens: 8192, cacheHitTokens: 0 } });
    const error = await completeJson(provider, request, Schema, 'Сводка профиля').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LlmError);
    expect((error as LlmError).message).toBe('Сводка профиля: ответ fake-model обрезан лимитом токенов (8192)');
  });

  it('JSON есть, но не по схеме — показывает поле', async () => {
    const provider = fake({ text: '{"styleGuide":1}', json: { styleGuide: 1 } });
    const error = await completeJson(provider, request, Schema, 'Сводка профиля').catch((e: unknown) => e);
    expect((error as LlmError).message).toContain('styleGuide:');
  });
});
