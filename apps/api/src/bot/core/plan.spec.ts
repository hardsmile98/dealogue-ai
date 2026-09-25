import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMINGS } from '../library/timings.js';
import { buildPlan } from './plan.js';
import type { LibraryAvailability, PlanInput } from './plan.js';
import type { Analysis, HistoryMessage, Memory, SaidEntry } from './types.js';

const T0 = new Date('2026-09-25T10:00:00Z');
const minutesAgo = (minutes: number) =>
  new Date(T0.getTime() - minutes * 60_000);

const library: LibraryAvailability = {
  milestone: (key, query) =>
    query.language === 'ru' || key !== 'diagnostic'
      ? {
          key,
          itemId: `item-${key}`,
          title: `${key} ${query.category ?? 'universal'} ${query.gender ?? 'any'}`,
        }
      : null,
  supportsLanguage: (language) => language === 'ru' || language === 'en',
};

function analysis(patch: Partial<Analysis> = {}): Analysis {
  return {
    card: {},
    facts: [],
    supersedes: [],
    summary: 'резюме',
    language: 'ru',
    risk: [],
    intents: [],
    objection: null,
    interest: 1,
    mood: 'calm',
    answerPoints: [
      {
        id: 'p1',
        text: 'спросил, где ты живёшь',
        kind: 'question',
        topic: 'practitioner',
        skip: false,
      },
    ],
    ...patch,
  };
}

function memory(patch: Partial<Memory> = {}): Memory {
  return { card: {}, facts: [], summary: '', said: [], ...patch };
}

const said = (
  kind: SaidEntry['kind'],
  key: string,
  messageId: number | null,
  minutes: number,
): SaidEntry => ({
  kind,
  key,
  messageId,
  at: minutesAgo(minutes),
});

const out = (id: number, minutes: number, read: boolean): HistoryMessage => ({
  id,
  direction: 'out',
  text: '…',
  mediaKind: null,
  sentAt: minutesAgo(minutes),
  readAt: read ? minutesAgo(minutes - 1) : null,
});

function input(patch: Partial<PlanInput> = {}): PlanInput {
  return {
    trigger: 'client',
    job: null,
    messages: [{ id: 10, text: 'привет', mediaKind: null, sentAt: T0 }],
    analysis: analysis(),
    memory: memory(),
    history: [],
    stage: 'intake',
    now: T0,
    timings: DEFAULT_TIMINGS,
    state: { turnsWithoutNudge: 0, remindersSent: 0, turnsInStage: 0 },
    library,
    dueJobs: [],
    ...patch,
  };
}

const withBirth = {
  birthDate: { value: '04.01.1999', confidence: 1 },
  birthPlace: { value: 'Москва', confidence: 1 },
};

describe('план: передача менеджеру', () => {
  it.each([
    [
      'медиа',
      input({
        messages: [{ id: 1, text: '', mediaKind: 'voice', sentAt: T0 }],
      }),
      'media',
    ],
    ['риск', input({ analysis: analysis({ risk: ['asks_if_bot'] }) }), 'risk'],
    ['ответ после цен', input({ stage: 'prices' }), 'reply_after_prices'],
    [
      'язык без материалов',
      input({
        memory: memory({
          card: { language: { value: 'other', confidence: 1 } },
        }),
      }),
      'no_language_materials',
    ],
  ])('%s', (_name, planInput, reason) => {
    const plan = buildPlan(planInput);
    expect(plan.handoff?.reason).toBe(reason);
    expect(plan.milestone).toBeNull();
    expect(plan.nudge).toBeNull();
  });
});

