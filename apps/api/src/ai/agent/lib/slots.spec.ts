import { describe, expect, it } from 'vitest';
import {
  ageFrom,
  detectLanguage,
  guessGenderByName,
  parseBirthDate,
  startsWithGreeting,
  stripLeadingGreeting,
} from './slots.js';

const NOW = new Date('2026-09-17T12:00:00Z');

describe('parseBirthDate', () => {
  it('разбирает числовые форматы с полным и коротким годом', () => {
    expect(parseBirthDate('12.03.1994, Москва', NOW)?.iso).toBe('1994-03-12');
    expect(parseBirthDate('12/03/94', NOW)?.iso).toBe('1994-03-12');
    expect(parseBirthDate('1994-03-12', NOW)?.iso).toBe('1994-03-12');
  });

  it('разбирает дату словами и без года', () => {
    expect(parseBirthDate('родилась 12 марта 1994 г в Казани', NOW)?.iso).toBe('1994-03-12');
    const noYear = parseBirthDate('12 марта', NOW);
    expect(noYear?.iso).toBeNull();
    expect(noYear?.month).toBe(3);
  });

  it('отбрасывает невозможные даты', () => {
    expect(parseBirthDate('45.13.1990', NOW)).toBeNull();
    expect(parseBirthDate('привет', NOW)).toBeNull();
  });
});

describe('ageFrom', () => {
  it('считает полные годы', () => {
    expect(ageFrom('1994-03-12', NOW)).toBe(32);
    expect(ageFrom('2010-12-01', NOW)).toBe(15);
    expect(ageFrom('2008-09-17', NOW)).toBe(18);
    expect(ageFrom('2008-09-18', NOW)).toBe(17);
  });
});

describe('guessGenderByName', () => {
  it('словарь и окончания', () => {
    expect(guessGenderByName('Мария Иванова')).toBe('f');
    expect(guessGenderByName('Никита')).toBe('m');
    expect(guessGenderByName('Илья')).toBe('m');
    expect(guessGenderByName('Денис')).toBe('m');
    expect(guessGenderByName('Оксана')).toBe('f');
  });

  it('не уверен — null', () => {
    expect(guessGenderByName('Саша')).toBeNull();
    expect(guessGenderByName('@user123')).toBeNull();
    expect(guessGenderByName('Игорь')).toBe('m');
  });
});

describe('detectLanguage', () => {
  it('кириллица → ru, латиница → en, пусто → null', () => {
    expect(detectLanguage('Привет, как дела?')).toBe('ru');
    expect(detectLanguage('Hello there, how are you')).toBe('en');
    expect(detectLanguage('12.03.1994')).toBeNull();
    expect(detectLanguage('Привет, ok')).toBe('ru');
  });
});

describe('greeting helpers', () => {
  it('распознаёт и убирает приветствие', () => {
    expect(startsWithGreeting('Привет! Как вы?')).toBe(true);
    expect(startsWithGreeting('Добрый день, Мария')).toBe(true);
    expect(startsWithGreeting('Спасибо за дату')).toBe(false);
    expect(stripLeadingGreeting('Привет! Спасибо за дату.')).toBe('Спасибо за дату.');
    expect(stripLeadingGreeting('Здравствуйте!')).toBe('');
  });
});
