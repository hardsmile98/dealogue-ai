import { describe, expect, it } from 'vitest';
import { emptyCard } from '../card/client-card.js';
import type { ClientCard } from '../../domain/types.js';
import type { HistoryMessage } from '../agent.types.js';
import { buildCriticPrompt, criticOutputSchema, shouldReview } from './critic.js';
import type { CriticInput } from './critic.js';

const NOW = new Date('2026-09-21T12:00:00Z');

function message(role: HistoryMessage['role'], text: string): HistoryMessage {
  return { id: role + text, telegramMessageId: 1, role, text, sentAt: NOW, readAt: null, mediaKind: null, turnId: null };
}

function input(patch: Partial<CriticInput> = {}): CriticInput {
  const card: ClientCard = { ...emptyCard('ru'), requestSummary: 'сомневается в партнёре', facts: ['муж Сергей'] };
  return {
    stage: 'collect_request',
    goal: 'выяснить запрос',
    task: 'Клиент написал — ответь и веди к цели этапа.',
    card,
    age: 32,
    history: [message('bot', 'Здравствуйте! Подскажите дату и место рождения')],
    batch: [message('client', '05.06.1999 Москва')],
    confidence: 0.9,
    replyPlan: 'Поблагодарю за данные и спрошу, что беспокоит.',
    reply: 'Спасибо! Расскажите, что сейчас беспокоит?',
    firstReply: false,
    ...patch,
  };
}

describe('когда зовём критика', () => {
  it('первый ответ лиду разбираем всегда', () => {
    expect(shouldReview({ stage: 'greeting', confidence: 1, firstReply: true })).toBe(true);
  });

  it('низкая уверенность модели — тоже повод', () => {
    expect(shouldReview({ stage: 'reminders', confidence: 0.5, firstReply: false })).toBe(true);
  });

  it('дорогие этапы разбираем, дешёвые — нет', () => {
    expect(shouldReview({ stage: 'price', confidence: 1, firstReply: false })).toBe(true);
    expect(shouldReview({ stage: 'offer', confidence: 1, firstReply: false })).toBe(true);
    expect(shouldReview({ stage: 'collect_birth', confidence: 1, firstReply: false })).toBe(false);
    expect(shouldReview({ stage: 'reminders', confidence: 1, firstReply: false })).toBe(false);
  });
});

describe('промпт разбора', () => {
  it('несёт задачу хода, карточку, переписку, план и сам ответ', () => {
    const prompt = buildCriticPrompt(input());
    expect(prompt).toContain('ЭТАП: collect_request');
    expect(prompt).toContain('сомневается в партнёре');
    expect(prompt).toContain('муж Сергей');
    expect(prompt).toContain('КЛИЕНТ: 05.06.1999 Москва');
    expect(prompt).toContain('ЧТО БОТ СОБИРАЛСЯ СДЕЛАТЬ: Поблагодарю');
    expect(prompt).toContain('Спасибо! Расскажите, что сейчас беспокоит?');
  });

  it('на первом ответе прямо говорит, что переписки ещё не было', () => {
    expect(buildCriticPrompt(input({ history: [], firstReply: true }))).toContain('это первый ответ клиенту');
  });
});

describe('разбор схемы ответа', () => {
  it('чистит список замечаний и держит его коротким', () => {
    const parsed = criticOutputSchema.parse({
      ok: false,
      violations: ['  Не спрашивай про код  ', '', null, 'Сократи', 'Третье', 'Четвёртое', 'Пятое'],
    });
    expect(parsed.violations).toEqual(['Не спрашивай про код', 'Сократи', 'Третье', 'Четвёртое']);
  });

  it('мусор вместо списка — значит замечаний нет', () => {
    expect(criticOutputSchema.parse({ ok: true, violations: 'всё хорошо' }).violations).toEqual([]);
  });
});
