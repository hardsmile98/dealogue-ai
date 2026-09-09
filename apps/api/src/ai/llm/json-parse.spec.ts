import { describe, expect, it } from 'vitest';
import { extractJson } from './json-parse.js';
import { CircuitBreaker } from './circuit-breaker.js';

describe('extractJson', () => {
  it('чистый JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it('JSON в code fences', () => {
    expect(extractJson('Вот ответ:\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });
  it('JSON с текстом вокруг', () => {
    expect(extractJson('Конечно! {"messages":["привет"]} — готово')).toEqual({ messages: ['привет'] });
  });
  it('не JSON → null', () => {
    expect(extractJson('просто текст')).toBeNull();
  });
});

describe('CircuitBreaker', () => {
  it('открывается после порога и пропускает пробный запрос после паузы', () => {
    let now = 0;
    const breaker = new CircuitBreaker(3, 1000, () => now);
    breaker.onFailure();
    breaker.onFailure();
    expect(breaker.allow()).toBe(true);
    breaker.onFailure();
    expect(breaker.isOpen).toBe(true);
    expect(breaker.allow()).toBe(false);
    now = 1001;
    expect(breaker.allow()).toBe(true); // half-open: один пробный
    expect(breaker.allow()).toBe(false);
    breaker.onSuccess();
    expect(breaker.isOpen).toBe(false);
    expect(breaker.allow()).toBe(true);
  });
});
