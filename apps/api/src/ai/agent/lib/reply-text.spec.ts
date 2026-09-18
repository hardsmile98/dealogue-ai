import { describe, expect, it } from 'vitest';
import { hasQuestion, startsWithGreeting, stripLeadingGreeting } from './reply-text.js';

describe('приветствие и вопрос', () => {
  it('распознаёт и убирает приветствие', () => {
    expect(startsWithGreeting('Привет! Как вы?')).toBe(true);
    expect(startsWithGreeting('Добрый день, Мария')).toBe(true);
    expect(startsWithGreeting('Спасибо за дату')).toBe(false);
    expect(stripLeadingGreeting('Привет! Спасибо за дату.')).toBe('Спасибо за дату.');
    expect(stripLeadingGreeting('Здравствуйте!')).toBe('');
  });

  it('видит вопрос по знаку', () => {
    expect(hasQuestion('Как вас зовут?')).toBe(true);
    expect(hasQuestion('Спасибо.')).toBe(false);
  });
});
