import { describe, expect, it } from 'vitest';
import type { AiChatStateEntity } from '../../entities/ai-chat-state.entity.js';
import { composerOutputSchema } from '../composer/composer.schema.js';
import { emptyCard } from './client-card.js';
import { cardPatch, clientCard, mergeFromOutput, slotsOf } from './turn-card.js';

const NOW = new Date('2026-09-17T12:00:00Z');

function state(patch: Partial<AiChatStateEntity> = {}): AiChatStateEntity {
  return {
    card: emptyCard('ru'),
    manualSlots: [],
    language: 'ru',
    ...patch,
  } as AiChatStateEntity;
}

/** Как это делает ход: слить ответ модели с карточкой и получить патч состояния. */
function apply(current: AiChatStateEntity, out: ReturnType<typeof output>) {
  const merged = mergeFromOutput(clientCard(current, 'ru', NOW), current.manualSlots, out, { now: NOW });
  return { ...merged, patch: cardPatch(merged.card, NOW) };
}

/** Ответ модели проходит ту же схему, что и в бою. */
function output(card: Record<string, unknown>) {
  return composerOutputSchema.parse({
    analysis: { clientIntent: null, card, escalation: null, stageProgress: 'stay', confidence: 0.9 },
    reply: { send: true, messages: ['ок'], silentReason: null },
  });
}

describe('clientCard', () => {
  it('собирает карточку из колонок, если jsonb ещё пуст', () => {
    const card = clientCard(state({ card: {} as never, gender: 'f', birthDate: '1994-03-12', requestSummary: 'отношения' }), 'ru', NOW);
    expect(card.gender).toBe('f');
    expect(card.birthDate).toBe('1994-03-12');
    expect(card.requestSummary).toBe('отношения');
  });
});

describe('mergeFromOutput', () => {
  it('кладёт в патч и карточку, и колонки-слоты', () => {
    const { patch, changes } = apply(state(), output({ birthDate: '1994-03-12', gender: 'f', requestSummary: 'развод' }));
    expect(patch.birthDate).toBe('1994-03-12');
    expect(patch.age).toBe(32);
    expect(patch.isMinor).toBe(false);
    expect(patch.gender).toBe('f');
    expect(patch.card?.gender).toBe('f');
    expect(changes.map((c) => c.field).sort()).toEqual(['birthDate', 'gender', 'requestSummary']);
  });

  it('несовершеннолетний со слов клиента, без даты рождения', () => {
    const { patch } = apply(state(), output({ minorHint: true }));
    expect(patch.age).toBeNull();
    expect(patch.isMinor).toBe(true);
  });

  it('разносит основания по полям', () => {
    const { changes } = apply(state(), output({ gender: 'f', evidence: [{ field: 'gender', quote: 'я сама записалась' }, { field: 'кто-то', quote: 'мусор' }] }));
    expect(changes).toEqual([{ field: 'gender', from: null, to: 'f', evidence: 'я сама записалась' }]);
  });

  it('не даёт модели переписать поле менеджера', () => {
    const before = state({ card: { ...emptyCard('ru'), gender: 'f' }, manualSlots: ['gender'] });
    const { patch, changes } = apply(before, output({ gender: 'm' }));
    expect(patch.gender).toBe('f');
    expect(changes).toEqual([]);
  });

  it('пустая карточка от модели ничего не стирает', () => {
    const before = state({ card: { ...emptyCard('ru'), birthPlace: 'Казань', requestSummary: 'деньги' } });
    const { patch, changes } = apply(before, output({}));
    expect(patch.birthPlace).toBe('Казань');
    expect(patch.requestSummary).toBe('деньги');
    expect(changes).toEqual([]);
  });

  it('одно слово латиницей язык не меняет — язык решает модель', () => {
    const before = state({ card: { ...emptyCard('ru'), language: 'ru' } });
    const { patch } = apply(before, output({}));
    expect(patch.language).toBe('ru');
  });
});

describe('slotsOf', () => {
  it('считает возраст и переносит ручные слоты', () => {
    const slots = slotsOf({ ...emptyCard('ru'), birthDate: '1994-03-12' }, ['gender'], NOW);
    expect(slots.age).toBe(32);
    expect(slots.manualSlots).toEqual(['gender']);
  });
});
