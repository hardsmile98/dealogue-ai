import { describe, expect, it } from 'vitest';
import type { ClientCard } from '../../domain/types.js';
import { cardFromColumns, cardToColumns, emptyCard, lockedFields, markManual, mergeCard, normalizeCard } from './client-card.js';
import type { CardProposal } from './client-card.js';

const NOW = new Date('2026-09-17T12:00:00Z');

function card(patch: Partial<ClientCard> = {}): ClientCard {
  return { ...emptyCard(), ...patch };
}

function merge(current: ClientCard, proposal: CardProposal, manualSlots: string[] = []) {
  return mergeCard(current, proposal, { now: NOW, turnId: 't1', manualSlots });
}

describe('mergeCard: правило «null — это не знаю»', () => {
  it('пропущенное поле оставляет прежнее значение', () => {
    const { card: next } = merge(card({ birthPlace: 'Казань' }), { requestSummary: 'отношения' });
    expect(next.birthPlace).toBe('Казань');
    expect(next.requestSummary).toBe('отношения');
  });

  it('явный null тоже оставляет прежнее значение', () => {
    const { card: next } = merge(card({ birthPlace: 'Казань' }), { birthPlace: null });
    expect(next.birthPlace).toBe('Казань');
  });

  it('стирает поле только через cleared', () => {
    const { card: next, changes } = merge(card({ birthPlace: 'Казань' }), { cleared: ['birthPlace'] });
    expect(next.birthPlace).toBeNull();
    expect(changes).toEqual([{ field: 'birthPlace', from: 'Казань', to: null, evidence: null }]);
  });

  it('стёртый язык возвращается к языку аккаунта', () => {
    const { card: next } = mergeCard(card({ language: 'en' }), { cleared: ['language'] }, { now: NOW, defaultLanguage: 'ru' });
    expect(next.language).toBe('ru');
  });
});

describe('mergeCard: модель может исправлять записанное', () => {
  it('меняет пол, который стоял раньше', () => {
    const before = card({ gender: 'm' });
    const { card: next, changes } = merge(before, { gender: 'f', evidence: { gender: 'я сама записывалась' } });
    expect(next.gender).toBe('f');
    expect(changes).toEqual([{ field: 'gender', from: 'm', to: 'f', evidence: 'я сама записывалась' }]);
    expect(next.meta.gender).toEqual({ source: 'llm', evidence: 'я сама записывалась', turnId: 't1', at: NOW.toISOString() });
  });

  it('заменяет запрос более короткой формулировкой, если модель так поняла', () => {
    const { card: next } = merge(card({ requestSummary: 'очень длинная прежняя формулировка' }), { requestSummary: 'развод' });
    expect(next.requestSummary).toBe('развод');
  });

  it('совпадающее значение изменением не считает', () => {
    const { changes } = merge(card({ gender: 'f' }), { gender: 'f' });
    expect(changes).toEqual([]);
  });
});

describe('mergeCard: поля менеджера', () => {
  it('не трогает то, что правил менеджер', () => {
    const before = card({ gender: 'f', requestSummary: 'отношения', birthDate: '1994-03-12' });
    const { card: next, changes } = merge(before, { gender: 'm', requestSummary: 'деньги', birthDate: '1980-01-01' }, ['gender', 'request', 'birthDate']);
    expect(next.gender).toBe('f');
    expect(next.requestSummary).toBe('отношения');
    expect(next.birthDate).toBe('1994-03-12');
    expect(changes).toEqual([]);
  });

  it('правка даты закрывает и подсказку о несовершеннолетнем', () => {
    const { card: next } = merge(card({ birthDate: '1994-03-12' }), { minorHint: true }, ['birthDate']);
    expect(next.minorHint).toBe(false);
  });

  it('markManual помечает поле менеджером', () => {
    const next = markManual(card({ gender: 'f' }), ['gender'], { now: NOW });
    expect(next.meta.gender?.source).toBe('manager');
  });

  it('lockedFields разворачивает request в оба поля', () => {
    expect([...lockedFields(['request'])]).toEqual(['requestSummary', 'requestCategoryKey']);
  });
});

