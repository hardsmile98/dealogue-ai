import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMINGS } from '../library/timings.js';
import { buildPlan, needsWriter } from './plan.js';
import { fallbackStepPhrase } from './steps.js';
import type { LibraryAvailability, PlanInput } from './plan.js';
import type {
  Analysis,
  AnswerPoint,
  HistoryMessage,
  Memory,
  SaidEntry,
} from './types.js';

const T0 = new Date('2026-09-25T10:00:00Z');
const minutesAgo = (minutes: number) =>
  new Date(T0.getTime() - minutes * 60_000);

/** Фразы из таблиц по «вид:категория». */
const PHRASES: Record<string, string[]> = {
  'greeting:-': ['Здравствуйте. Пришлите дату и место рождения.'],
  'ask_birth_data:-': ['Пришлите, пожалуйста, дату рождения.'],
  'ask_request:sphere': ['На какую сферу сделать упор?'],
  'ask_request:relationships': ['Вы сейчас состоите в отношениях?'],
  'ask_request:family': ['У вас уже есть дети?'],
  'no_birth_data:-': ['Вам актуален бесплатный анализ?'],
  'wait:-': ['Понял вас) Сделаю анализ и вернусь, хорошо?'],
  'wait:no_request': ['Понял вас) Сделаю общий анализ и вернусь!'],
  'links:no_request': [
    'Не увидел вашего запроса и сделал вам общий анализ, результаты ниже❤️\n\nА так же загляните на мои страницы.\n\nt.me/soul',
  ],
  'return_question:-': [
    'Что бы вы хотели изменить?',
    'Жду обратную связь по раскладу)',
  ],
  'nudge:offer': [
    'Всё ли понятно по направлениям?',
    'Всё ли понятно или есть вопросы?',
  ],
  'price_deflect:-': ['Стоимость — вопрос обсуждаемый.'],
  'objection:think_about_it': [
    'Может, есть вопросы по работе?',
    'Что смутило?',
  ],
  'diagnostic_objection:not_resonate': [
    'Понимаю) Скажите, что вас сейчас беспокоит?',
  ],
};

const library: LibraryAvailability = {
  milestone: (key, query) =>
    query.language === 'ru' || key !== 'diagnostic'
      ? {
          key,
          itemId: `item-${key}`,
          title: `${key} ${query.category ?? 'universal'} ${query.gender ?? 'any'}`,
          kind: key,
        }
      : null,
  phrases: (kind, query) => PHRASES[`${kind}:${query.category ?? '-'}`] ?? [],
  supportsLanguage: (language) => language === 'ru' || language === 'en',
};

const point = (
  kind: AnswerPoint['kind'],
  topic: AnswerPoint['topic'],
  text: string,
): AnswerPoint => ({ id: text, text, kind, topic, skip: kind === 'ack' });

const asksWhereYouLive = point(
  'question',
  'practitioner',
  'спросил, где ты живёшь',
);

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
    answerPoints: [asksWhereYouLive],
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

const incoming = (id: number, minutes: number): HistoryMessage => ({
  id,
  direction: 'in',
  text: '…',
  mediaKind: null,
  sentAt: minutesAgo(minutes),
  readAt: null,
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
    handoffAfter: 'prices',
    state: { remindersSent: 0, turnsInStage: 0 },
    library,
    dueJobs: [],
    ...patch,
  };
}

function scheduled(
  kind: NonNullable<PlanInput['job']>['kind'],
  patch: Partial<PlanInput> = {},
): PlanInput {
  return input({
    trigger: 'schedule',
    job: { id: 'j', kind },
    messages: [],
    analysis: null,
    ...patch,
  });
}

const withBirth = {
  birthDate: { value: '04.01.1999', confidence: 1 },
  birthPlace: { value: 'Москва', confidence: 1 },
};
/** «Финансы» одним словом: сфера ясна, подкатегория — нет. */
const money = {
  sphere: { value: 'money', confidence: 0.95 },
  category: { value: 'money.more', confidence: 0.4 },
};
/** «Отношения» одним словом: у сферы есть уточняющий вопрос. */
const relationships = { sphere: { value: 'relationships', confidence: 0.95 } };
const asked = [said('nudge', 'ask_birth_data', 2, 30)];

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

describe('план: агент ведёт до выбранной вехи (настройка аккаунта)', () => {
  const linksSaid = [said('milestone', 'links', 5, 50)];
  const diagnosticSaid = [...linksSaid, said('milestone', 'diagnostic', 9, 30)];
  const seen = [out(9, 30, true), incoming(10, 1)];

  it('«до диагностики»: диагностика по таймеру уходит, и после неё чат у менеджера', () => {
    const plan = buildPlan(
      scheduled('diagnostic', {
        stage: 'links',
        handoffAfter: 'diagnostic',
        memory: memory({ card: { ...withBirth, ...money }, said: linksSaid }),
      }),
    );
    expect(plan.milestone?.key).toBe('diagnostic');
    expect(plan.close).toBe('limit_reached');
  });

  it('«до вариантов»: диагностика уходит как обычно, без передачи', () => {
    const plan = buildPlan(
      scheduled('diagnostic', {
        stage: 'links',
        handoffAfter: 'offer',
        memory: memory({ card: { ...withBirth, ...money }, said: linksSaid }),
      }),
    );
    expect(plan.milestone?.key).toBe('diagnostic');
    expect(plan.close).toBeNull();
  });

  it('«до вариантов»: варианты уходят, и после них чат у менеджера', () => {
    const plan = buildPlan(
      input({
        stage: 'diagnostic',
        handoffAfter: 'offer',
        analysis: analysis({
          intents: ['asks_practice'],
          answerPoints: [point('request', 'practice', 'расскажите')],
        }),
        memory: memory({ said: diagnosticSaid }),
        history: seen,
      }),
    );
    expect(plan.milestone?.key).toBe('offer');
    expect(plan.close).toBe('limit_reached');
  });

  it('«до цен»: цены передаёт сама веха (`prices_sent`), отдельной отметки нет', () => {
    const plan = buildPlan(
      input({
        stage: 'offer',
        handoffAfter: 'prices',
        analysis: analysis({
          intents: ['asks_price'],
          answerPoints: [point('question', 'price', 'сколько стоит?')],
        }),
        memory: memory({
          said: [...diagnosticSaid, said('milestone', 'offer', 11, 20)],
        }),
        history: [out(11, 20, true), incoming(12, 1)],
      }),
    );
    expect(plan.milestone?.key).toBe('prices');
    expect(plan.close).toBeNull();
  });

  it('последняя веха уже ушла, клиент написал — менеджеру, ему нужен ответ', () => {
    const plan = buildPlan(
      input({
        stage: 'diagnostic',
        handoffAfter: 'diagnostic',
        memory: memory({ said: diagnosticSaid }),
        history: seen,
      }),
    );
    expect(plan.handoff?.reason).toBe('reply_after_limit');
    expect(plan.milestone).toBeNull();
    expect(plan.nudge).toBeNull();
  });

  it('настройку убавили, а этап уже дальше: созревшее напоминание молча передаёт чат менеджеру', () => {
    const plan = buildPlan(
      scheduled('offer_nudge', {
        stage: 'offer',
        handoffAfter: 'diagnostic',
        memory: memory({
          said: [...diagnosticSaid, said('milestone', 'offer', 11, 2000)],
        }),
        history: [out(11, 2000, true)],
      }),
    );
    expect(plan.handoff?.reason).toBe('limit_reached');
    expect(plan.nudge).toBeNull();
  });

  it('до последней вехи агент ведёт как обычно', () => {
    const plan = buildPlan(
      input({ stage: 'links', handoffAfter: 'diagnostic' }),
    );
    expect(plan.handoff).toBeNull();
  });
});