describe('план: знакомство', () => {
  it('первый ход: поздороваться, ответить, попросить данные', () => {
    const plan = buildPlan(input());
    expect(plan.answer.map((point) => point.text)).toEqual([
      'спросил, где ты живёшь',
    ]);
    expect(plan.nudge).toBe('ask_birth_data');
    expect(plan.milestone).toBeNull();
    expect(plan.goal).toContain('поздоровайся');
    expect(plan.goal).toContain('дату и место рождения');
    expect(plan.constraints.doNotMention).toContain(
      'цены и суммы своими словами',
    );
    expect(plan.constraints.hook).toBe(true);
  });

  it('первый ход клиента, который сразу всё рассказал: данные ещё не просили — просим, ссылки в том же ходе не шлём', () => {
    const plan = buildPlan(
      input({ analysis: analysis({ intents: ['shares_story'], interest: 2 }) }),
    );
    expect(plan.nudge).toBe('ask_birth_data');
    expect(plan.milestone).toBeNull();
  });

  it('данные есть, запроса нет: спросить о запросе, не больше двух раз', () => {
    const base = input({
      memory: memory({
        card: withBirth,
        said: [said('nudge', 'ask_birth_data', 2, 30)],
      }),
      state: { turnsWithoutNudge: 0, remindersSent: 0, turnsInStage: 1 },
    });
    expect(buildPlan(base).nudge).toBe('ask_request');
    const twice = input({
      ...base,
      memory: memory({
        card: withBirth,
        said: [
          said('nudge', 'ask_birth_data', 2, 30),
          said('nudge', 'ask_request', 4, 20),
          said('nudge', 'ask_request', 6, 10),
        ],
      }),
      state: { turnsWithoutNudge: 0, remindersSent: 0, turnsInStage: 3 },
    });
    const plan = buildPlan(twice);
    expect(plan.nudge).toBeNull();
    // Три хода без запроса — ссылки уходят и без него.
    expect(plan.milestone?.key).toBe('links');
  });

  it('право поговорить: клиент увлечён, данные уже просили — подталкивание пропускается', () => {
    const plan = buildPlan(
      input({
        analysis: analysis({ intents: ['asks_about_practitioner'] }),
        memory: memory({ said: [said('nudge', 'ask_birth_data', 2, 5)] }),
        state: { turnsWithoutNudge: 1, remindersSent: 0, turnsInStage: 1 },
      }),
    );
    expect(plan.nudge).toBe('skip');
    expect(plan.goal).toContain('пропустить');
  });

  it('право поговорить исчерпано: на третьем ходе подряд возвращаем к шагу', () => {
    const plan = buildPlan(
      input({
        analysis: analysis({ intents: ['asks_about_practitioner'] }),
        memory: memory({ card: withBirth }),
        state: { turnsWithoutNudge: 2, remindersSent: 0, turnsInStage: 1 },
      }),
    );
    expect(plan.nudge).toBe('ask_request');
  });

  it('вопрос о цене до предложения — отложенный ответ, не отказ', () => {
    const plan = buildPlan(
      input({
        analysis: analysis({
          intents: ['asks_price'],
          answerPoints: [
            {
              id: 'p1',
              text: 'спросила, сколько стоит работа',
              kind: 'question',
              topic: 'price',
              skip: false,
            },
          ],
        }),
      }),
    );
    expect(plan.answer[0]?.hold).toContain('к стоимости вернёшься');
    expect(plan.goal).toContain('к стоимости вернёшься');
    expect(plan.constraints.doNotMention[0]).toContain('можно и нужно');
  });

  it('решает тема пункта, а не слова в нём: «сколько ждать диагностику» — не цена', () => {
    const plan = buildPlan(
      input({
        analysis: analysis({
          intents: ['asks_price', 'asks_diagnostic_status'],
          answerPoints: [
            {
              id: 'p1',
              text: 'спросила, сколько стоит работа',
              kind: 'question',
              topic: 'price',
              skip: false,
            },
            {
              id: 'p2',
              text: 'спросила, сколько ждать диагностику',
              kind: 'question',
              topic: 'diagnostic',
              skip: false,
            },
            {
              id: 'p3',
              text: 'спросила, где ты живёшь',
              kind: 'question',
              topic: 'practitioner',
              skip: false,
            },
          ],
        }),
      }),
    );
    expect(plan.answer[0]?.hold).toContain('к стоимости');
    expect(plan.answer[1]?.hold).toContain('пришлёшь');
    expect(plan.answer[1]?.hold).not.toContain('стоимост');
    expect(plan.answer[2]?.hold).toBeNull();
  });

  it('веха «ссылки» сама отвечает на вопрос о диагностике — формула не нужна', () => {
    const asks = analysis({
      intents: ['shares_story', 'asks_diagnostic_status'],
      answerPoints: [
        {
          id: 'p1',
          text: 'спросила, когда будет расклад',
          kind: 'question',
          topic: 'diagnostic',
          skip: false,
        },
      ],
    });
    const plan = buildPlan(
      input({
        analysis: asks,
        memory: memory({
          card: withBirth,
          said: [said('nudge', 'ask_birth_data', 2, 10)],
        }),
        state: { turnsWithoutNudge: 0, remindersSent: 0, turnsInStage: 1 },
      }),
    );
    expect(plan.milestone?.key).toBe('links');
    expect(plan.answer[0]?.hold).toBeNull();
  });

  it('цены своими словами запрещены на любом этапе до цен', () => {
    const plan = buildPlan(input());
    expect(plan.constraints.doNotMention).toContain(
      'цены и суммы своими словами',
    );
  });

  it('ссылки: запрос рассказан, данные есть, ход не первый', () => {
    const plan = buildPlan(
      input({
        analysis: analysis({ intents: ['shares_story'] }),
        memory: memory({
          card: {
            ...withBirth,
            category: { value: 'relationships.breakup', confidence: 0.9 },
          },
          said: [said('nudge', 'ask_birth_data', 2, 5)],
        }),
        state: { turnsWithoutNudge: 0, remindersSent: 0, turnsInStage: 1 },
      }),
    );
    expect(plan.milestone?.key).toBe('links');
    expect(plan.nudge).toBeNull();
    expect(plan.constraints.hook).toBe(false);
    expect(plan.goal).toContain('after_block');
  });
});