describe('mergeCard: чистка значений от модели', () => {
  it('берёт дату только в формате YYYY-MM-DD', () => {
    expect(merge(card(), { birthDate: '12.03.1994' }).card.birthDate).toBeNull();
    expect(merge(card(), { birthDate: '1994-03-12' }).card.birthDate).toBe('1994-03-12');
  });

  it('отбрасывает несуществующие даты и даты из будущего', () => {
    expect(merge(card(), { birthDate: '1994-02-31' }).card.birthDate).toBeNull();
    expect(merge(card(), { birthDate: '2030-01-01' }).card.birthDate).toBeNull();
    expect(merge(card(), { birthDate: '1890-01-01' }).card.birthDate).toBeNull();
  });

  it('принимает только известные полы и коды языка', () => {
    expect(merge(card(), { gender: 'ж' as never }).card.gender).toBeNull();
    expect(merge(card(), { language: 'русский' }).card.language).toBe('ru');
    expect(merge(card(), { language: 'KK' }).card.language).toBe('kk');
  });

  it('обрезает длинные строки', () => {
    const long = 'я'.repeat(2000);
    expect(merge(card(), { requestSummary: long }).card.requestSummary).toHaveLength(1000);
  });

  it('держит открытые нитки короткими и без повторов', () => {
    const { card: next } = merge(card(), { openThreads: ['сколько стоит?', 'сколько стоит?', '  ', 'когда будет готово?'] });
    expect(next.openThreads).toEqual(['сколько стоит?', 'когда будет готово?']);
  });

  it('пустой список ниток очищает их', () => {
    expect(merge(card({ openThreads: ['старое'] }), { openThreads: [] }).card.openThreads).toEqual([]);
    expect(merge(card({ openThreads: ['старое'] }), {}).card.openThreads).toEqual(['старое']);
  });

  it('заметки о клиенте живут по тем же правилам, что и нитки', () => {
    const { card: next } = merge(card(), { facts: ['муж Сергей', 'муж Сергей', '  ', 'была у двух тарологов'] });
    expect(next.facts).toEqual(['муж Сергей', 'была у двух тарологов']);

    // Пропуск — «не знаю», прежнее остаётся; пустой список стирает.
    expect(merge(card({ facts: ['старое'] }), {}).card.facts).toEqual(['старое']);
    expect(merge(card({ facts: ['старое'] }), { facts: [] }).card.facts).toEqual([]);
  });

  it('заметок о клиенте не больше пятнадцати', () => {
    const many = Array.from({ length: 30 }, (_, i) => `факт ${i}`);
    expect(merge(card(), { facts: many }).card.facts).toHaveLength(15);
  });
});

describe('cardToColumns', () => {
  it('считает возраст и совершеннолетие по дате', () => {
    const columns = cardToColumns(card({ birthDate: '1994-03-12' }), NOW);
    expect(columns.age).toBe(32);
    expect(columns.isMinor).toBe(false);
  });

  it('несовершеннолетний по дате', () => {
    expect(cardToColumns(card({ birthDate: '2010-12-01' }), NOW).isMinor).toBe(true);
  });

  it('несовершеннолетний по словам клиента, без даты', () => {
    const columns = cardToColumns(card({ minorHint: true }), NOW);
    expect(columns.age).toBeNull();
    expect(columns.isMinor).toBe(true);
  });
});

describe('normalizeCard и cardFromColumns', () => {
  it('из пустого jsonb делает пустую карточку', () => {
    expect(normalizeCard({}, 'ru', NOW)).toEqual(emptyCard('ru'));
  });

  it('выбрасывает мусор из базы', () => {
    const next = normalizeCard(
      { gender: 'x', language: 42, openThreads: 'не массив', facts: 42, meta: { gender: { source: 'кто-то' } } },
      'ru',
      NOW,
    );
    expect(next.gender).toBeNull();
    expect(next.language).toBe('ru');
    expect(next.openThreads).toEqual([]);
    expect(next.facts).toEqual([]);
    expect(next.meta).toEqual({});
  });

  it('собирает карточку из колонок старого состояния', () => {
    const next = cardFromColumns({ birthDate: '1994-03-12', gender: 'f', language: 'ru', requestSummary: 'отношения', isMinor: false }, 'ru', NOW);
    expect(next.birthDate).toBe('1994-03-12');
    expect(next.gender).toBe('f');
    expect(next.requestSummary).toBe('отношения');
    expect(next.minorHint).toBe(false);
  });

  it('несовершеннолетний без даты переезжает в minorHint', () => {
    expect(cardFromColumns({ isMinor: true, birthDate: null }, 'ru', NOW).minorHint).toBe(true);
  });
});
