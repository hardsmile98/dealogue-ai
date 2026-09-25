import { describe, expect, it } from 'vitest';
import { nextMilestone, stageFromMilestones } from './kinds.js';
import { defaultPersona, readPersona, renderPersona, unknownPlaceholders } from './persona.js';
import { selectDiagnostic } from './select-diagnostic.js';
import type { DiagnosticCandidate } from './select-diagnostic.js';
import { DEFAULT_TIMINGS, mergeTimings, readTimings, validateTimings } from './timings.js';

describe('этап по вехам', () => {
  it('без вех — intake, дальше последняя доставленная', () => {
    expect(stageFromMilestones([])).toBe('intake');
    expect(stageFromMilestones(['links'])).toBe('links');
    expect(stageFromMilestones(['links', 'diagnostic'])).toBe('diagnostic');
    // Порядок записи не важен, лишние ключи игнорируются.
    expect(stageFromMilestones(['offer', 'links', 'nudge'])).toBe('offer');
  });

  it('следующая веха', () => {
    expect(nextMilestone('intake')).toBe('links');
    expect(nextMilestone('offer')).toBe('prices');
    expect(nextMilestone('prices')).toBeNull();
  });
});

describe('образ', () => {
  const persona = {
    ...defaultPersona('Марсель'),
    bio: 'Родился в Киеве, живу в Шамони.',
    links: [
      { title: '🔮 Instagram', url: 'https://instagram.com/x' },
      { title: '📲 Telegram', url: 'https://t.me/x' },
    ],
  };

  it('подставляет биографию и ссылки', () => {
    expect(renderPersona('Приятно познакомиться) {{bio}}\n\nЧто беспокоит?', persona)).toBe(
      'Приятно познакомиться) Родился в Киеве, живу в Шамони.\n\nЧто беспокоит?',
    );
    expect(renderPersona('Мои страницы:\n\n{{links}}', persona)).toBe(
      'Мои страницы:\n\n🔮 Instagram:\nhttps://instagram.com/x\n\n📲 Telegram:\nhttps://t.me/x',
    );
  });

  it('пустое значение убирает плейсхолдер и лишние пробелы', () => {
    const empty = defaultPersona('Имя');
    expect(renderPersona('Приятно познакомиться) {{bio}} Что беспокоит?', empty)).toBe(
      'Приятно познакомиться) Что беспокоит?',
    );
    expect(renderPersona('Страницы:\n\n{{links}}\n\nВернусь.', empty)).toBe('Страницы:\n\nВернусь.');
  });

  it('читает jsonb, отбрасывая мусор', () => {
    expect(readPersona(null, 'Имя')).toEqual(defaultPersona('Имя'));
    expect(
      readPersona({ name: '', gender: 'x', bio: 'Био', links: [{ title: 'a', url: 'b' }, { nope: 1 }] }, 'Имя'),
    ).toEqual({ name: 'Имя', gender: 'm', bio: 'Био', links: [{ title: 'a', url: 'b' }] });
  });

  it('находит неизвестные плейсхолдеры', () => {
    expect(unknownPlaceholders('{{bio}} и {{links}}')).toEqual([]);
    expect(unknownPlaceholders('{{price}} {{ bio }}')).toEqual(['{{price}}']);
  });
});

describe('тайминги', () => {
  it('по умолчанию валидны', () => {
    expect(validateTimings(DEFAULT_TIMINGS)).toEqual([]);
  });

  it('читает jsonb поверх умолчаний', () => {
    const timings = readTimings({ stepHours: { min: 10 }, maxReminders: 2, junk: 1, typingMaxSec: 'x' });
    expect(timings.stepHours).toEqual({ min: 10, max: 16 });
    expect(timings.maxReminders).toBe(2);
    expect(timings.typingMaxSec).toBe(DEFAULT_TIMINGS.typingMaxSec);
    expect('junk' in timings).toBe(false);
  });

  it('ловит перевёрнутые диапазоны и нули', () => {
    const bad = mergeTimings(DEFAULT_TIMINGS, {
      stepHours: { min: 20, max: 10 },
      typingCharsPerSec: 0,
      quietMaxSec: 10,
      maxReminders: -1,
    });
    expect(validateTimings(bad)).toEqual([
      'stepHours: min больше max',
      'maxReminders: ожидается целое неотрицательное число',
      'typingCharsPerSec: не может быть 0',
      'quietMaxSec: не меньше quietWindowSec.max',
    ]);
  });
});

describe('выбор диагностики', () => {
  const item = (id: string, category: string, gender: 'f' | 'm' | null, language = 'ru', enabled = true): DiagnosticCandidate =>
    ({ id, category, gender, language, enabled, sort: 0 });
  const first = <T>(list: readonly T[]) => list[0] as T;
  const items = [
    item('breakup-f', 'relationships.breakup', 'f'),
    item('breakup-m', 'relationships.breakup', 'm'),
    item('breakup-en', 'relationships.breakup', null, 'en'),
    item('money-any', 'money.instability', null),
    item('uni-any', 'universal.general', null),
    item('uni-f', 'universal.general', 'f'),
    item('uni-m', 'universal.general', 'm'),
    item('uni-off', 'universal.general', null, 'ru', false),
  ];

  it('категория × пол × язык', () => {
    expect(selectDiagnostic(items, { category: 'relationships.breakup', gender: 'f', language: 'ru' }, first)?.id).toBe('breakup-f');
    expect(selectDiagnostic(items, { category: 'relationships.breakup', gender: null, language: 'en' }, first)?.id).toBe('breakup-en');
  });

  it('пол неизвестен — текст «для любого», категория без пола подходит всем', () => {
    expect(selectDiagnostic(items, { category: 'relationships.breakup', gender: null, language: 'ru' }, first)?.id).toBe('uni-any');
    expect(selectDiagnostic(items, { category: 'money.instability', gender: 'm', language: 'ru' }, first)?.id).toBe('money-any');
  });

  it('нет категории — универсальная по полу, потом любая', () => {
    expect(selectDiagnostic(items, { category: 'health.own', gender: 'm', language: 'ru' }, first)?.id).toBe('uni-m');
    expect(selectDiagnostic(items, { category: null, gender: null, language: 'ru' }, first)?.id).toBe('uni-any');
  });

  it('нет материалов на языке — null, выключенные не считаются', () => {
    expect(selectDiagnostic(items, { category: 'money.instability', gender: 'f', language: 'de' }, first)).toBeNull();
    expect(selectDiagnostic([items[7] as DiagnosticCandidate], { category: null, gender: null, language: 'ru' }, first)).toBeNull();
  });
});
