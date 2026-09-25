import { describe, expect, it } from 'vitest';
import { parseAnalysis } from './analysis.js';
import {
  formatHistory,
  isRead,
  lastIncoming,
  lastOutgoing,
  milestoneMessageId,
} from './history.js';
import {
  applyAnalysis,
  knownCategory,
  knownGender,
  letterCount,
  mergeCard,
  readCard,
} from './memory.js';
import type { Analysis, HistoryMessage, Memory, SaidEntry } from './types.js';

const at = (minutes: number) => new Date(Date.UTC(2026, 8, 25, 10, minutes));

describe('история для промпта', () => {
  const history: HistoryMessage[] = [
    {
      id: 1,
      direction: 'in',
      text: 'Здравствуйте, код 12',
      mediaKind: null,
      sentAt: at(0),
      readAt: null,
    },
    {
      id: 2,
      direction: 'out',
      text: 'Здравствуйте. Пришлите дату…',
      mediaKind: null,
      sentAt: at(1),
      readAt: at(2),
    },
    {
      id: 3,
      direction: 'in',
      text: '',
      mediaKind: 'voice',
      sentAt: at(3),
      readAt: null,
    },
    {
      id: 4,
      direction: 'out',
      text: 'Я вернулся и закончил анализ… (5000 символов)',
      mediaKind: null,
      sentAt: at(60),
      readAt: null,
    },
  ];
  const said: SaidEntry[] = [
    { kind: 'milestone', key: 'diagnostic', messageId: 4, at: at(60) },
  ];

  it('сворачивает вехи в заглушки, медиа в подписи, режет по лимиту', () => {
    const lines = formatHistory(history, said, {
      diagnostic: 'диагностика: расставание, женщинам',
    });
    expect(lines.map((line) => `${line.role}: ${line.text}`)).toEqual([
      'client: Здравствуйте, код 12',
      'practitioner: Здравствуйте. Пришлите дату…',
      'client: [голосовое]',
      'practitioner: [отправлена диагностика: расставание, женщинам]',
    ]);
    expect(formatHistory(history, said, {}, 2)).toHaveLength(2);
  });

  it('находит последние сообщения и прочтение', () => {
    expect(lastOutgoing(history)?.id).toBe(4);
    expect(lastIncoming(history)?.id).toBe(3);
    expect(isRead(history, 2)).toBe(true);
    expect(isRead(history, 4)).toBe(false);
    expect(milestoneMessageId(said, 'diagnostic')).toBe(4);
    expect(milestoneMessageId(said, 'offer')).toBeNull();
  });
});

describe('разбор анализа', () => {
  it('нормализует поля, отбрасывает незнакомое', () => {
    const analysis = parseAnalysis(
      `\`\`\`json
      {
        "card": { "name": "Анна", "gender": { "value": "f", "confidence": 0.9 }, "category": { "value": "relationships.breakup", "confidence": 0.6 },
                  "birthDate": "04.01.1999", "junk": 1 },
        "facts": [ { "kind": "situation", "text": "Муж ушёл три месяца назад", "confidence": 0.95 }, { "kind": "weird", "text": "Есть дочь 5 лет" }, { "text": "" } ],
        "supersedes": ["в отношениях"],
        "summary": "Пришла с расставанием.",
        "language": "Russian",
        "risk": ["crisis", "nonsense"],
        "intents": ["shares_story", "asks_price", "shares_story"],
        "objection": "expensive",
        "interest": 7,
        "mood": "sad",
        "answerPoints": [ { "text": "спросила, где живу", "kind": "question", "topic": "practitioner" }, "рассказала о разводе", { "text": "ок", "kind": "other", "topic": "weird", "skip": true } ]
      }
      \`\`\``,
      42,
    );
    expect(analysis.card.name).toEqual({
      value: 'Анна',
      confidence: 1,
      sourceMessageId: 42,
    });
    expect(analysis.card.gender).toEqual({
      value: 'f',
      confidence: 0.9,
      sourceMessageId: 42,
    });
    expect(analysis.card.category?.confidence).toBe(0.6);
    expect(analysis.card.birthDate?.value).toBe('04.01.1999');
    expect(analysis.language).toBe('ru');
    expect(analysis.objection).toBe('expensive');
    expect('junk' in analysis.card).toBe(false);
    expect(analysis.facts.map((fact) => [fact.kind, fact.text])).toEqual([
      ['situation', 'Муж ушёл три месяца назад'],
      ['situation', 'Есть дочь 5 лет'],
    ]);
    expect(analysis.supersedes).toEqual(['в отношениях']);
    expect(analysis.risk).toEqual(['crisis']);
    expect(analysis.intents).toEqual(['shares_story', 'asks_price']);
    expect(analysis.interest).toBe(3);
    expect(analysis.mood).toBe('sad');
    expect(analysis.answerPoints).toEqual([
      {
        id: 'p1',
        text: 'спросила, где живу',
        kind: 'question',
        topic: 'practitioner',
        skip: false,
      },
      {
        id: 'p2',
        text: 'рассказала о разводе',
        kind: 'other',
        topic: 'other',
        skip: false,
      },
      { id: 'p3', text: 'ок', kind: 'other', topic: 'other', skip: true },
    ]);
  });

  it('значения вне закрытых списков отбрасываются, а не угадываются', () => {
    const analysis = parseAnalysis(
      '{"language": "de", "objection": "слишком дорого", "summary": ""}',
      null,
    );
    expect(analysis.language).toBe('other');
    expect(analysis.objection).toBeNull();
    expect(analysis.summary).toBe('');
    expect(parseAnalysis('{"language": null}', null).language).toBeNull();
    expect(parseAnalysis('{"language": "en-US"}', null).language).toBe('en');
  });

  it('падает только на не-объекте', () => {
    expect(() => parseAnalysis('nope', null)).toThrow('не JSON');
    expect(() => parseAnalysis('[1]', null)).toThrow('не JSON');
    expect(() => parseAnalysis('{"card":{}}', null)).not.toThrow();
  });
});