describe('план: ожидание диагностики', () => {
  const links = [said('milestone', 'links', 5, 50)];

  it('клиент пишет во время ожидания: отвечаем, вехи нет, содержание не раскрываем', () => {
    const plan = buildPlan(
      input({
        stage: 'links',
        memory: memory({ card: withBirth, said: links }),
      }),
    );
    expect(plan.milestone).toBeNull();
    expect(plan.nudge).toBeNull();
    expect(plan.goal).toContain('Поддерживай ожидание');
    expect(plan.constraints.doNotMention).toContain(
      'содержание и выводы диагностики',
    );
  });

  it('«ну что там?» после минимума — диагностика в этом же ходе', () => {
    const plan = buildPlan(
      input({
        stage: 'links',
        analysis: analysis({
          intents: ['asks_diagnostic_status'],
          card: {
            gender: { value: 'f', confidence: 0.9 },
            category: { value: 'relationships.breakup', confidence: 0.9 },
          },
        }),
        memory: memory({
          card: {
            ...withBirth,
            gender: { value: 'f', confidence: 0.9 },
            category: { value: 'relationships.breakup', confidence: 0.9 },
          },
          said: links,
        }),
      }),
    );
    expect(plan.milestone).toEqual({
      key: 'diagnostic',
      itemId: 'item-diagnostic',
      title: 'diagnostic relationships.breakup f',
    });
  });

  it('«ну что там?» слишком рано — ждём', () => {
    const plan = buildPlan(
      input({
        stage: 'links',
        analysis: analysis({ intents: ['asks_diagnostic_status'] }),
        memory: memory({
          card: withBirth,
          said: [said('milestone', 'links', 5, 10)],
        }),
      }),
    );
    expect(plan.milestone).toBeNull();
  });

  it('таймер диагностики по расписанию; пол не уверен — универсальная', () => {
    const plan = buildPlan(
      input({
        trigger: 'schedule',
        job: { id: 'j1', kind: 'diagnostic' },
        messages: [],
        analysis: null,
        stage: 'links',
        memory: memory({
          card: { ...withBirth, gender: { value: 'f', confidence: 0.5 } },
          said: links,
        }),
      }),
    );
    expect(plan.milestone?.title).toBe('diagnostic universal any');
    expect(plan.answer).toEqual([]);
    expect(plan.goal).toContain('Ход по расписанию');
    expect(plan.constraints.maxParts).toBe(2);
  });

  it('диагностика созрела, а данных нет и напоминания не было — сначала напоминание', () => {
    const plan = buildPlan(
      input({
        trigger: 'schedule',
        job: { id: 'j1', kind: 'diagnostic' },
        messages: [],
        analysis: null,
        stage: 'links',
        memory: memory({ said: links }),
      }),
    );
    expect(plan.milestone).toBeNull();
    expect(plan.nudge).toBe('birth_data_reminder');
  });

  it('данных нет, но напоминание уже было — универсальная диагностика', () => {
    const plan = buildPlan(
      input({
        trigger: 'schedule',
        job: { id: 'j1', kind: 'diagnostic' },
        messages: [],
        analysis: null,
        stage: 'links',
        memory: memory({
          said: [...links, said('nudge', 'birth_data_reminder', 7, 20)],
        }),
      }),
    );
    expect(plan.milestone?.key).toBe('diagnostic');
  });

  it('нет диагностики на языке клиента — менеджер', () => {
    const plan = buildPlan(
      input({
        trigger: 'schedule',
        job: { id: 'j1', kind: 'diagnostic' },
        messages: [],
        analysis: null,
        stage: 'links',
        memory: memory({
          card: { ...withBirth, language: { value: 'en', confidence: 1 } },
          said: links,
        }),
      }),
    );
    expect(plan.handoff?.reason).toBe('no_language_materials');
  });
});

