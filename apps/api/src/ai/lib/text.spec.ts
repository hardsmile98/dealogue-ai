import { describe, expect, it } from 'vitest';
import { clipEnd, clipStart, wellFormed } from './text.js';

const HIGH = String.fromCharCode(0xd83d); // одинокая первая половина эмодзи

describe('text helpers', () => {
  it('обрезка не оставляет половинку эмодзи и даёт валидный JSON для провайдера', () => {
    const text = 'привет 🙌 как дела';
    const cut = clipStart(text, 8); // индекс 8 — середина суррогатной пары
    expect(cut).toBe('привет ');
    expect(JSON.stringify(cut)).not.toContain('\\ud83');
  });

  it('clipEnd режет с начала, сохраняя эмодзи целыми', () => {
    const text = 'a🙌b';
    expect(clipEnd(text, 2)).toBe('b');
    expect(clipEnd(text, 3)).toBe('🙌b');
  });

  it('wellFormed убирает одинокие суррогаты и не трогает целые', () => {
    expect(wellFormed(`ок ${HIGH} дальше`)).toBe('ок  дальше');
    expect(wellFormed('ок 🙌 дальше')).toBe('ок 🙌 дальше');
  });
});