describe('план: знакомство', () => {
  it('«хочу бесплатный расклад»: приветствие и одним сообщением дата, место и что беспокоит — по фразе из таблиц', () => {
    const plan = buildPlan(
      input({
        analysis: analysis({
          answerPoints: [
            point('greeting', 'other', 'поздоровался'),
            point('request', 'diagnostic', 'хочет бесплатный расклад'),
          ],
        }),
      }),
    );
    expect(plan.nudge).toBe('ask_birth_data');
    expect(plan.phrases).toEqual(PHRASES['greeting:-']);
    expect(plan.answer).toEqual([]);
    expect(plan.milestone).toBeNull();
    expect(plan.constraints.maxParts).toBe(1);
    expect(plan.goal).toContain('начни с приветствия');
    // Не «в какой сфере вопрос», а рассказать, что беспокоит (решение владельца 01.10.2026).
    expect(plan.goal).toContain(
      'попроси прислать дату рождения и место рождения и коротко рассказать, что сейчас беспокоит и на какую сферу нужен расклад',
    );
    expect(plan.goal).not.toContain('в какой сфере вопрос');
    expect(plan.constraints.maxQuestions).toBe(1);
  });

  it('сфера названа, о себе ничего — дата, место и мягкий вопрос, что именно беспокоит в этой сфере', () => {
    const plan = buildPlan(
      input({
        analysis: analysis({ answerPoints: [], card: money }),
        memory: memory({ card: money }),
      }),
    );
    expect(plan.nudge).toBe('ask_birth_data');
    expect(plan.goal).toContain('прислать дату рождения и место рождения');
    expect(plan.goal).toContain(
      'что именно беспокоит в этой сфере (финансы): ответ не обязателен',
    );
    expect(plan.goal).not.toContain('на какую сферу нужен расклад');
    expect(plan.constraints.maxQuestions).toBe(1);
  });

  it('сфера названа и клиент уже рассказал, что случилось, — только дата и место, отклик на рассказ', () => {
    const story = point('story', 'client', 'с мужем постоянные ссоры');
    const plan = buildPlan(
      input({
        analysis: analysis({
          intents: ['shares_story'],
          answerPoints: [story],
          card: relationships,
        }),
        memory: memory({
          card: {
            ...relationships,
            category: { value: 'relationships.couple', confidence: 0.9 },
          },
          facts: [
            {
              kind: 'situation',
              text: 'постоянные ссоры с мужем',
              confidence: 0.9,
              sourceMessageId: 10,
            },
          ],
        }),
      }),
    );
    expect(plan.nudge).toBe('ask_birth_data');
    expect(plan.goal).toContain('прислать дату рождения и место рождения');
    expect(plan.goal).not.toContain('что именно беспокоит');
    expect(plan.react).toEqual(['с мужем постоянные ссоры']);
    expect(plan.goal).toContain('с теплом и пониманием');
  });

  it('сфера с уточнением — вместо «что беспокоит» уточняющий вопрос: второго вопроса нет', () => {
    const plan = buildPlan(
      input({
        analysis: analysis({ answerPoints: [], card: relationships }),
        memory: memory({ card: relationships }),
      }),
    );
    expect(plan.nudge).toBe('ask_birth_data');
    expect(plan.coveredNudges).toEqual(['clarify_request']);
    expect(plan.goal).toContain('задай уточняющий вопрос из образца');
    expect(plan.goal).not.toContain('что именно беспокоит');
  });

  it('клиенту тяжело или тревожно — в плане тёплый тон; по расписанию — нет', () => {
    const sad = buildPlan(input({ analysis: analysis({ mood: 'sad' }) }));
    expect(sad.goal).toContain('пиши мягко и тепло');
    const anxious = buildPlan(
      input({ analysis: analysis({ mood: 'anxious' }) }),
    );
    expect(anxious.goal).toContain('Клиент тревожится');
    const calm = buildPlan(input());
    expect(calm.goal).not.toContain('тепло;');
  });

  it('вопрос в первом сообщении: ответ и шаг — одним сообщением, как у человека', () => {
    const plan = buildPlan(input());
    expect(plan.answer.map((item) => item.text)).toEqual([
      'спросил, где ты живёшь',
    ]);
    expect(plan.nudge).toBe('ask_birth_data');
    expect(plan.constraints.maxParts).toBe(1);
    expect(plan.goal).toContain('в том же сообщении, после ответа');
  });

  it('рассказ о беде в первом сообщении — отклик в начале просьбы о данных, отдельного ответа нет', () => {
    const plan = buildPlan(
      input({
        analysis: analysis({
          intents: ['shares_story'],
          answerPoints: [
            point('request', 'diagnostic', 'хочет расклад'),
            point('story', 'client', 'муж ушёл, с деньгами тяжело'),
          ],
        }),
      }),
    );
    expect(plan.nudge).toBe('ask_birth_data');
    expect(plan.answer).toEqual([]);
    expect(plan.react).toEqual(['муж ушёл, с деньгами тяжело']);
    expect(plan.constraints.maxParts).toBe(1);
    expect(plan.goal).toContain('Клиент рассказал: муж ушёл');
  });

  it('клиент сразу прислал всё — ссылки в первом же ходе; «займусь анализом» без «хорошо?»', () => {
    const plan = buildPlan(
      input({
        analysis: analysis({
          intents: ['shares_story'],
          answerPoints: [
            point('data', 'client', 'прислал дату и место рождения'),
            point('story', 'client', 'стал мало зарабатывать'),
          ],
        }),
        memory: memory({ card: { ...withBirth, ...money } }),
      }),
    );
    expect(plan.milestone?.key).toBe('links');
    expect(plan.nudge).toBe('start_analysis');
    expect(plan.phrases).toEqual(PHRASES['wait:-']);
    expect(plan.answer).toEqual([]);
    // Рассказ — отклик в сообщении «займусь анализом», а не отдельный ответ.
    expect(plan.react).toEqual(['стал мало зарабатывать']);
    expect(plan.goal).toContain('Шаг — утверждение');
    expect(plan.goal).toContain('«хорошо?»');
    expect(plan.constraints.maxQuestions).toBe(0);
    expect(plan.goal).toContain('Вопросов клиенту в ответе нет');
    // Не прошёл текст — уходит фраза шага без «хорошо?», а такой нет — нейтральная.
    expect(fallbackStepPhrase(plan)).toBeNull();
    expect(
      fallbackStepPhrase({
        ...plan,
        phrases: ['Понял вас) Вернусь, хорошо?', 'Понял вас) Скоро вернусь!'],
      }),
    ).toBe('Понял вас) Скоро вернусь!');
  });

  it('в первом сообщении дата без места и сферы — приветствие и вопрос о сфере: место необязательно', () => {
    const plan = buildPlan(
      input({
        memory: memory({ card: { birthDate: withBirth.birthDate } }),
      }),
    );
    expect(plan.nudge).toBe('ask_sphere');
    expect(plan.phrases).toEqual(PHRASES['ask_request:sphere']);
    expect(plan.goal).toContain('начни с приветствия');
    expect(plan.goal).not.toContain('место рождения');
  });

  it('«01.02.1999, Финансы» без места — не переспрашиваем: сразу «займусь анализом» и ссылки', () => {
    const plan = buildPlan(
      input({
        analysis: analysis({
          answerPoints: [
            point('data', 'client', 'прислал дату рождения'),
            point('data', 'client', 'сфера — финансы'),
          ],
        }),
        memory: memory({
          card: { birthDate: withBirth.birthDate, ...money },
          said: asked,
        }),
        state: { remindersSent: 0, turnsInStage: 1 },
      }),
    );
    expect(plan.milestone?.key).toBe('links');
    expect(plan.nudge).toBe('start_analysis');
    expect(plan.answer).toEqual([]);
  });

  it('прислал дату без сферы — вопрос о сфере, место не переспрашиваем', () => {
    const plan = buildPlan(
      input({
        analysis: analysis({
          answerPoints: [point('data', 'client', 'прислал дату рождения')],
        }),
        memory: memory({
          card: { birthDate: withBirth.birthDate },
          said: asked,
        }),
        state: { remindersSent: 0, turnsInStage: 1 },
      }),
    );
    expect(plan.milestone).toBeNull();
    expect(plan.nudge).toBe('ask_sphere');
    expect(plan.phrases).toEqual(PHRASES['ask_request:sphere']);
    expect(plan.answer).toEqual([]);
    // Вопрос о сфере — часть просьбы о данных, это не повтор.
    expect(plan.constraints.doNotRepeat).toEqual([]);
    expect(plan.goal).not.toContain('место рождения');
  });

  it('на вопрос о сфере не ответил — третья просьба; не ответил и тогда — «займусь анализом», будет общий анализ', () => {
    const sphereAsked = [...asked, said('nudge', 'ask_sphere', 4, 10)];
    const plan = buildPlan(
      input({
        analysis: analysis({ intents: ['asks_about_practitioner'] }),
        memory: memory({ card: withBirth, said: sphereAsked }),
        state: { remindersSent: 0, turnsInStage: 2 },
      }),
    );
    expect(plan.milestone).toBeNull();
    expect(plan.nudge).toBe('ask_sphere');
    expect(plan.answer.map((item) => item.text)).toEqual([
      'спросил, где ты живёшь',
    ]);
    expect(plan.constraints.maxParts).toBe(1);

    const last = buildPlan(
      input({
        analysis: analysis({ intents: ['asks_about_practitioner'] }),
        memory: memory({
          card: withBirth,
          said: [...sphereAsked, said('nudge', 'ask_sphere', 6, 5)],
        }),
        state: { remindersSent: 0, turnsInStage: 3 },
      }),
    );
    expect(last.milestone?.key).toBe('links');
    expect(last.nudge).toBe('start_analysis');
    expect(last.phrases).toEqual(PHRASES['wait:no_request']);
    expect(last.answer.map((item) => item.text)).toEqual([
      'спросил, где ты живёшь',
    ]);
  });

  it('«Отношения» в ответ на просьбу о данных — ещё раз дата вместе с уточнением, потом дата; после трёх просьб — дальше без неё', () => {
    // Ответ на первую просьбу — только сфера.
    const plan = buildPlan(
      input({
        analysis: analysis({
          card: relationships,
          answerPoints: [point('data', 'client', 'сфера — отношения')],
        }),
        memory: memory({ card: relationships, said: asked }),
        state: { remindersSent: 0, turnsInStage: 1 },
      }),
    );
    expect(plan.milestone).toBeNull();
    expect(plan.nudge).toBe('ask_birth_date');
    expect(plan.coveredNudges).toEqual(['clarify_request']);
    expect(plan.phrases).toEqual([
      'Пришлите, пожалуйста, дату рождения. Вы сейчас состоите в отношениях?',
    ]);
    expect(plan.goal).toContain(
      'ещё раз попроси прислать дату рождения и задай уточняющий вопрос',
    );
    expect(plan.goal).not.toContain('место рождения');
    expect(plan.constraints.maxParts).toBe(1);
    // Первая просьба — не «повтор»: повторная просьба по сути её повторяет.
    expect(plan.constraints.doNotRepeat).toEqual([]);

    // «Нет» — подкатегория ясна, даты всё ещё нет: третья просьба, только о дате.
    const single = {
      ...relationships,
      category: { value: 'relationships.single', confidence: 0.9 },
    };
    const second = [
      ...asked,
      said('nudge', 'ask_birth_date', 4, 20),
      said('nudge', 'clarify_request', 4, 20),
    ];
    const again = buildPlan(
      input({
        analysis: analysis({
          answerPoints: [point('answer', 'client', 'нет')],
        }),
        memory: memory({ card: single, said: second }),
        state: { remindersSent: 0, turnsInStage: 2 },
      }),
    );
    expect(again.nudge).toBe('ask_birth_date');
    expect(again.coveredNudges).toEqual([]);
    expect(again.phrases).toEqual(PHRASES['ask_birth_data:-']);
    expect(again.goal).toContain('ещё раз попроси прислать дату рождения.');
    expect(again.constraints.doNotRepeat).toEqual([
      'уточняющий вопрос о запросе',
    ]);

    // Три просьбы были — дальше без даты: ссылки, диагностика по подкатегории.
    const done = buildPlan(
      input({
        analysis: analysis({ intents: ['asks_about_practitioner'] }),
        memory: memory({
          card: single,
          said: [...second, said('nudge', 'ask_birth_date', 6, 5)],
        }),
        state: { remindersSent: 0, turnsInStage: 3 },
      }),
    );
    expect(done.milestone?.key).toBe('links');
    expect(done.nudge).toBe('start_analysis');
    expect(done.phrases).toEqual(PHRASES['wait:-']);
  });

  it('клиент не знает или не даст дату — больше не просим', () => {
    const plan = buildPlan(
      input({
        analysis: analysis({
          answerPoints: [point('answer', 'client', 'не помню дату рождения')],
        }),
        memory: memory({
          card: {
            ...relationships,
            category: { value: 'relationships.couple', confidence: 0.9 },
            birthDateDeclined: { value: 'unknown', confidence: 0.9 },
          },
          said: [
            ...asked,
            said('nudge', 'ask_birth_date', 4, 20),
            said('nudge', 'clarify_request', 4, 20),
          ],
        }),
        state: { remindersSent: 0, turnsInStage: 2 },
      }),
    );
    expect(plan.milestone?.key).toBe('links');
    expect(plan.nudge).toBe('start_analysis');

    // Отказался сразу, сферы нет — спрашиваем только сферу.
    const sphereOnly = buildPlan(
      input({
        analysis: analysis({
          answerPoints: [point('answer', 'client', 'дату не скажу')],
        }),
        memory: memory({
          card: { birthDateDeclined: { value: 'refused', confidence: 0.9 } },
          said: asked,
        }),
        state: { remindersSent: 0, turnsInStage: 1 },
      }),
    );
    expect(sphereOnly.nudge).toBe('ask_sphere');
  });

  it('«ок, сейчас пришлю» — не переспрашиваем, ждём данных', () => {
    const plan = buildPlan(
      input({
        analysis: analysis({
          intents: ['silent_ack'],
          answerPoints: [point('ack', 'other', 'сейчас пришлю')],
        }),
        memory: memory({ said: asked }),
        state: { remindersSent: 0, turnsInStage: 1 },
      }),
    );
    expect(plan.nudge).toBeNull();
    expect(plan.milestone).toBeNull();
    expect(needsWriter(plan)).toBe(false);
  });

  it('«отношения» без подкатегории — уточняющий вопрос из библиотеки, ссылки после ответа', () => {
    const plan = buildPlan(
      input({
        analysis: analysis({
          answerPoints: [
            point('data', 'client', 'прислал дату, место и сферу'),
          ],
        }),
        memory: memory({
          card: { ...withBirth, ...relationships },
          said: asked,
        }),
        state: { remindersSent: 0, turnsInStage: 1 },
      }),
    );
    expect(plan.milestone).toBeNull();
    expect(plan.nudge).toBe('clarify_request');
    expect(plan.phrases).toEqual(PHRASES['ask_request:relationships']);
    expect(plan.constraints.maxParts).toBe(1);
    // Образцы — тон, но смысл уточняющего вопроса держим: по ответу выбирается диагностика.
    expect(plan.goal).toContain(
      'Уточняющий вопрос из образца сохрани по смыслу',
    );

    // «Нет» — анализатор назвал подкатегорию; дальше ссылки.
    const single = {
      ...withBirth,
      ...relationships,
      category: { value: 'relationships.single', confidence: 0.9 },
    };
    const answered = buildPlan(
      input({
        analysis: analysis({
          answerPoints: [point('answer', 'client', 'нет')],
        }),
        memory: memory({
          card: single,
          said: [...asked, said('nudge', 'clarify_request', 4, 10)],
        }),
        state: { remindersSent: 0, turnsInStage: 2 },
      }),
    );
    expect(answered.milestone?.key).toBe('links');
    expect(answered.nudge).toBe('start_analysis');
    expect(answered.phrases).toEqual(PHRASES['wait:-']);
    expect(answered.answer).toEqual([]);
    // Диагностика — по подкатегории из ответа.
    const diagnostic = buildPlan(
      scheduled('diagnostic', {
        stage: 'links',
        memory: memory({
          card: single,
          said: [said('milestone', 'links', 6, 60)],
        }),
      }),
    );
    expect(diagnostic.milestone?.title).toBe(
      'diagnostic relationships.single any',
    );
  });

  it('на уточнение ответил не по делу — второй раз не спрашиваем: ссылки, диагностика по сфере', () => {
    const plan = buildPlan(
      input({
        memory: memory({
          card: { ...withBirth, ...relationships },
          said: [...asked, said('nudge', 'clarify_request', 4, 10)],
        }),
        state: { remindersSent: 0, turnsInStage: 2 },
      }),
    );
    expect(plan.milestone?.key).toBe('links');
    expect(plan.nudge).toBe('start_analysis');
  });

  it('подкатегория ясна из рассказа или у сферы нет уточнения — не спрашиваем', () => {
    const triangle = {
      ...withBirth,
      ...relationships,
      category: { value: 'relationships.triangle', confidence: 0.9 },
    };
    for (const card of [triangle, { ...withBirth, ...money }]) {
      const plan = buildPlan(
        input({
          memory: memory({ card, said: asked }),
          state: { remindersSent: 0, turnsInStage: 1 },
        }),
      );
      expect(plan.milestone?.key).toBe('links');
      expect(plan.nudge).toBe('start_analysis');
    }
  });

  it('всё пришло в первом сообщении, сфера «семья» — первым ответом приветствие и уточнение', () => {
    const plan = buildPlan(
      input({
        memory: memory({
          card: { ...withBirth, sphere: { value: 'family', confidence: 0.95 } },
        }),
      }),
    );
    expect(plan.milestone).toBeNull();
    expect(plan.nudge).toBe('clarify_request');
    expect(plan.phrases).toEqual(PHRASES['ask_request:family']);
    expect(plan.goal).toContain('начни с приветствия');
  });

  it('«хочу расклад по отношениям» без данных — просьба о дате и месте вместе с уточнением, одним сообщением', () => {
    const plan = buildPlan(
      input({
        analysis: analysis({
          answerPoints: [
            point('request', 'diagnostic', 'хочет расклад по отношениям'),
          ],
        }),
        memory: memory({ card: relationships }),
      }),
    );
    expect(plan.nudge).toBe('ask_birth_data');
    expect(plan.coveredNudges).toEqual(['clarify_request']);
    expect(plan.phrases).toEqual([
      'Здравствуйте. Пришлите дату и место рождения. Вы сейчас состоите в отношениях?',
    ]);
    expect(plan.goal).toContain(
      'попроси прислать дату рождения и место рождения и задай уточняющий вопрос',
    );
    expect(plan.constraints.maxParts).toBe(1);

    // Прислал дату и место — уточнение уже было: ссылки.
    const next = buildPlan(
      input({
        analysis: analysis({
          answerPoints: [point('data', 'client', 'прислал дату и место')],
        }),
        memory: memory({
          card: { ...withBirth, ...relationships },
          said: [...asked, said('nudge', 'clarify_request', 2, 30)],
        }),
        state: { remindersSent: 0, turnsInStage: 1 },
      }),
    );
    expect(next.milestone?.key).toBe('links');
  });

  it('данные просили, а клиент только спрашивает — ответ и ещё раз просьба о дате и о том, что беспокоит', () => {
    const plan = buildPlan(
      input({
        analysis: analysis({ intents: ['asks_about_practitioner'] }),
        memory: memory({ said: asked }),
        state: { remindersSent: 0, turnsInStage: 1 },
      }),
    );
    expect(plan.milestone).toBeNull();
    expect(plan.nudge).toBe('ask_birth_date');
    // Сферу повторно спрашиваем открыто (решение владельца 01.10.2026).
    expect(plan.goal).toContain(
      'ещё раз попроси прислать дату рождения и коротко рассказать, что сейчас беспокоит и на какую сферу нужен расклад',
    );
    expect(plan.answer).toHaveLength(1);
    expect(plan.constraints.maxParts).toBe(1);
  });

  it('ранний вопрос о цене — «к стоимости вернусь позже»: фраза «стоимость обсуждаемая» из таблиц — для этапа после диагностики', () => {
    const plan = buildPlan(
      input({
        analysis: analysis({
          intents: ['asks_price'],
          answerPoints: [
            point('question', 'price', 'спросила, сколько стоит работа'),
          ],
        }),
      }),
    );
    expect(plan.answer[0]?.hold).toContain('вернёшься чуть позже');
    expect(plan.answer[0]?.hold).not.toContain('Стоимость');
    expect(plan.constraints.doNotMention[0]).toContain('можно');
  });
});