const emptyAnalysis: Analysis = {
  card: {},
  facts: [],
  supersedes: [],
  summary: '',
  language: null,
  risk: [],
  intents: [],
  objection: null,
  interest: 1,
  mood: 'calm',
  answerPoints: [],
};

describe('память', () => {
  it('карточка: увереннее побеждает, пороги пола и категории', () => {
    const current = readCard({
      gender: { value: 'f', confidence: 0.9 },
      category: { value: 'money.work', confidence: 0.5 },
      name: { value: '' },
    });
    expect(current.name).toBeUndefined();
    const merged = mergeCard(current, {
      gender: { value: 'm', confidence: 0.5 },
      category: { value: 'relationships.breakup', confidence: 0.8 },
    });
    expect(merged.gender?.value).toBe('f');
    expect(merged.category?.value).toBe('relationships.breakup');
    expect(knownGender(merged)).toBe('f');
    expect(knownGender({ gender: { value: 'm', confidence: 0.7 } })).toBeNull();
    expect(knownCategory(current)).toBeNull();
  });

  it('факты: дубликаты не добавляются, противоречия помечаются', () => {
    const memory: Memory = {
      card: {},
      facts: [
        {
          kind: 'situation',
          text: 'В отношениях',
          confidence: 1,
          sourceMessageId: 1,
        },
        {
          kind: 'situation',
          text: 'Есть дочь 5 лет',
          confidence: 1,
          sourceMessageId: 1,
        },
      ],
      summary: 'старое',
      said: [],
    };
    const analysis: Analysis = {
      card: {},
      facts: [
        {
          kind: 'situation',
          text: 'есть дочь 5 лет',
          confidence: 1,
          sourceMessageId: 2,
        },
        {
          kind: 'situation',
          text: 'Расстались месяц назад',
          confidence: 0.9,
          sourceMessageId: 2,
        },
      ],
      supersedes: ['в отношениях'],
      summary: 'новое',
      language: 'ru',
      risk: [],
      intents: [],
      objection: null,
      interest: 1,
      mood: 'sad',
      answerPoints: [],
    };
    const { memory: next, factsUpdate } = applyAnalysis(memory, analysis);
    expect(next.facts.map((fact) => fact.text)).toEqual([
      'Расстались месяц назад',
      'Есть дочь 5 лет',
    ]);
    expect(factsUpdate.added.map((fact) => fact.text)).toEqual([
      'Расстались месяц назад',
    ]);
    expect(factsUpdate.superseded).toEqual(['В отношениях']);
    expect(next.summary).toBe('новое');
  });

  it('язык «липкий»: короткая реплика не переключает, настоящий текст — переключает', () => {
    const ru: Memory = {
      card: { language: { value: 'ru', confidence: 1 } },
      facts: [],
      summary: '',
      said: [],
    };
    const en = (text: string) =>
      applyAnalysis(ru, { ...emptyAnalysis, language: 'en' }, text).memory.card
        .language?.value;
    expect(en('ok 👍')).toBe('ru');
    expect(en('Hello, I would like to know more about your work')).toBe('en');
    expect(
      applyAnalysis(
        ru,
        { ...emptyAnalysis, language: null },
        'длинный текст без определённого языка',
      ).memory.card.language?.value,
    ).toBe('ru');
    const fresh: Memory = { card: {}, facts: [], summary: 'старое', said: [] };
    const first = applyAnalysis(
      fresh,
      { ...emptyAnalysis, language: 'en' },
      'Hi',
    ).memory;
    expect(first.card.language?.value).toBe('en');
    expect(first.summary).toBe('старое');
    expect(letterCount('ok 👍 12!')).toBe(2);
  });
});