describe('план: после диагностики и предложения', () => {
  const diagnosticSaid = [
    said('milestone', 'links', 5, 200),
    said('milestone', 'diagnostic', 9, 100),
  ];

  it('диагностика прочитана, клиент откликнулся с интересом — предложение', () => {
    const plan = buildPlan(
      input({
        stage: 'diagnostic',
        analysis: analysis({ intents: ['answers_question'], interest: 2 }),
        memory: memory({ card: withBirth, said: diagnosticSaid }),
        history: [out(9, 100, true)],
      }),
    );
    expect(plan.milestone?.key).toBe('offer');
  });

  it('диагностика не прочитана — предложения нет, даже по расписанию, и ход пустой', () => {
    const plan = buildPlan(
      input({
        trigger: 'schedule',
        job: { id: 'j', kind: 'offer' },
        messages: [],
        analysis: null,
        stage: 'diagnostic',
        memory: memory({ said: diagnosticSaid }),
        history: [out(9, 100, false)],
      }),
    );
    expect(plan.milestone).toBeNull();
    expect(plan.idle).toContain('offer');
  });

  it('устаревшие задания пропускаются без текста', () => {
    const schedule = (
      kind: 'diagnostic' | 'birth_data_reminder' | 'return_question',
      patch: Partial<PlanInput>,
    ) =>
      buildPlan(
        input({
          trigger: 'schedule',
          job: { id: 'j', kind },
          messages: [],
          analysis: null,
          ...patch,
        }),
      );
    // Диагностика уже ушла (например, в ходе клиента по срочному заданию).
    expect(
      schedule('diagnostic', {
        stage: 'diagnostic',
        memory: memory({ said: diagnosticSaid }),
        history: [out(9, 100, true)],
      }).idle,
    ).not.toBeNull();
    // Данные пришли раньше напоминания.
    expect(
      schedule('birth_data_reminder', { memory: memory({ card: withBirth }) })
        .idle,
    ).not.toBeNull();
    expect(schedule('birth_data_reminder', {}).nudge).toBe(
      'birth_data_reminder',
    );
    // Этап сменился — вопрос-отклик после диагностики уже не к месту.
    expect(
      schedule('return_question', {
        stage: 'offer',
        memory: memory({
          said: [...diagnosticSaid, said('milestone', 'offer', 12, 30)],
        }),
      }).idle,
    ).not.toBeNull();
  });

  it('таймер диагностики раньше данных: сначала напоминание', () => {
    const plan = buildPlan(
      input({
        trigger: 'schedule',
        job: { id: 'j', kind: 'diagnostic' },
        messages: [],
        analysis: null,
        stage: 'links',
        memory: memory({ said: [said('milestone', 'links', 5, 120)] }),
      }),
    );
    expect(plan.milestone).toBeNull();
    expect(plan.nudge).toBe('birth_data_reminder');
    expect(plan.idle).toBeNull();
  });

  it('слабый отклик — вопрос-отклик, потом без повтора', () => {
    const base = input({
      stage: 'diagnostic',
      analysis: analysis({ intents: ['silent_ack'], interest: 1 }),
      memory: memory({ said: diagnosticSaid }),
      history: [out(9, 100, true)],
    });
    expect(buildPlan(base).nudge).toBe('ask_feedback');
    const again = input({
      ...base,
      memory: memory({
        said: [...diagnosticSaid, said('nudge', 'ask_feedback', 11, 30)],
      }),
    });
    expect(buildPlan(again).nudge).toBeNull();
    expect(buildPlan(again).constraints.doNotRepeat).toContain(
      'вопрос: ask_feedback',
    );
  });

  it('возражение: первый подход, при повторе — следующий', () => {
    const base = input({
      stage: 'offer',
      analysis: analysis({ intents: ['objects'], objection: 'expensive' }),
      memory: memory({
        said: [...diagnosticSaid, said('milestone', 'offer', 12, 30)],
      }),
      history: [out(12, 30, true)],
    });
    expect(buildPlan(base).objection).toEqual({
      category: 'expensive',
      approach: 0,
    });
    const repeated = input({
      ...base,
      memory: memory({
        said: [
          ...diagnosticSaid,
          said('milestone', 'offer', 12, 30),
          said('argument', 'expensive:0', 13, 10),
        ],
      }),
    });
    const plan = buildPlan(repeated);
    expect(plan.objection).toEqual({ category: 'expensive', approach: 1 });
    expect(plan.goal).toContain('другой подход');
    // Возражение — увлечённость, подталкивание можно пропустить.
    expect(plan.nudge).toBe('skip');
  });

  it('спросил цену после прочитанного предложения — цены; до прочтения — нет', () => {
    const offerSaid = [...diagnosticSaid, said('milestone', 'offer', 12, 30)];
    const asksPrice = analysis({
      intents: ['asks_price'],
      answerPoints: [
        {
          id: 'p1',
          text: 'спросил, сколько стоит',
          kind: 'question',
          topic: 'price',
          skip: false,
        },
      ],
    });
    const priced = buildPlan(
      input({
        stage: 'offer',
        analysis: asksPrice,
        memory: memory({ said: offerSaid }),
        history: [out(12, 30, true)],
      }),
    );
    expect(priced.milestone?.key).toBe('prices');
    // Цены уходят вехой в этом же ходе — пункт отвечается как есть.
    expect(priced.answer[0]?.hold).toBeNull();
    const unread = buildPlan(
      input({
        stage: 'offer',
        analysis: asksPrice,
        memory: memory({ said: offerSaid }),
        history: [out(12, 30, false)],
      }),
    );
    expect(unread.milestone).toBeNull();
    expect(unread.answer[0]?.hold).toContain('к стоимости');
  });

  it('ступени молчания считаются напоминаниями, вехи — нет', () => {
    const nudge = buildPlan(
      input({
        trigger: 'schedule',
        job: { id: 'j', kind: 'return_question' },
        messages: [],
        analysis: null,
        stage: 'diagnostic',
        memory: memory({ said: diagnosticSaid }),
        history: [out(9, 100, true)],
      }),
    );
    expect(nudge.nudge).toBe('ask_feedback');
    expect(nudge.reminders).toBe(1);
    const prices = buildPlan(
      input({
        trigger: 'schedule',
        job: { id: 'j', kind: 'prices' },
        messages: [],
        analysis: null,
        stage: 'offer',
        memory: memory({
          said: [...diagnosticSaid, said('milestone', 'offer', 12, 30)],
        }),
        history: [out(12, 30, true)],
      }),
    );
    expect(prices.milestone?.key).toBe('prices');
    expect(prices.reminders).toBe(0);
  });
});
