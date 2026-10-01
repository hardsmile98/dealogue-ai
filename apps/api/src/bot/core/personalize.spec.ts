import { describe, expect, it } from 'vitest';
import { plainDashes } from './hard-checks.js';
import {
  MAX_PERSONAL_EDITS,
  applyPersonalization,
  numberedParagraphs,
  splitParagraphs,
  wordSimilarity,
} from './personalize.js';
import { parsePersonalization } from '../prompts/personalizer.prompt.js';

const DIAGNOSTIC = [
  'Я сделал анализ и вернулся с результатами) ❤️',
  '',
  'Вижу, что вы застряли в чужих вам правилах, чужих ожиданиях и системе, которая вам не подходит. Вы много лет живёте не своей жизнью и чувствуете, как уходят силы.',
  '',
  '🔸 Энергетический блок в зоне самореализации мешает вам двигаться вперёд и раскрыть свой потенциал в полной мере.',
  'Это не приговор, с этим можно работать.',
  '',
  'Если вам интересно, могу рассказать, как это проработать?',
].join('\n');

describe('диагностика под клиента: абзацы', () => {
  it('абзацы нумеруются без пустых строк, переносы сохраняются как в библиотеке', () => {
    const { pieces, numbered } = splitParagraphs(DIAGNOSTIC);
    expect(numbered).toHaveLength(5);
    expect(pieces.join('')).toBe(DIAGNOSTIC);
    expect(numberedParagraphs(DIAGNOSTIC)[0]).toBe(
      '[1] Я сделал анализ и вернулся с результатами) ❤️',
    );
    expect(numberedParagraphs(DIAGNOSTIC)[4]).toBe(
      '[5] Если вам интересно, могу рассказать, как это проработать?',
    );
  });

  it('без правок — текст побайтно как в библиотеке', () => {
    const result = applyPersonalization(DIAGNOSTIC, [], 'ru');
    expect(result).toEqual({ text: DIAGNOSTIC, applied: [], rejected: [] });
  });

  it('лёгкие правки применяются, остальное — как в библиотеке', () => {
    const result = applyPersonalization(
      DIAGNOSTIC,
      [
        {
          n: 1,
          text: 'Я посмотрел вашу ситуацию с работой и вернулся с результатами) ❤️',
        },
        {
          n: 2,
          text: 'Вижу, что вы застряли в чужих правилах и ожиданиях, в системе, которая вам давно не подходит. Вы много лет живёте не своей жизнью — и чувствуете, как уходят силы.',
        },
      ],
      'ru',
    );
    expect(result.applied).toEqual([1, 2]);
    expect(result.rejected).toEqual([]);
    const lines = result.text.split('\n');
    expect(lines[0]).toBe(
      'Я посмотрел вашу ситуацию с работой и вернулся с результатами) ❤️',
    );
    // Длинное тире в правке — дефисом: в тексте практика тире нет.
    expect(lines[2]).toContain('жизнью - и чувствуете');
    expect(lines.slice(3)).toEqual(DIAGNOSTIC.split('\n').slice(3));
  });

  it('правка, которая переписала абзац, добавила вопрос, сумму или ссылку или потеряла вопрос, — абзац как в библиотеке', () => {
    const result = applyPersonalization(
      DIAGNOSTIC,
      [
        {
          n: 2,
          text: 'Ваша карьера скоро резко пойдёт вверх, деньги придут уже в этом месяце, просто доверьтесь процессу и ждите хороших новостей от вселенной.',
        },
        {
          n: 3,
          text: '🔸 Энергетический блок в зоне самореализации мешает вам двигаться вперёд. Хотите его снять?',
        },
        {
          n: 4,
          text: 'Это не приговор, с этим можно работать, всего за 5000 руб.',
        },
        {
          n: 5,
          text: 'Если вам интересно, могу рассказать, как это проработать.',
        },
        { n: 9, text: 'Лишний абзац' },
      ],
      'ru',
    );
    expect(result.text).toBe(DIAGNOSTIC);
    expect(result.applied).toEqual([]);
    expect(result.rejected.map((item) => [item.n, item.reason])).toEqual([
      [2, expect.stringContaining('переписан слишком сильно')],
      [3, 'новый вопрос'],
      [4, 'сумма'],
      [5, 'пропал вопрос'],
      [9, 'нет такого абзаца'],
    ]);
  });

  it('правок больше лимита — лишние не применяются; номер абзаца в тексте правки срезается', () => {
    const text = Array.from(
      { length: 8 },
      (_, index) =>
        `Абзац номер ${index + 1}: вы чувствуете усталость и напряжение в теле.`,
    ).join('\n\n');
    const edits = Array.from({ length: 8 }, (_, index) => ({
      n: index + 1,
      text: `[${index + 1}] Абзац номер ${index + 1}: вы чувствуете сильную усталость и напряжение в теле.`,
    }));
    const result = applyPersonalization(text, edits, 'ru');
    expect(result.applied).toHaveLength(MAX_PERSONAL_EDITS);
    expect(result.rejected).toHaveLength(8 - MAX_PERSONAL_EDITS);
    expect(result.text).not.toContain('[1]');
    expect(result.text.split('\n\n')[0]).toBe(
      'Абзац номер 1: вы чувствуете сильную усталость и напряжение в теле.',
    );
  });

  it('доля общих слов: перефразировка близка, другой текст — нет', () => {
    expect(
      wordSimilarity('Я вернулся с результатами', 'Я вернулся с результатами'),
    ).toBe(1);
    expect(
      wordSimilarity(
        'Вижу, что вы застряли в чужих вам правилах, чужих ожиданиях и системе, которая вам не подходит.',
        'Вижу, что вы застряли в чужих правилах и ожиданиях, в системе, которая вам давно не подходит.',
      ),
    ).toBeGreaterThan(0.7);
    expect(
      wordSimilarity('Вижу блок в зоне финансов', 'Скоро всё наладится само'),
    ).toBe(0);
  });
});

describe('ответ модели с правками', () => {
  it('правки с номером строкой и числом; мусор — правок нет', () => {
    expect(
      parsePersonalization(
        '{"edits": [{"n": 1, "text": "Привет"}, {"n": "3", "text": "Абзац"}, {"n": 2}, {"text": "без номера"}], "notes": "…"}',
      ),
    ).toEqual([
      { n: 1, text: 'Привет' },
      { n: 3, text: 'Абзац' },
    ]);
    expect(parsePersonalization('не json')).toEqual([]);
    expect(parsePersonalization('{"edits": "нет"}')).toEqual([]);
  });
});

describe('тире как у человека', () => {
  it('тире между словами — дефисом; диапазоны и дефисы не трогаются', () => {
    expect(plainDashes('Понимаю — это выматывает')).toBe(
      'Понимаю - это выматывает',
    );
    expect(plainDashes('Понимаю – это выматывает')).toBe(
      'Понимаю - это выматывает',
    );
    expect(plainDashes('2—3 дня, из-за, кто-то')).toBe(
      '2—3 дня, из-за, кто-то',
    );
  });
});