describe('план: решения по реальной переписке (01.10.2026)', () => {
  it('клиенту младше 21 — вежливый отказ одним сообщением, после него чат закрывается', () => {
    const plan = buildPlan(
      input({
        analysis: analysis({ answerPoints: [point('data', 'client', 'дата')] }),
        memory: memory({
          card: { birthDate: { value: '07.12.2008', confidence: 1 } },
          said: asked,
        }),
      }),
    );
    expect(plan.nudge).toBe('age_refusal');
    expect(plan.close).toBe('underage');
    expect(plan.milestone).toBeNull();
    expect(plan.constraints.maxQuestions).toBe(0);
    expect(plan.phrases).toEqual([
      'К сожалению, я работаю только с 21 года 🙏',
    ]);
    expect(fallbackStepPhrase(plan)).toBe(
      'К сожалению, я работаю только с 21 года 🙏',
    );
    // Взрослому — как обычно; по одному году — только если младше при любом дне рождения.
    const adult = buildPlan(
      input({
        memory: memory({
          card: { birthDate: { value: '07.12.1990', confidence: 1 } },
          said: asked,
        }),
      }),
    );
    expect(adult.close).toBeNull();
    const borderline = buildPlan(
      input({
        memory: memory({
          card: { birthYear: { value: '2005', confidence: 1 } },
          said: asked,
        }),
      }),
    );
    expect(borderline.close).toBeNull();
  });

  it('день и месяц без года — дата не получена: просим год', () => {
    const plan = buildPlan(
      input({
        analysis: analysis({
          answerPoints: [point('data', 'client', 'прислала день и месяц')],
        }),
        memory: memory({
          card: { birthDate: { value: '12.03', confidence: 1 }, ...money },
          said: asked,
        }),
        state: { remindersSent: 0, turnsInStage: 1 },
      }),
    );
    expect(plan.milestone).toBeNull();
    expect(plan.nudge).toBe('ask_birth_date');
    expect(plan.goal).toContain('ещё раз попроси прислать год рождения');
  });

  it('нет сферы — открытый вопрос о том, что беспокоит, без списка сфер', () => {
    const plan = buildPlan(
      input({
        analysis: analysis({
          answerPoints: [point('data', 'client', 'прислал дату')],
        }),
        memory: memory({ card: withBirth, said: asked }),
        state: { remindersSent: 0, turnsInStage: 1 },
      }),
    );
    expect(plan.nudge).toBe('ask_sphere');
    expect(plan.goal).toContain('что его сейчас больше всего беспокоит');
    expect(plan.goal).toContain('список сфер не перечисляй');
  });
});

