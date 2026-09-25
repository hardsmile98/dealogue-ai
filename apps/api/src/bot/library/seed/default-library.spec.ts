import { describe, expect, it } from 'vitest';
import {
  GENDERS,
  LANGUAGES,
  LIBRARY_KINDS,
  MILESTONE_KINDS,
  OBJECTION_CATEGORIES,
  isRequestCategory,
} from '../kinds.js';
import { unknownPlaceholders } from '../persona.js';
import { DEFAULT_LIBRARY } from './default-library.js';

// Сид собран скриптом из таблиц; здесь ловим ошибки сборки, а не логики.
describe('стандартная библиотека', () => {
  const items = DEFAULT_LIBRARY.items;

  it('не пустая и с уникальными ключами', () => {
    expect(items.length).toBeGreaterThan(50);
    const keys = new Set(items.map((item) => item.seedKey));
    expect(keys.size).toBe(items.length);
  });

  it('все поля из справочников', () => {
    for (const item of items) {
      expect(LIBRARY_KINDS, item.seedKey).toContain(item.kind);
      expect(LANGUAGES, item.seedKey).toContain(item.language);
      if (item.gender !== null)
        expect(GENDERS, item.seedKey).toContain(item.gender);
      expect(item.title.length, item.seedKey).toBeGreaterThan(0);
      expect(item.text.length, item.seedKey).toBeGreaterThan(10);
      expect(Number.isInteger(item.sort), item.seedKey).toBe(true);
    }
  });

  it('у диагностик известная категория, у возражений — из плейбука', () => {
    for (const item of items) {
      if (item.kind === 'diagnostic') {
        expect(item.category, item.seedKey).not.toBeNull();
        expect(isRequestCategory(item.category as string), item.seedKey).toBe(
          true,
        );
      }
      if (item.kind === 'objection') {
        expect(OBJECTION_CATEGORIES, item.seedKey).toContain(item.category);
      }
    }
  });

  it('универсальные диагностики есть на русском для любого пола', () => {
    const universal = items.filter(
      (item) =>
        item.kind === 'diagnostic' &&
        item.category === 'universal.general' &&
        item.language === 'ru',
    );
    expect(universal.some((item) => item.gender === null)).toBe(true);
    expect(universal.some((item) => item.gender === 'm')).toBe(true);
  });

  it('по одной включённой вехе offer и prices на русском', () => {
    for (const kind of ['offer', 'prices'] as const) {
      const enabled = items.filter(
        (item) => item.kind === kind && item.language === 'ru' && item.enabled,
      );
      expect(enabled, kind).toHaveLength(1);
    }
    expect(MILESTONE_KINDS).toContain('offer');
  });

  it('плейсхолдеры только известные и только вне диагностик', () => {
    for (const item of items) {
      expect(unknownPlaceholders(item.text), item.seedKey).toEqual([]);
      if (item.kind === 'diagnostic')
        expect(item.text, item.seedKey).not.toMatch(/\{\{/);
    }
    expect(items.find((item) => item.seedKey === 'funnel.F9')?.text).toContain(
      '{{links}}',
    );
    expect(items.find((item) => item.seedKey === 'funnel.B6')?.text).toContain(
      '{{bio}}',
    );
  });

  it('в текстах не осталось адресов чужого аккаунта', () => {
    for (const item of items) {
      expect(item.text, item.seedKey).not.toMatch(/instagram\.com|t\.me\//);
    }
  });

  it('образ по умолчанию заполнен', () => {
    expect(DEFAULT_LIBRARY.persona.gender).toBe('m');
    expect(DEFAULT_LIBRARY.persona.bio.length).toBeGreaterThan(20);
  });
});
