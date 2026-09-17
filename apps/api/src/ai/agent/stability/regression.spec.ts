import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { anonymize, replay } from './fixtures.js';
import type { RegressionFixture } from './fixtures.js';

/**
 * Регрессия на фикстурах (раздел 15 ТЗ): каждый обезличенный диалог из
 * `fixtures/` должен получить то же решение кода, что записано в `expected`.
 * Файлы пополняются вручную и командой `npm run ai:fixtures`.
 */

const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const files = readdirSync(dir).filter((name) => name.endsWith('.json'));
const fixtures = files.flatMap((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')) as RegressionFixture[]);

describe('регрессионные фикстуры', () => {
  it('файлы с фикстурами найдены', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it.each(fixtures.map((fixture) => [fixture.title, fixture] as const))('%s', (_title, fixture) => {
    const result = replay(fixture);
    expect(result.kind).toBe(fixture.expected.kind);
    if (fixture.expected.reason !== undefined && fixture.expected.reason !== null) {
      expect(result.reason).toBe(fixture.expected.reason);
    }
  });

  it('у фикстур уникальные id', () => {
    const ids = fixtures.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('в фикстурах нет личных данных', () => {
    for (const fixture of fixtures) {
      for (const message of [...(fixture.history ?? []), ...fixture.client]) {
        expect(anonymize(message.text)).toBe(message.text);
      }
    }
  });
});

describe('обезличивание', () => {
  it('убирает имя, телефон, ник, почту, ссылку и дату', () => {
    const text = anonymize(
      'Привет, Мария! Мой номер +7 916 123-45-67, ник @mariaastro, почта maria@mail.ru, ссылка https://t.me/x, родилась 12.03.1994',
      ['Мария'],
    );
    expect(text).toBe('Привет, {имя}! Мой номер {телефон}, ник {ник}, почта {почта}, ссылка {ссылка}, родилась {дата}');
  });

  it('обычный текст не трогает', () => {
    const text = 'расскажите, как проходит разбор и сколько длится';
    expect(anonymize(text)).toBe(text);
  });

  it('дату словами тоже убирает', () => {
    expect(anonymize('родилась 12 марта 1994 года в Москве')).toBe('родилась {дата} года в Москве');
  });
});