describe('план: клиент молчит на знакомстве', () => {
  it('напоминание о данных — по фразе из таблиц, считается напоминанием, один раз', () => {
    const plan = buildPlan(
      scheduled('birth_data_reminder', { memory: memory({ said: asked }) }),
    );
    expect(plan.nudge).toBe('birth_data_reminder');
    expect(plan.phrases).toEqual(PHRASES['no_birth_data:-']);
    expect(plan.reminders).toBe(1);
    // Напоминание повторяет просьбу по своей сути — это не «повтор».
    expect(plan.constraints.doNotRepeat).toEqual([]);
    expect(plan.goal).toContain('Ход по расписанию');
    const again = buildPlan(
      scheduled('birth_data_reminder', {
        memory: memory({
          said: [...asked, said('nudge', 'birth_data_reminder', 4, 10)],
        }),
      }),
    );
    expect(again.idle).not.toBeNull();
  });

  it('молчит и после напоминания — общая диагностика; «не увидел запроса» — первым абзацем фразы', () => {
    const silent = memory({
      said: [...asked, said('nudge', 'birth_data_reminder', 4, 90)],
    });
    const plan = buildPlan(scheduled('diagnostic', { memory: silent }));
    expect(plan.milestone?.key).toBe('diagnostic');
    expect(plan.milestone?.title).toBe('diagnostic universal any');
    expect(plan.nudge).toBe('general_analysis');
    expect(plan.phrases).toEqual([
      'Не увидел вашего запроса и сделал вам общий анализ, результаты ниже❤️',
    ]);
  });

  it('дата есть, молчит после вопроса о том, что беспокоит, — без напоминания: старое задание закрывается, уходит диагностика', () => {
    // Как в реальной переписке (решение владельца 01.10.2026): человек через
    // час делает анализ по тому, что известно, а не напоминает.
    const sphereAsked = [
      ...asked,
      said('nudge', 'birth_data_reminder', 4, 200),
      said('nudge', 'ask_sphere', 6, 100),
    ];
    const plan = buildPlan(
      scheduled('birth_data_reminder', {
        memory: memory({ card: withBirth, said: sphereAsked }),
        state: { remindersSent: 1, turnsInStage: 2 },
      }),
    );
    expect(plan.nudge).toBeNull();
    expect(plan.idle).not.toBeNull();
    expect(plan.reminders).toBe(0);
    const diagnostic = buildPlan(
      scheduled('diagnostic', {
        memory: memory({ card: withBirth, said: sphereAsked }),
      }),
    );
    expect(diagnostic.milestone?.title).toBe('diagnostic universal any');
    expect(diagnostic.nudge).toBe('general_analysis');
  });

  it('нет даты и молчит после уточнения — напоминание тем же уточняющим вопросом', () => {
    const card = { ...relationships };
    const clarified = [...asked, said('nudge', 'clarify_request', 4, 100)];
    const plan = buildPlan(
      scheduled('birth_data_reminder', {
        memory: memory({ card, said: clarified }),
      }),
    );
    expect(plan.nudge).toBe('clarify_reminder');
    expect(plan.phrases).toEqual(PHRASES['ask_request:relationships']);
    expect(plan.reminders).toBe(1);
  });

  it('«Отношения» без даты и молчит — напоминание о дате (без места), потом диагностика по сфере', () => {
    const card = { ...relationships };
    const second = [
      ...asked,
      said('nudge', 'ask_birth_date', 4, 100),
      said('nudge', 'clarify_request', 4, 100),
    ];
    const plan = buildPlan(
      scheduled('birth_data_reminder', {
        memory: memory({ card, said: second }),
      }),
    );
    expect(plan.nudge).toBe('birth_data_reminder');
    expect(plan.goal).toContain('нужно знать дату рождения');
    expect(plan.goal).toContain('анализ по тому, что есть');
    expect(plan.goal).not.toContain('место рождения');
    expect(plan.constraints.doNotRepeat).toEqual([
      'уточняющий вопрос о запросе',
    ]);

    const diagnostic = buildPlan(
      scheduled('diagnostic', {
        memory: memory({
          card,
          said: [...second, said('nudge', 'birth_data_reminder', 6, 60)],
        }),
      }),
    );
    expect(diagnostic.milestone?.title).toBe(
      'diagnostic relationships.couple any',
    );
    expect(diagnostic.nudge).toBeNull();
  });

  it('дата есть, молчит после уточнения — без напоминания, диагностика по сфере', () => {
    const card = { ...withBirth, ...relationships };
    const clarified = [...asked, said('nudge', 'clarify_request', 4, 100)];
    const plan = buildPlan(
      scheduled('birth_data_reminder', {
        memory: memory({ card, said: clarified }),
      }),
    );
    expect(plan.idle).not.toBeNull();
    const diagnostic = buildPlan(
      scheduled('diagnostic', { memory: memory({ card, said: clarified }) }),
    );
    expect(diagnostic.milestone?.title).toBe(
      'diagnostic relationships.couple any',
    );
    expect(diagnostic.nudge).toBeNull();
  });
});

