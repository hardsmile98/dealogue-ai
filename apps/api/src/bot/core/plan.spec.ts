import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMINGS } from '../library/timings.js';
import { buildPlan, needsWriter } from './plan.js';
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
};

/** Библиотека; `diagnosticAsks` — заканчивается ли диагностика вопросом. */
function libraryWith(diagnosticAsks = true): LibraryAvailability {
  return {
    milestone: (key, query) =>
      query.language === 'ru' || key !== 'diagnostic'
        ? {
            key,
            itemId: `item-${key}`,
            title: `${key} ${query.category ?? 'universal'} ${query.gender ?? 'any'}`,
            kind: key,
            asks: key === 'diagnostic' ? diagnosticAsks : true,
          }
        : null,
    phrases: (kind, query) => PHRASES[`${kind}:${query.category ?? '-'}`] ?? [],
    supportsLanguage: (language) => language === 'ru' || language === 'en',
  };
}
const library = libraryWith();

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

describe('план: знакомство', () => {
  it('«хочу бесплатный расклад»: приветствие и одним сообщением дата, место и сфера — по фразе из таблиц', () => {
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
    expect(plan.goal).toContain(
      'дату рождения, место рождения и в какой сфере вопрос',
    );
  });

  it('сфера названа в первом сообщении — просим только дату и место', () => {
    const plan = buildPlan(
      input({
        analysis: analysis({ answerPoints: [], card: money }),
        memory: memory({ card: money }),
      }),
    );
    expect(plan.nudge).toBe('ask_birth_data');
    expect(plan.goal).toContain('дату рождения и место рождения');
    expect(plan.goal).not.toContain('сфере');
  });

  it('вопрос в первом сообщении: ответ и шаг — два сообщения', () => {
    const plan = buildPlan(input());
    expect(plan.answer.map((item) => item.text)).toEqual([
      'спросил, где ты живёшь',
    ]);
    expect(plan.nudge).toBe('ask_birth_data');
    expect(plan.constraints.maxParts).toBe(2);
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
    expect(plan.goal).toContain('Шаг — утверждение');
    expect(plan.goal).toContain('«хорошо?»');
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

  it('прислал только дату — тоже дальше, без запроса будет общий анализ', () => {
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
    expect(plan.milestone?.key).toBe('links');
    expect(plan.phrases).toEqual(PHRASES['wait:no_request']);
  });

  it('данные просили, а клиент только спрашивает — ответ, без повторной просьбы', () => {
    const plan = buildPlan(
      input({
        analysis: analysis({ intents: ['asks_about_practitioner'] }),
        memory: memory({ said: asked }),
        state: { remindersSent: 0, turnsInStage: 1 },
      }),
    );
    expect(plan.milestone).toBeNull();
    expect(plan.nudge).toBeNull();
    expect(plan.answer).toHaveLength(1);
    expect(plan.constraints.maxParts).toBe(1);
  });

  it('ранний вопрос о цене — ответ по фразе из таблиц, без цен', () => {
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
    expect(plan.answer[0]?.hold).toContain('Стоимость — вопрос обсуждаемый.');
    expect(plan.constraints.doNotMention[0]).toContain('можно');
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
    expect(plan.afterBlock).toBe(false);
    // Диагностика без вопроса в конце — важнее вопрос после неё.
    const noQuestion = buildPlan(
      scheduled('diagnostic', { memory: silent, library: libraryWith(false) }),
    );
    expect(noQuestion.nudge).toBe('ask_want_options');
    expect(noQuestion.afterBlock).toBe(true);
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
    expect(plan.answer[0]?.hold).toContain('Стоимость');
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

  it('диагностика по таймеру: по сфере «финансы» — финансовая; без вопроса в конце — вопрос после неё', () => {
    const timer = (asks: boolean) =>
      buildPlan(
        scheduled('diagnostic', {
          stage: 'links',
          memory: memory({ card: { ...withBirth, ...money }, said: links }),
          library: libraryWith(asks),
        }),
      );
    const asking = timer(true);
    expect(asking.milestone?.title).toBe('diagnostic money.instability any');
    expect(needsWriter(asking)).toBe(false);
    const silent = timer(false);
    expect(silent.nudge).toBe('ask_want_options');
    expect(silent.afterBlock).toBe(true);
    expect(silent.goal).toContain('твоё сообщение уйдёт сразу после неё');
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

  it('вопрос или сомнение — ответ и один раз предложить рассказать о вариантах', () => {
    const doubt = {
      intents: ['doubts' as const],
      answerPoints: [point('question', 'practice', 'а это правда работает?')],
    };
    const first = reacting(doubt);
    expect(first.milestone).toBeNull();
    expect(first.answer).toHaveLength(1);
    expect(first.nudge).toBe('ask_want_options');
    expect(first.afterBlock).toBe(false);
    expect(first.constraints.maxParts).toBe(2);
    const again = reacting(doubt, {
      memory: memory({
        said: [...diagnosticSaid, said('nudge', 'ask_want_options', 11, 20)],
      }),
    });
    expect(again.nudge).toBeNull();
    expect(again.answer).toHaveLength(1);
    // Фраза плейбука сама предлагает рассказать подробнее — второй вопрос не нужен.
    const playbook = reacting({
      intents: ['doubts'],
      objection: 'think_about_it',
      answerPoints: [point('objection', 'other', 'не уверена')],
    });
    expect(playbook.objection?.phrase).toBe('Может, есть вопросы по работе?');
    expect(playbook.nudge).toBeNull();
    expect(playbook.constraints.maxParts).toBe(1);
  });

  it('молчит — напоминание по фразе из таблиц; следующее — другим вариантом', () => {
    const first = buildPlan(
      scheduled('return_question', {
        stage: 'diagnostic',
        memory: memory({ said: diagnosticSaid }),
        history: [out(9, 100, true)],
      }),
    );
    expect(first.nudge).toBe('ask_feedback');
    expect(first.phrases).toEqual(['Что бы вы хотели изменить?']);
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
    expect(second.phrases).toEqual(['Жду обратную связь по раскладу)']);
  });

  it('варианты по таймеру больше не уходят: старое задание закрывается без текста', () => {
    const plan = buildPlan(
      scheduled('offer', {
        stage: 'diagnostic',
        memory: memory({ said: diagnosticSaid }),
        history: [out(9, 100, true)],
      }),
    );
    expect(plan.milestone).toBeNull();
    expect(plan.idle).toContain('offer');
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

  it('возражение: первый подход из таблиц, при повторе — следующий; цен нет', () => {
    const objecting = {
      intents: ['objects' as const],
      objection: 'think_about_it',
      answerPoints: [point('objection', 'other', 'подумаю')],
    };
    const first = reacting(objecting);
    expect(first.milestone).toBeNull();
    expect(first.objection).toEqual({
      category: 'think_about_it',
      approach: 0,
      phrase: 'Может, есть вопросы по работе?',
    });
    const repeated = reacting(objecting, {
      memory: memory({
        said: [...offerSaid, said('argument', 'think_about_it:0', 14, 10)],
      }),
    });
    expect(repeated.objection?.phrase).toBe('Что смутило?');
    expect(repeated.goal).toContain('не так, как раньше');
    expect(
      reacting({ ...objecting, objection: 'expensive' }).objection?.phrase,
    ).toBeNull();
  });

  it('молчит — напоминание по фразе из таблиц; цены по таймеру не уходят', () => {
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
    expect(reminder.phrases).toEqual(['Всё ли понятно или есть вопросы?']);
    expect(reminder.reminders).toBe(1);
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
