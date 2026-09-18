import { describe, expect, it } from 'vitest';
import type { AiChatStateEntity } from '../../entities/ai-chat-state.entity.js';
import type { ComposerOutput } from '../composer/composer.schema.js';
import type { HistoryMessage } from '../agent.types.js';
import { slotsFromAnalysis, slotsFromMessages, snapshot } from './turn-slots.js';

const NOW = new Date('2026-09-17T12:00:00Z');

function state(patch: Partial<AiChatStateEntity> = {}): AiChatStateEntity {
  return {
    birthDate: null,
    birthDateText: null,
    birthPlace: null,
    age: null,
    isMinor: false,
    gender: null,
    genderSource: null,
    language: 'ru',
    requestCategoryKey: null,
    requestSummary: null,
    manualSlots: [],
    ...patch,
  } as AiChatStateEntity;
}

function message(text: string): HistoryMessage {
  return { id: 'm1', telegramMessageId: 1, role: 'client', text, sentAt: NOW, readAt: null, mediaKind: null, turnId: null };
}

function analysis(slots: Record<string, unknown>, language = 'ru'): ComposerOutput {
  return { analysis: { slots, language }, reply: { send: true, messages: [] } } as unknown as ComposerOutput;
}

describe('snapshot', () => {
  it('подставляет русский, если язык в состоянии не проставлен', () => {
    expect(snapshot(state({ language: '' })).language).toBe('ru');
  });
});

describe('slotsFromMessages', () => {
  it('вынимает дату рождения, возраст и язык', () => {
    const patch = slotsFromMessages(state(), [message('12.03.1994, Москва')], NOW);
    expect(patch.birthDate).toBe('1994-03-12');
    expect(patch.age).toBe(32);
    expect(patch.isMinor).toBe(false);
    expect(patch.language).toBe('ru');
  });

  it('помечает несовершеннолетнего', () => {
    const patch = slotsFromMessages(state(), [message('родился 01.12.2010')], NOW);
    expect(patch.isMinor).toBe(true);
  });

  it('не трогает слот, который правил менеджер', () => {
    const patch = slotsFromMessages(state({ manualSlots: ['birthDate'] }), [message('12.03.1994')], NOW);
    expect(patch.birthDate).toBeUndefined();
    expect(patch.birthDateText).toBeUndefined();
  });

  it('не перезаписывает уже известную дату', () => {
    const patch = slotsFromMessages(state({ birthDate: '1990-01-01' }), [message('12.03.1994')], NOW);
    expect(patch.birthDate).toBeUndefined();
  });

  it('на пустой пачке возвращает пустой патч', () => {
    expect(slotsFromMessages(state(), [], NOW)).toEqual({});
  });
});

describe('slotsFromAnalysis', () => {
  it('заполняет пустые слоты из ответа модели', () => {
    const patch = slotsFromAnalysis(state(), analysis({ birthPlace: 'Казань', requestSummary: 'отношения', genderHint: 'f' }), NOW);
    expect(patch.birthPlace).toBe('Казань');
    expect(patch.requestSummary).toBe('отношения');
    expect(patch.gender).toBe('f');
    expect(patch.genderSource).toBe('text');
  });

  it('уточняет запрос, только если формулировка стала подробнее', () => {
    const short = slotsFromAnalysis(state({ requestSummary: 'очень длинная формулировка запроса' }), analysis({ requestSummary: 'коротко' }), NOW);
    expect(short.requestSummary).toBeUndefined();
    const long = slotsFromAnalysis(state({ requestSummary: 'коротко' }), analysis({ requestSummary: 'подробная формулировка' }), NOW);
    expect(long.requestSummary).toBe('подробная формулировка');
  });

  it('не перезаписывает ручные слоты', () => {
    const patch = slotsFromAnalysis(state({ manualSlots: ['gender', 'request'] }), analysis({ genderHint: 'm', requestSummary: 'что-то' }), NOW);
    expect(patch.gender).toBeUndefined();
    expect(patch.requestSummary).toBeUndefined();
  });

  it('меняет язык только на отличный от «other» и от текущего', () => {
    expect(slotsFromAnalysis(state(), analysis({}, 'other'), NOW).language).toBeUndefined();
    expect(slotsFromAnalysis(state(), analysis({}, 'ru'), NOW).language).toBeUndefined();
    expect(slotsFromAnalysis(state(), analysis({}, 'en'), NOW).language).toBe('en');
  });

  it('верит подсказке о несовершеннолетнем, пока дату не правил менеджер', () => {
    expect(slotsFromAnalysis(state(), analysis({ isMinorHint: true }), NOW).isMinor).toBe(true);
    expect(slotsFromAnalysis(state({ manualSlots: ['birthDate'] }), analysis({ isMinorHint: true }), NOW).isMinor).toBeUndefined();
  });
});
