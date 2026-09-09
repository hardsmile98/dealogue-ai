import { describe, expect, it } from 'vitest';
import { DEFAULT_SALES_SCRIPT } from '../prompt/sales-script.schema.js';
import type { Decision } from '../prompt/decision.schema.js';
import { guardDecision, similar } from './decision-guard.js';

const script = { ...DEFAULT_SALES_SCRIPT, facts: ['Курс стоит 30 000 руб', 'Сайт: example.ru'] };

function decision(patch: Partial<Decision> = {}): Decision {
  return {
    messages: ['Подскажите, какой формат вам ближе?'],
    stage: 'qualify',
    confidence: 0.9,
    ready_to_pay: false,
    needs_human: false,
    silent: false,
    reason: '',
    ...patch,
  };
}

function run(patch: Partial<Decision> = {}, extra: Partial<Parameters<typeof guardDecision>[0]> = {}) {
  return guardDecision({
    decision: decision(patch),
    script,
    lastClientText: 'а сколько стоит?',
    recentOutgoing: [],
    managerLenP90: 0,
    previousStage: 'greeting',
    trigger: 'inbound',
    ...extra,
  });
}

describe('guardDecision', () => {
  it('пропускает нормальный ответ', () => {
    const result = run();
    expect(result.messages).toEqual(['Подскажите, какой формат вам ближе?']);
    expect(result.stage).toBe('qualify');
    expect(result.needsHuman).toBe(false);
    expect(result.notes).toEqual([]);
  });

  it('неизвестный этап → остаётся прежний', () => {
    const result = run({ stage: 'nonsense' });
    expect(result.stage).toBe('greeting');
    expect(result.notes).toContain('unknown_stage:nonsense');
  });

  it('эвристика «готов платить» по тексту клиента', () => {
    const result = run({}, { lastClientText: 'ок, куда переводить деньги?' });
    expect(result.readyToPay).toBe(true);
    expect(result.messages).toEqual([script.handoffTemplate]);
  });

  it('сумма, которой нет в фактах, → нужен человек, ничего не шлём', () => {
    const result = run({ messages: ['Со скидкой выйдет 25 000 руб'] });
    expect(result.needsHuman).toBe(true);
    expect(result.messages).toEqual([]);
    expect(result.notes.some((n) => n.startsWith('unverified:'))).toBe(true);
  });

  it('сумма из фактов проходит', () => {
    const result = run({ messages: ['Курс стоит 30 000 руб, есть рассрочка'] });
    expect(result.needsHuman).toBe(false);
    expect(result.messages).toHaveLength(1);
  });

  it('роботизм режется', () => {
    const result = run({ messages: ['Как ИИ-ассистент, я не могу…'] });
    expect(result.needsHuman).toBe(true);
    expect(result.messages).toEqual([]);
  });

  it('markdown снимается', () => {
    const result = run({ messages: ['**Важно**: есть рассрочка'] });
    expect(result.messages[0]).toBe('Важно: есть рассрочка');
    expect(result.notes).toContain('markdown_stripped');
  });

  it('повтор своего прошлого сообщения → молчим', () => {
    const result = run({}, { recentOutgoing: ['Подскажите, какой формат вам ближе?'] });
    expect(result.silent).toBe(true);
    expect(result.messages).toEqual([]);
  });

  it('низкая уверенность → человек', () => {
    const result = run({ confidence: 0.2 });
    expect(result.needsHuman).toBe(true);
  });

  it('silent → пустой ответ без пометок', () => {
    const result = run({ silent: true, messages: [] });
    expect(result.silent).toBe(true);
    expect(result.needsHuman).toBe(false);
  });

  it('стоп-слова клиента при дожиме → молчим', () => {
    const result = run({}, { trigger: 'followup', lastClientText: 'не пишите мне больше' });
    expect(result.silent).toBe(true);
    expect(result.notes).toContain('client_asked_to_stop');
  });

  it('длинный текст режется по p90 менеджера', () => {
    const long = 'Первое предложение про формат. '.repeat(20);
    const result = run({ messages: [long] }, { managerLenP90: 150 });
    expect(result.messages.length).toBeGreaterThan(1);
    for (const m of result.messages) expect(m.length).toBeLessThanOrEqual(225);
  });
});

describe('similar', () => {
  it('почти одинаковые строки похожи', () => {
    expect(similar('Добрый день! Чем могу помочь?', 'Добрый день, чем могу помочь')).toBe(true);
  });
  it('разные строки не похожи', () => {
    expect(similar('Добрый день!', 'Стоимость зависит от формата')).toBe(false);
  });
});