describe('план: ожидание диагностики', () => {
  const links = [said('milestone', 'links', 5, 50)];
  const waiting = (patch: Partial<PlanInput> = {}) =>
    input({
      stage: 'links',
      memory: memory({ card: withBirth, said: links }),
      ...patch,
    });

  it('решает тема пункта, а не слова в нём: «сколько ждать диагностику» — не цена', () => {
    const plan = buildPlan(
      waiting({
        memory: memory({
          card: withBirth,
          said: [said('milestone', 'links', 5, 10)],
        }),
        analysis: analysis({
          intents: ['asks_price', 'asks_diagnostic_status'],
          answerPoints: [
            point('question', 'price', 'спросила, сколько стоит работа'),
            point('question', 'diagnostic', 'спросила, сколько ждать'),
            asksWhereYouLive,
          ],
        }),
      }),
    );
    expect(plan.milestone).toBeNull();
    expect(plan.answer[0]?.hold).toContain('к стоимости');
    expect(plan.answer[1]?.hold).toContain('пришлёшь');
    expect(plan.answer[2]?.hold).toBeNull();
  });

  it('«ок», присланные данные, короткий ответ во время ожидания — агент молчит', () => {
    const plan = buildPlan(
      waiting({
        analysis: analysis({
          intents: ['silent_ack'],
          answerPoints: [
            point('ack', 'other', 'ок, жду'),
            point('data', 'client', 'прислал место рождения'),
            point('answer', 'client', 'всё сразу'),
          ],
        }),
      }),
    );
    expect(needsWriter(plan)).toBe(false);
    expect(plan.idle).toBeNull();
    expect(plan.goal).toContain('Промолчать');
  });

  it('рассказ во время ожидания — короткая реакция, раз шага нет', () => {
    const plan = buildPlan(
      waiting({
        analysis: analysis({
          answerPoints: [point('story', 'client', 'ещё и с мужем проблемы')],
        }),
      }),
    );
    expect(plan.answer).toHaveLength(1);
    expect(plan.nudge).toBeNull();
  });

  it('«ну что там?» после минимума — диагностика в этом же ходе, без сопровождения', () => {
    const plan = buildPlan(
      waiting({
        analysis: analysis({
          intents: ['asks_diagnostic_status'],
          answerPoints: [point('question', 'diagnostic', 'ну что там?')],
        }),
      }),
    );
    expect(plan.milestone?.key).toBe('diagnostic');
    expect(plan.answer).toEqual([]);
    expect(needsWriter(plan)).toBe(false);
  });

  it('«ну что там?» слишком рано — ждём и отвечаем, что пришлёшь', () => {
    const plan = buildPlan(
      waiting({
        analysis: analysis({
          intents: ['asks_diagnostic_status'],
          answerPoints: [point('question', 'diagnostic', 'ну что там?')],
        }),
        memory: memory({
          card: withBirth,
          said: [said('milestone', 'links', 5, 10)],
        }),
      }),
    );
    expect(plan.milestone).toBeNull();
    expect(plan.answer[0]?.hold).toContain('пришлёшь');
  });

  it('диагностика по таймеру: по сфере «финансы» — финансовая, уходит одна, без своего вопроса после неё', () => {
    // Диагностика сама кончается вопросом или приглашением — второй вопрос
    // следом не нужен (решение владельца 01.10.2026).
    const plan = buildPlan(
      scheduled('diagnostic', {
        stage: 'links',
        memory: memory({ card: { ...withBirth, ...money }, said: links }),
      }),
    );
    expect(plan.milestone?.title).toBe('diagnostic money.instability any');
    expect(plan.nudge).toBeNull();
    expect(needsWriter(plan)).toBe(false);
  });

  it('нет диагностики на языке клиента — менеджер', () => {
    const plan = buildPlan(
      scheduled('diagnostic', {
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

describe('план: после диагностики', () => {
  const diagnosticSaid = [
    said('milestone', 'links', 5, 200),
    said('milestone', 'diagnostic', 9, 100),
  ];
  // Отметки «прочитано» нет, но клиент ответил — значит, видел.
  const replied = [out(9, 100, false), incoming(10, 1)];
  const reacting = (patch: Partial<Analysis>, extra: Partial<PlanInput> = {}) =>
    buildPlan(
      input({
        stage: 'diagnostic',
        analysis: analysis(patch),
        memory: memory({ said: diagnosticSaid }),
        history: replied,
        ...extra,
      }),
    );

  it('«Расскажите» — варианты сразу, даже без отметки «прочитано»; веха и есть ответ', () => {
    const plan = reacting({
      intents: ['asks_practice'],
      answerPoints: [point('request', 'practice', 'расскажите')],
    });
    expect(plan.milestone?.key).toBe('offer');
    expect(plan.answer).toEqual([]);
    expect(needsWriter(plan)).toBe(false);
  });

  it.each([
    ['«да, есть желание»', point('answer', 'client', 'да, есть желание')],
    ['«спасибо»', point('ack', 'other', 'спасибо')],
    ['«хочу всё изменить»', point('story', 'client', 'хочет изменить всё')],
  ])('отклик без вопроса и возражения: %s — варианты', (_name, reply) => {
    expect(reacting({ answerPoints: [reply] }).milestone?.key).toBe('offer');
  });

  it('вопрос или сомнение — ответ и предложить рассказать о вариантах, но не больше двух раз за этап', () => {
    const doubt = {
      intents: ['doubts' as const],
      answerPoints: [point('question', 'practice', 'а это правда работает?')],
    };
    const first = reacting(doubt);
    expect(first.milestone).toBeNull();
    expect(first.answer).toHaveLength(1);
    // О практиках до вариантов — только общо.
    expect(first.answer[0]?.hold).toContain('без подробностей');
    expect(first.nudge).toBe('ask_want_options');
    expect(first.constraints.maxParts).toBe(1);
    const askedOnce = [
      ...diagnosticSaid,
      said('nudge', 'ask_want_options', 11, 20),
    ];
    expect(reacting(doubt, { memory: memory({ said: askedOnce }) }).nudge).toBe(
      'ask_want_options',
    );
    const twice = reacting(doubt, {
      memory: memory({
        said: [...askedOnce, said('nudge', 'ask_want_options', 13, 10)],
      }),
    });
    expect(twice.nudge).toBeNull();
    expect(twice.answer).toHaveLength(1);
  });

  it('вопрос о цене после диагностики — варианты и перед ними «стоимость обсуждаемая» из таблиц', () => {
    const plan = reacting({
      intents: ['asks_price'],
      answerPoints: [point('question', 'price', 'спросила, сколько стоит')],
    });
    expect(plan.milestone?.key).toBe('offer');
    expect(plan.answer[0]?.hold).toContain('Стоимость — вопрос обсуждаемый.');
  });

  it('«не знаю, мне надо изучить» — уточняющий вопрос, что заставляет задуматься, без шага; фразы плейбука вариантов сюда не попадают', () => {
    const plan = reacting(
      {
        intents: ['objects'],
        objection: 'think_about_it',
        answerPoints: [
          point('objection', 'practice', 'не знаю, мне надо изучить'),
        ],
      },
      {
        memory: memory({
          said: [...diagnosticSaid, said('nudge', 'ask_want_options', 9, 100)],
        }),
      },
    );
    expect(plan.milestone).toBeNull();
    // Как человек в реальной переписке: «Что заставляет вас задуматься?».
    expect(plan.objection).toMatchObject({
      category: 'think_about_it',
      approach: 0,
      ends: 'question',
      phrases: [],
    });
    expect(plan.objection?.task).toContain('что заставляет задуматься');
    // Возражение закрывает его отработка — отдельным пунктом оно не идёт.
    expect(plan.answer).toEqual([]);
    expect(plan.nudge).toBeNull();
    expect(plan.constraints.maxParts).toBe(1);
    expect(plan.constraints.maxQuestions).toBe(1);
    expect(plan.goal).toContain('«подумаю, надо разобраться»');
    expect(plan.goal).not.toContain('Может, есть вопросы по работе?');
  });

  const notMe = {
    intents: ['objects' as const],
    objection: 'not_resonate',
    answerPoints: [point('objection', 'diagnostic', 'вообще не про меня')],
  };
  const clarified = [
    ...diagnosticSaid,
    said('argument', 'not_resonate:0', 11, 20),
    said('nudge', 'clarify_objection', 11, 20),
  ];
  const clarifiedHistory = [
    out(9, 100, true),
    incoming(10, 30),
    out(11, 20, true),
    incoming(12, 1),
  ];

  it('«вообще не про меня» — спокойно принять и уточнить своим вопросом, без шага; образцы — из плейбука диагностики', () => {
    const plan = reacting(notMe);
    expect(plan.milestone).toBeNull();
    expect(plan.objection).toMatchObject({
      category: 'not_resonate',
      approach: 0,
      ends: 'question',
      phrases: PHRASES['diagnostic_objection:not_resonate'],
    });
    expect(plan.nudge).toBeNull();
    expect(plan.constraints.maxParts).toBe(1);
    expect(plan.goal).toContain('не узнаёт себя в диагностике');
    expect(plan.goal).toContain('что именно не совпало');
    expect(plan.goal).toContain('не шаблон');
  });

  it('ответ на уточнение — отклик и снова вопрос о вариантах, а не варианты; «да» — варианты', () => {
    const story = reacting(
      {
        intents: ['shares_story'],
        answerPoints: [
          point('story', 'client', 'на самом деле проблемы с работой'),
        ],
      },
      { memory: memory({ said: clarified }), history: clarifiedHistory },
    );
    expect(story.milestone).toBeNull();
    expect(story.nudge).toBe('ask_want_options');
    // На рассказ — отклик в начале сообщения шага, отдельного ответа нет.
    expect(story.react).toEqual(['на самом деле проблемы с работой']);
    expect(story.answer).toEqual([]);
    expect(story.constraints.maxParts).toBe(1);
    expect(story.constraints.maxQuestions).toBe(1);
    expect(story.goal).toContain('Начни сообщение с короткого отклика');
    const yes = reacting(
      {
        intents: ['asks_practice'],
        answerPoints: [point('answer', 'other', 'да, расскажите')],
      },
      { memory: memory({ said: clarified }), history: clarifiedHistory },
    );
    expect(yes.milestone?.key).toBe('offer');
    // Вопрос о вариантах задан — дальше отклик без возражения снова ведёт к ним.
    const asked = [...clarified, said('nudge', 'ask_want_options', 13, 5)];
    expect(
      reacting(
        { answerPoints: [point('story', 'client', 'хочу всё изменить')] },
        {
          memory: memory({ said: asked }),
          history: [...clarifiedHistory, out(13, 5, true), incoming(14, 1)],
        },
      ).milestone?.key,
    ).toBe('offer');
  });

  it('напоминание об уточнении его не закрывает: ответ после напоминания — снова вопрос о вариантах, а не варианты', () => {
    // Песочница 30.09: уточнение → напоминание по разговору → ответ клиента ушёл в варианты, «ну давайте» — в цены.
    const reminded = [...clarified, said('nudge', 'follow_up', 13, 10)];
    const plan = reacting(
      {
        intents: ['shares_story', 'answers_question'],
        answerPoints: [
          point(
            'story',
            'client',
            'с деньгами нормально, работу найти не могу',
          ),
        ],
      },
      {
        memory: memory({ said: reminded }),
        history: [
          ...clarifiedHistory.slice(0, 3),
          out(13, 10, true),
          incoming(14, 1),
        ],
      },
    );
    expect(plan.milestone).toBeNull();
    expect(plan.nudge).toBe('ask_want_options');
    expect(plan.react).toEqual(['с деньгами нормально, работу найти не могу']);
  });

  it('«Расскажите про себя» — не согласие на варианты: ответ и вопрос, рассказать ли, как проработать', () => {
    const plan = reacting({
      intents: ['asks_about_practitioner'],
      answerPoints: [
        point('request', 'practitioner', 'просит рассказать о себе'),
      ],
    });
    expect(plan.milestone).toBeNull();
    expect(plan.answer.map((item) => item.text)).toEqual([
      'просит рассказать о себе',
    ]);
    expect(plan.nudge).toBe('ask_want_options');
    expect(plan.constraints.maxQuestions).toBe(1);
  });

  it('отзыв или рассказ без вопроса о другом — варианты и перед ними одна фраза-отклик', () => {
    // Решение владельца 01.10.2026: как человек («Благодарю за обратную связь 🩷» + варианты).
    const plan = reacting({
      intents: ['shares_story'],
      answerPoints: [point('story', 'client', 'хочет изменить всё')],
    });
    expect(plan.milestone?.key).toBe('offer');
    expect(plan.nudge).toBe('offer_intro');
    expect(plan.react).toEqual(['хочет изменить всё']);
    expect(plan.constraints.maxQuestions).toBe(0);
    expect(plan.goal).toContain('поблагодари за обратную связь');
    const feedback = reacting({
      answerPoints: [
        point('feedback', 'diagnostic', 'всё совпало, очень точно'),
      ],
    });
    expect(feedback.milestone?.key).toBe('offer');
    expect(feedback.nudge).toBe('offer_intro');
    expect(feedback.react).toEqual(['всё совпало, очень точно']);
    // «Да» или «расскажите» — варианты без обрамления.
    const yes = reacting({
      answerPoints: [point('answer', 'client', 'да')],
    });
    expect(yes.milestone?.key).toBe('offer');
    expect(yes.nudge).toBeNull();
    expect(needsWriter(yes)).toBe(false);
  });

  it('горе после диагностики — слова поддержки без вариантов и без вопроса о них', () => {
    const plan = reacting({
      intents: ['shares_story'],
      mood: 'grieving',
      answerPoints: [point('story', 'client', 'потеряла сына')],
    });
    expect(plan.milestone).toBeNull();
    expect(plan.nudge).toBeNull();
    expect(plan.answer.map((item) => item.text)).toEqual(['потеряла сына']);
    expect(plan.condolences).toBe(true);
    expect(plan.goal).toContain('Примите мои соболезнования');
    // Сама попросит рассказать — варианты.
    const asks = reacting({
      intents: ['shares_story', 'asks_practice'],
      mood: 'grieving',
      answerPoints: [
        point('request', 'practice', 'расскажите, как помочь себе'),
      ],
    });
    expect(asks.milestone?.key).toBe('offer');
  });

  it('вопрос, на который разбор не отвечает («жив ли он?»), — ответ и вопрос о вариантах, а не варианты', () => {
    const plan = reacting({
      intents: ['shares_story'],
      answerPoints: [
        point('story', 'client', 'бывший муж пропал без вести'),
        point('question', 'other', 'хочет знать, жив ли он'),
      ],
    });
    expect(plan.milestone).toBeNull();
    expect(plan.answer.map((item) => item.text)).toContain(
      'хочет знать, жив ли он',
    );
    expect(plan.nudge).toBe('ask_want_options');
  });

  it('«нет денег» после диагностики — рассказать, а решать клиенту: отработка и вопрос о вариантах одним сообщением', () => {
    const plan = reacting({
      intents: ['objects'],
      objection: 'expensive',
      answerPoints: [point('objection', 'price', 'с финансами плохо')],
    });
    expect(plan.milestone).toBeNull();
    expect(plan.objection?.ends).toBe('step');
    expect(plan.objection?.task).toContain('решать — ему');
    expect(plan.nudge).toBe('ask_want_options');
    expect(plan.constraints.maxParts).toBe(1);
  });

  it.each([
    ['self_help', 'как у него с этим получается'],
    ['no_need', 'что повлияло на решение'],
  ])(
    '«%s» после диагностики — один мягкий уточняющий вопрос',
    (category, task) => {
      const plan = reacting({
        intents: ['objects'],
        objection: category,
        answerPoints: [point('objection', 'other', 'возражение')],
      });
      expect(plan.objection?.ends).toBe('question');
      expect(plan.objection?.task).toContain(task);
      expect(plan.nudge).toBeNull();
    },
  );

  it('«не интересно, сама прорабатываю» — отработка по её словам: сказанное не переспрашивать', () => {
    // Песочница 01.10: на «сама прорабатываю» агент спросил «вы работаете с этим сами или с кем-то?».
    const plan = reacting({
      intents: ['objects'],
      objection: 'self_help',
      answerPoints: [
        point(
          'objection',
          'other',
          'не интересно, сама прорабатывает проблемы',
        ),
      ],
    });
    expect(plan.objection?.task).not.toContain('с кем-то');
    expect(plan.goal).toContain('Что он уже сказал');
    expect(plan.goal).toContain('не переспрашивай');
    expect(plan.goal).not.toContain('отвечает на твой уточняющий вопрос');
  });

  it('ответ на уточнение («сама, пока не очень получается») — отклик на ответ, вопрос о вариантах продолжает его', () => {
    const selfHelpAsked = [
      ...diagnosticSaid,
      said('argument', 'self_help:0', 11, 20),
      said('nudge', 'clarify_objection', 11, 20),
    ];
    const history: HistoryMessage[] = [
      out(9, 100, true),
      { ...incoming(10, 30), text: 'Мне не интересно, я сама прорабатываю' },
      {
        ...out(11, 20, true),
        text: 'Понимаю) А как у вас с этим получается, что уже удалось изменить?',
      },
      { ...incoming(12, 1), text: 'Сама, пока не очень получается' },
    ];
    const plan = reacting(
      {
        intents: ['answers_question', 'shares_story'],
        answerPoints: [
          point('story', 'client', 'работает сама, пока не очень получается'),
        ],
      },
      { memory: memory({ said: selfHelpAsked }), history },
    );
    expect(plan.objection).toBeNull();
    expect(plan.milestone).toBeNull();
    expect(plan.nudge).toBe('ask_want_options');
    expect(plan.react).toEqual(['работает сама, пока не очень получается']);
    expect(plan.goal).toContain(
      'Клиент отвечает на твой уточняющий вопрос по его возражению (конец твоего сообщения: «Понимаю) А как у вас с этим получается, что уже удалось изменить?»)',
    );
    expect(plan.goal).toContain('Клиент ответил: работает сама');
    expect(plan.goal).toContain('Вопрос шага задай как продолжение его ответа');
    expect(plan.constraints.maxQuestions).toBe(1);
    // Снова отказывается — это новое возражение: его отработка, без «это ответ».
    const holds = reacting(
      {
        intents: ['objects'],
        objection: 'self_help',
        answerPoints: [point('objection', 'other', 'сама справлюсь, не нужно')],
      },
      { memory: memory({ said: selfHelpAsked }), history },
    );
    expect(holds.objection).toMatchObject({ approach: 1, ends: 'step' });
    expect(holds.goal).not.toContain('Это ответ, а не новое возражение');
  });

  it('«расскажите, хотя сомневаюсь» — варианты, отработка без своего вопроса: веха и есть ответ', () => {
    const plan = reacting({
      intents: ['asks_practice', 'doubts'],
      objection: 'dont_believe',
      answerPoints: [
        point('objection', 'practice', 'расскажите, хотя сомневаюсь'),
      ],
    });
    expect(plan.milestone?.key).toBe('offer');
    expect(plan.objection?.ends).toBe('open');
    expect(plan.constraints.maxQuestions).toBe(0);
    expect(plan.goal).not.toContain('шаг воронки отдельным сообщением');
  });

  it('уточнение по возражению — отметка, а не шаг: в «не повторять» его нет', () => {
    const plan = reacting(notMe, { memory: memory({ said: clarified }) });
    expect(plan.constraints.doNotRepeat).not.toContain(
      'уточняющий вопрос по возражению',
    );
    expect(plan.constraints.doNotRepeat).toContain(
      'твоя прошлая отработка возражения «не про меня, не откликается, не подходит»',
    );
  });

  it('снова «не про меня» — второй подход и вопрос о вариантах; после двух возражений на этапе — не уговаривать', () => {
    const second = reacting(notMe, { memory: memory({ said: clarified }) });
    expect(second.objection).toMatchObject({ approach: 1, ends: 'step' });
    expect(second.nudge).toBe('ask_want_options');
    expect(second.goal).toContain('не так, как в прошлый');
    expect(second.goal).not.toContain('Такой шаг уже был');
    // Вопрос о вариантах уже задавали — второй раз другими словами.
    const repeatedStep = reacting(notMe, {
      memory: memory({
        said: [...clarified, said('nudge', 'ask_want_options', 9, 100)],
      }),
    });
    expect(repeatedStep.goal).toContain('Такой шаг уже был');
    const third = reacting(notMe, {
      memory: memory({
        said: [
          ...clarified,
          said('argument', 'not_resonate:1', 13, 5),
          said('nudge', 'ask_want_options', 13, 5),
        ],
      }),
    });
    expect(third.objection).toMatchObject({ ends: 'release', phrases: [] });
    expect(third.objection?.task).toContain('не первый раз');
    expect(third.nudge).toBeNull();
    expect(third.constraints.maxQuestions).toBe(0);
  });

  it('подходы категории кончились — не повторять прошлый, а отпустить', () => {
    const plan = reacting(
      {
        intents: ['objects'],
        objection: 'tried_before',
        answerPoints: [
          point('objection', 'other', 'уже пробовала, не помогло'),
        ],
      },
      {
        memory: memory({
          said: [...diagnosticSaid, said('argument', 'tried_before:0', 11, 20)],
        }),
      },
    );
    expect(plan.objection).toMatchObject({ approach: 1, ends: 'release' });
  });

  it('пауза после возражения («посоветуюсь с мужем» → «я на связи»): «ок, спасибо» — не согласие на варианты, агент молчит', () => {
    const paused = [
      ...diagnosticSaid,
      said('argument', 'ask_partner:0', 11, 20),
      said('nudge', 'pause_objection', 11, 20),
    ];
    const history = [
      out(9, 100, true),
      incoming(10, 30),
      out(11, 20, true),
      incoming(12, 1),
    ];
    const ok = reacting(
      { answerPoints: [point('ack', 'other', 'ок, спасибо')] },
      { memory: memory({ said: paused }), history },
    );
    expect(ok.milestone).toBeNull();
    expect(ok.nudge).toBeNull();
    expect(needsWriter(ok)).toBe(false);
    // Сам попросил — варианты.
    expect(
      reacting(
        {
          intents: ['asks_practice'],
          answerPoints: [point('request', 'practice', 'расскажите всё-таки')],
        },
        { memory: memory({ said: paused }), history },
      ).milestone?.key,
    ).toBe('offer');
  });

  it('молчит — напоминание по образцам из таблиц; следующее — первым другой вариант', () => {
    const first = buildPlan(
      scheduled('return_question', {
        stage: 'diagnostic',
        memory: memory({ said: diagnosticSaid }),
        history: [out(9, 100, true)],
      }),
    );
    expect(first.nudge).toBe('ask_feedback');
    expect(first.phrases).toEqual([
      'Что бы вы хотели изменить?',
      'Жду обратную связь по раскладу)',
    ]);
    expect(first.reminders).toBe(1);
    const second = buildPlan(
      scheduled('return_question', {
        stage: 'diagnostic',
        memory: memory({
          said: [...diagnosticSaid, said('nudge', 'ask_feedback', 11, 60)],
        }),
        history: [out(9, 100, true), out(11, 60, true)],
      }),
    );
    expect(second.phrases).toEqual([
      'Жду обратную связь по раскладу)',
      'Что бы вы хотели изменить?',
    ]);
  });

  it('клиент отвечал после диагностики и замолчал — напоминание по разговору, а не «жду обратную связь»', () => {
    const plan = buildPlan(
      scheduled('return_question', {
        stage: 'diagnostic',
        memory: memory({ said: clarified }),
        history: clarifiedHistory.slice(0, 3),
      }),
    );
    expect(plan.nudge).toBe('follow_up');
    expect(plan.phrases).toEqual([]);
    expect(plan.reminders).toBe(1);
    expect(plan.goal).toContain('последний вопрос');
    // Проверяющий историю не видит — конец нашего последнего сообщения идёт в план.
    expect(plan.goal).toContain(
      'Твоё последнее сообщение клиенту (конец): «…»',
    );
    // Напоминание по сути возвращается к уточнению — это не «повтор».
    expect(plan.constraints.doNotRepeat).not.toContain(
      'уточняющий вопрос по возражению',
    );
  });

  it('клиент молчит после диагностики — варианты по таймеру со связкой «жду обратную связь», это напоминание', () => {
    // Решение владельца 01.10.2026: как в реальной переписке, через сутки молчания.
    const plan = buildPlan(
      scheduled('offer', {
        stage: 'diagnostic',
        memory: memory({
          said: [...diagnosticSaid, said('nudge', 'ask_feedback', 11, 600)],
        }),
        history: [out(9, 1400, true), out(11, 600, true)],
        state: { remindersSent: 1, turnsInStage: 0 },
      }),
    );
    expect(plan.milestone?.key).toBe('offer');
    expect(plan.nudge).toBe('offer_after_silence');
    expect(plan.phrases).toEqual(['Жду обратную связь по раскладу)']);
    expect(plan.reminders).toBe(1);
    expect(plan.constraints.maxQuestions).toBe(0);
    expect(plan.goal).toContain('Ход по расписанию');
    expect(fallbackStepPhrase(plan)).toBe('Жду обратную связь по раскладу)');
  });

  it('варианты по таймеру не уходят, если клиент отвечал после диагностики или лимит напоминаний вышел', () => {
    const answered = buildPlan(
      scheduled('offer', {
        stage: 'diagnostic',
        memory: memory({ said: diagnosticSaid }),
        history: [out(9, 1400, true), incoming(10, 1000)],
      }),
    );
    expect(answered.milestone).toBeNull();
    expect(answered.idle).toContain('offer');
    const limit = buildPlan(
      scheduled('offer', {
        stage: 'diagnostic',
        memory: memory({ said: diagnosticSaid }),
        history: [out(9, 1400, true)],
        state: { remindersSent: 3, turnsInStage: 0 },
      }),
    );
    expect(limit.milestone).toBeNull();
  });
});

describe('план: после вариантов', () => {
  const offerSaid = [
    said('milestone', 'links', 5, 300),
    said('milestone', 'diagnostic', 9, 200),
    said('milestone', 'offer', 12, 30),
  ];
  const replied = [out(12, 30, false), incoming(13, 1)];
  const reacting = (patch: Partial<Analysis>, extra: Partial<PlanInput> = {}) =>
    buildPlan(
      input({
        stage: 'offer',
        analysis: analysis(patch),
        memory: memory({ said: offerSaid }),
        history: replied,
        ...extra,
      }),
    );

  it.each([
    [
      '«Все» — выбрал варианты',
      {
        intents: ['chooses_option' as const],
        answerPoints: [point('answer', 'other', 'все')],
      },
    ],
    [
      '«Сколько стоит?»',
      {
        intents: ['asks_price' as const],
        answerPoints: [point('question', 'price', 'сколько стоит')],
      },
    ],
    [
      '«Да, всё понятно»',
      { answerPoints: [point('answer', 'other', 'да, всё понятно')] },
    ],
  ])('%s — цены сразу, без сопровождения', (_name, patch) => {
    const plan = reacting(patch);
    expect(plan.milestone?.key).toBe('prices');
    expect(plan.answer).toEqual([]);
    expect(needsWriter(plan)).toBe(false);
  });

  it('выбрал вариант и спросил о другом — цены и короткий ответ перед ними', () => {
    const plan = reacting({
      intents: ['chooses_option'],
      answerPoints: [
        point('answer', 'other', 'первый'),
        point('question', 'practice', 'сколько длится работа?'),
      ],
    });
    expect(plan.milestone?.key).toBe('prices');
    expect(plan.answer.map((item) => item.text)).toEqual([
      'сколько длится работа?',
    ]);
  });

  it('только вопрос — ответ, без цен и без своих вопросов', () => {
    const plan = reacting({
      answerPoints: [point('question', 'practice', 'сколько длится работа?')],
    });
    expect(plan.milestone).toBeNull();
    expect(plan.nudge).toBeNull();
    expect(plan.answer).toHaveLength(1);
  });

  it('возражение на варианты: подход этапа и образцы плейбука вариантов; при повторе — следующий подход, образцы по кругу', () => {
    const objecting = {
      intents: ['objects' as const],
      objection: 'think_about_it',
      answerPoints: [point('objection', 'other', 'подумаю')],
    };
    const first = reacting(objecting);
    expect(first.milestone).toBeNull();
    expect(first.nudge).toBeNull();
    expect(first.objection).toMatchObject({
      category: 'think_about_it',
      approach: 0,
      ends: 'question',
      phrases: ['Может, есть вопросы по работе?', 'Что смутило?'],
    });
    expect(first.objection?.task).toContain('о чём именно хочется подумать');
    const repeated = reacting(objecting, {
      memory: memory({
        said: [
          ...offerSaid,
          said('argument', 'think_about_it:0', 14, 10),
          said('nudge', 'clarify_objection', 14, 10),
        ],
      }),
    });
    expect(repeated.objection).toMatchObject({
      approach: 1,
      phrases: ['Что смутило?', 'Может, есть вопросы по работе?'],
    });
    expect(repeated.goal).toContain('не так, как в прошлый');
  });

  it('«дорого», «нет денег» до цен — цены и перед ними спокойная фраза: решать клиенту', () => {
    // Как в реальной переписке: человек показывает стоимость, а не откладывает разговор.
    const plan = reacting({
      intents: ['objects'],
      objection: 'expensive',
      answerPoints: [point('objection', 'price', 'финансово не потяну')],
    });
    expect(plan.milestone?.key).toBe('prices');
    expect(plan.objection).toMatchObject({
      category: 'expensive',
      ends: 'open',
    });
    expect(plan.objection?.task).toContain('ниже расскажешь о стоимости');
    expect(plan.nudge).toBeNull();
    expect(plan.constraints.maxQuestions).toBe(0);
  });

  it('«нет времени на практики» — ответ по сути и вопрос по направлениям, а не «вернёмся позже»', () => {
    const plan = reacting({
      intents: ['objects'],
      objection: 'no_time',
      answerPoints: [
        point('objection', 'practice', 'нет времени на медитации'),
      ],
    });
    expect(plan.milestone).toBeNull();
    expect(plan.objection?.ends).toBe('step');
    expect(plan.objection?.task).toContain('основную часть работы делаешь ты');
    expect(plan.nudge).toBe('ask_offer_questions');
    expect(plan.constraints.maxParts).toBe(1);
  });

  it('«ничего не подходит» — уточнить; ответ на уточнение — отклик и вопрос по направлениям, а не цены', () => {
    const first = reacting({
      intents: ['objects'],
      objection: 'not_resonate',
      answerPoints: [point('objection', 'practice', 'ничего не подходит')],
    });
    expect(first.milestone).toBeNull();
    expect(first.objection).toMatchObject({
      category: 'not_resonate',
      ends: 'question',
    });
    expect(first.objection?.task).toContain('что именно не подошло');
    const clarified = [
      ...offerSaid,
      said('argument', 'not_resonate:0', 14, 10),
      said('nudge', 'clarify_objection', 14, 10),
    ];
    const answer = reacting(
      {
        answerPoints: [
          point('answer', 'client', 'хочу разобраться с деньгами'),
        ],
      },
      {
        memory: memory({ said: clarified }),
        history: [
          out(12, 30, true),
          incoming(13, 20),
          out(14, 10, true),
          incoming(15, 1),
        ],
      },
    );
    expect(answer.milestone).toBeNull();
    expect(answer.nudge).toBe('ask_offer_questions');
    // Клиент сказал, что ему на самом деле нужно, — на это откликаются, потом шаг.
    expect(answer.react).toEqual(['хочу разобраться с деньгами']);
    expect(answer.answer).toEqual([]);
    expect(answer.constraints.maxParts).toBe(1);
  });

  it('молчит — напоминание по образцам из таблиц, первым следующий вариант; цены по таймеру не уходят', () => {
    const reminder = buildPlan(
      scheduled('offer_nudge', {
        stage: 'offer',
        memory: memory({
          said: [...offerSaid, said('nudge', 'ask_offer_questions', 13, 10)],
        }),
        history: [out(12, 30, true)],
      }),
    );
    expect(reminder.nudge).toBe('ask_offer_questions');
    expect(reminder.phrases).toEqual([
      'Всё ли понятно или есть вопросы?',
      'Всё ли понятно по направлениям?',
    ]);
    expect(reminder.reminders).toBe(1);
    // Клиент уже отвечал после вариантов — напоминание по разговору.
    expect(
      buildPlan(
        scheduled('offer_nudge', {
          stage: 'offer',
          memory: memory({ said: offerSaid }),
          history: [out(12, 30, true), incoming(13, 20), out(14, 10, true)],
        }),
      ).nudge,
    ).toBe('follow_up');
    expect(
      buildPlan(
        scheduled('prices', {
          stage: 'offer',
          memory: memory({ said: offerSaid }),
          history: [out(12, 30, true)],
        }),
      ).idle,
    ).toContain('prices');
  });

  it('сутки не прочитано — напоминание пишется по диалогу, без фразы из таблиц', () => {
    const plan = buildPlan(
      scheduled('unread_reminder', {
        stage: 'offer',
        memory: memory({ said: offerSaid }),
        history: [out(12, 30, false)],
      }),
    );
    expect(plan.nudge).toBe('unread_reminder');
    expect(plan.phrases).toEqual([]);
    expect(plan.reminders).toBe(1);
    expect(plan.goal).toContain('опираясь на то, о чём шёл разговор');
  });
});
