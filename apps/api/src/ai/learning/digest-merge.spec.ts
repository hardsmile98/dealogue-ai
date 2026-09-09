import { describe, expect, it } from 'vitest';
import { mergeKnowledge, styleInput } from './digest-merge.js';
import { DigestPartialSchema } from './style-profile.schema.js';
import type { DigestPartial } from './style-profile.schema.js';

const partial = (patch: Partial<DigestPartial>): DigestPartial => DigestPartialSchema.parse(patch);

describe('mergeKnowledge', () => {
  it('объединяет одинаковое по смыслу и считает повторы', () => {
    const merged = mergeKnowledge([
      partial({ faq: [{ q: 'Сколько стоит?', a: 'От 10 000 ₽' }], facts: ['Есть рассрочка'] }),
      partial({ faq: [{ q: 'сколько стоит', a: 'От 12 000 ₽' }], facts: ['есть рассрочка!'] }),
      partial({ faq: [{ q: 'Когда старт?', a: 'В понедельник' }], facts: ['Есть рассрочка'] }),
    ]);
    expect(merged.faq).toEqual([
      { q: 'Сколько стоит?', a: 'От 10 000 ₽', seen: 2 },
      { q: 'Когда старт?', a: 'В понедельник', seen: 1 },
    ]);
    expect(merged.facts).toEqual(['Есть рассрочка']);
  });

  it('частые возражения идут первыми', () => {
    const merged = mergeKnowledge([
      partial({ objections: [{ objection: 'Подумаю', answer: 'Что смущает?' }] }),
      partial({ objections: [{ objection: 'Дорого', answer: 'Есть рассрочка' }] }),
      partial({ objections: [{ objection: 'дорого!', answer: 'Можно частями' }] }),
    ]);
    expect(merged.objections.map((o) => [o.objection, o.seen])).toEqual([
      ['Дорого', 2],
      ['Подумаю', 1],
    ]);
  });

  it('без пачек отдаёт пустые списки', () => {
    expect(mergeKnowledge([])).toEqual({ faq: [], objections: [], facts: [] });
  });
});

describe('styleInput', () => {
  it('снимает дубли фраз внутри намерения и выбрасывает плейсхолдеры медиа', () => {
    const input = styleInput([
      partial({
        styleObservations: ['пишет коротко'],
        phrases: [
          { intent: 'greeting', text: 'Здравствуйте!' },
          { intent: 'price', text: '[фото]' },
        ],
      }),
      partial({
        styleObservations: ['Пишет коротко.'],
        phrases: [
          { intent: 'greeting', text: 'здравствуйте' },
          { intent: 'price', text: 'Стоимость от 10 000 ₽' },
        ],
      }),
    ]);
    expect(input.observations).toEqual(['пишет коротко']);
    expect(input.phrases).toEqual([
      { intent: 'greeting', text: 'Здравствуйте!' },
      { intent: 'price', text: 'Стоимость от 10 000 ₽' },
    ]);
  });

  it('одна и та же фраза с разными намерениями остаётся дважды', () => {
    const input = styleInput([
      partial({ phrases: [{ intent: 'close', text: 'Оформляем?' }, { intent: 'payment', text: 'Оформляем?' }] }),
    ]);
    expect(input.phrases).toHaveLength(2);
  });
});
