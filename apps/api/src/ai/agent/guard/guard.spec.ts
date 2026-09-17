import { describe, expect, it } from 'vitest';
import { DEFAULT_GUARD } from '../../domain/defaults.js';
import type { ComposedMessage, LibraryBlock } from '../agent.types.js';
import { buildAllowlists, priceViolations, runGuard } from './guard.js';
import type { GuardInput } from './guard.js';

const blocks: LibraryBlock[] = [
  { kind: 'price', id: 'p1', title: 'Цены', text: 'Разбор карты — 5000 ₽, чистка рода — 15 000 руб.', source: 'phrase' },
  { kind: 'links', id: 'l1', title: 'Ссылки', text: 'Instagram: https://instagram.com/soul.rayss\nКанал: t.me/marsel_energy', source: 'phrase' },
];
const allow = buildAllowlists([{ value: 'Консультация стоит 3000 ₽' }], [{ url: 'https://t.me/marsel_energy' }], blocks);

function text(t: string): ComposedMessage {
  return { text: t, blockKind: null, blockId: null };
}
function block(kind: string, id: string, t: string): ComposedMessage {
  return { text: t, blockKind: kind, blockId: id };
}

function input(overrides: Partial<GuardInput>): GuardInput {
  return {
    messages: [],
    unknownBlockKinds: [],
    requiredBlockKinds: [],
    allowedBlockKinds: [],
    sentBlockIds: [],
    noQuestions: false,
    allow,
    pastBotMessages: [],
    clientLanguage: 'ru',
    greetedToday: false,
    config: DEFAULT_GUARD,
    ...overrides,
  };
}

describe('runGuard', () => {
  it('пропускает нормальный ответ', () => {
    const result = runGuard(input({ messages: [text('Спасибо, что написали! Расскажите, что сейчас беспокоит больше всего?')] }));
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('ловит цену не из фактов, но пропускает цены из фактов', () => {
    expect(runGuard(input({ messages: [text('Это стоит 7000 ₽')] })).violations.map((v) => v.check)).toEqual(['price_not_in_facts']);
    expect(runGuard(input({ messages: [text('Консультация — 3000 руб')] })).ok).toBe(true);
    expect(runGuard(input({ messages: [text('Напишу через 2 дня')] })).ok).toBe(true);
  });

  it('ловит ссылку не из белого списка', () => {
    const bad = runGuard(input({ messages: [text('Посмотрите https://example.com/page')] }));
    expect(bad.violations[0].check).toBe('url_not_allowed');
    expect(runGuard(input({ messages: [text('Мой канал: t.me/marsel_energy')] })).ok).toBe(true);
  });

  it('ловит признание бота и обещания', () => {
    const checks = runGuard(input({ messages: [text('Я бот, но гарантирую результат')] })).violations.map((v) => v.check);
    expect(checks).toContain('bot_admission');
    expect(checks).toContain('promise');
    expect(runGuard(input({ messages: [text('Я подготовлю разбор')] })).ok).toBe(true);
  });

  it('проверяет блоки: неразрешённый, уже отправленный, обязательный отсутствует, неизвестный', () => {
    const notAllowed = runGuard(input({ messages: [block('price', 'p1', 'цены')] }));
    expect(notAllowed.violations[0].check).toBe('block_not_allowed');

    const alreadySent = runGuard(input({ messages: [block('price', 'p1', 'цены')], allowedBlockKinds: ['price'], sentBlockIds: ['p1'] }));
    expect(alreadySent.violations[0].check).toBe('block_already_sent');

    const missing = runGuard(input({ messages: [text('Вот ссылки')], requiredBlockKinds: ['links'] }));
    expect(missing.violations[0].check).toBe('block_missing');

    const unknown = runGuard(input({ messages: [text('ок')], unknownBlockKinds: ['discount'] }));
    expect(unknown.violations[0].check).toBe('block_unknown');
  });

  it('язык ответа должен совпадать с языком клиента', () => {
    const result = runGuard(input({ messages: [text('Hello! Please send your birth date and place.')], clientLanguage: 'ru' }));
    expect(result.violations[0].check).toBe('language_mismatch');
  });

  it('ловит повтор уже отправленного и вопрос там, где нельзя', () => {
    const past = 'Расскажите, пожалуйста, что сейчас беспокоит больше всего, на какую сферу сделать упор?';
    const similar = runGuard(input({ messages: [text('Расскажите пожалуйста, что сейчас беспокоит больше всего, на какую сферу сделать упор')], pastBotMessages: [past] }));
    expect(similar.violations.map((v) => v.check)).toContain('too_similar');

    const question = runGuard(input({ messages: [text('Займусь диагностикой. Всё понятно?')], noQuestions: true }));
    expect(question.violations[0].check).toBe('question_forbidden');
  });

  it('убирает повторное приветствие автоправкой', () => {
    const result = runGuard(input({ messages: [text('Привет! Спасибо за дату рождения.')], greetedToday: true }));
    expect(result.ok).toBe(true);
    expect(result.messages[0].text).toBe('Спасибо за дату рождения.');
    expect(result.fixes).toHaveLength(1);
  });

  it('блоки не проверяются на текст, только на допуск', () => {
    const result = runGuard(input({ messages: [block('price', 'p1', 'Разбор карты — 5000 ₽. Гарантирую!')], allowedBlockKinds: ['price'] }));
    expect(result.ok).toBe(true);
  });
});

describe('priceViolations', () => {
  it('числа рядом с валютой и в строках про цену', () => {
    const allowed = new Set(['5000']);
    expect(priceViolations('стоит 5000 руб', allowed)).toEqual([]);
    expect(priceViolations('стоит 6 000 ₽', allowed)).toHaveLength(1);
    expect(priceViolations('цена — 12000', allowed)).toHaveLength(1);
    expect(priceViolations('цена обсуждается через 2 дня', allowed)).toEqual([]);
  });
});
