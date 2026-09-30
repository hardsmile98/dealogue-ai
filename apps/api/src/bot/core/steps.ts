import { SPHERE_QUESTION } from '../library/kinds.js';
import type { LibraryKind } from '../library/kinds.js';
import { birthDateSettled, requestKnown } from './memory.js';
import type { Memory, Nudge, Plan } from './types.js';

/**
 * Шаги воронки (docs/agent-architecture.md, 2.3): что шаг делает и чьи
 * фразы из таблиц показывают, как он звучит у практика. Что сказать,
 * решает код (задача шага), как сказать — ответчик: он пишет своё
 * сообщение под разговор, фразы — образцы тона, а не шаблон (решение
 * владельца 30.09: дословный пересказ фраз звучал как бот).
 */
export interface StepSpec {
  /** Вид библиотеки с образцами шага; null — фразы в таблицах нет, шаг пишется по задаче. */
  kind: LibraryKind | null;
  category?: string;
  /** Что шаг должен сделать — главное для ответчика; фразы лишь показывают тон. */
  task: string;
  /** Как шаг называется в «уже было, не повторять». */
  title: string;
  /** Утверждение, а не вопрос: вопроса нет, даже если он есть в образце («хорошо?»). */
  statement?: boolean;
  /** Сколько вопросов клиенту может быть в сообщении шага (по умолчанию один, у утверждения — ни одного). */
  questions?: number;
  /** Идёт после тела вехи этого хода, а не перед ним. */
  after?: boolean;
  /** Шаг — короткая связка к вехе этого хода («результаты ниже»): это разрешённое вступление к ней. */
  introduces?: boolean;
  /** Напоминание, которое может повториться: каждый раз первым идёт следующий вариант фразы. */
  rotate?: boolean;
  /** Из фразы берётся только первый абзац (дальше в ней ссылки — они уходят вехой). */
  firstParagraph?: boolean;
  /**
   * Вопрос образца сохраняется по смыслу: по ответу на него анализатор
   * выбирает подкатегорию диагностики («Вы состоите в отношениях?» → да/нет).
   */
  keepQuestion?: boolean;
  /**
   * Какие шаги повторяет по своей сути (напоминание, повторный вопрос о
   * сфере) — их нет в «не повторять».
   */
  reminds?: readonly Nudge[];
  /** Отметка в реестре, а не шаг хода: в «не повторять» не попадает. */
  marker?: boolean;
}

export const STEPS: Record<Nudge, StepSpec> = {
  ask_birth_data: {
    kind: 'greeting',
    task: 'одним сообщением попроси прислать дату рождения, место рождения и в какой сфере вопрос',
    title: 'просьба о дате, месте рождения и сфере',
  },
  ask_birth_date: {
    kind: 'ask_birth_data',
    task: 'одним коротким сообщением ещё раз попроси прислать дату рождения',
    title: 'повторная просьба о дате рождения',
    reminds: ['ask_birth_data', 'ask_sphere'],
  },
  ask_sphere: {
    kind: 'ask_request',
    category: SPHERE_QUESTION,
    task: 'клиент прислал данные, но не написал, в какой сфере вопрос, — одним коротким вопросом спроси, на какую сферу жизни сделать упор в анализе',
    title: 'вопрос о сфере',
    reminds: ['ask_birth_data', 'ask_birth_date'],
  },
  clarify_request: {
    kind: 'ask_request',
    task: 'одним коротким вопросом уточни запрос внутри названной сферы',
    title: 'уточняющий вопрос о запросе',
    keepQuestion: true,
  },
  birth_data_reminder: {
    kind: 'no_birth_data',
    task: 'коротко и мягко напомни, что для анализа нужны дата рождения и сфера, а без них сделаешь общий анализ по основным сферам; без слов «напоминаю», «напомню о себе»',
    title: 'напоминание о данных',
    reminds: ['ask_birth_data', 'ask_birth_date', 'ask_sphere'],
  },
  clarify_reminder: {
    kind: 'ask_request',
    task: 'клиент не ответил на уточняющий вопрос — мягко задай его ещё раз одним коротким сообщением, другими словами; без слов «напоминаю», «напомню о себе»',
    title: 'напоминание об уточняющем вопросе',
    keepQuestion: true,
    reminds: ['clarify_request'],
  },
  start_analysis: {
    kind: 'wait',
    task: 'скажи, что понял и займёшься анализом, а потом вернёшься с результатами',
    title: 'обещание сделать анализ',
    statement: true,
  },
  general_analysis: {
    kind: 'links',
    category: 'no_request',
    task: 'скажи, что не увидел запроса и сделал общий анализ — результаты ниже',
    title: 'общий анализ без запроса',
    statement: true,
    introduces: true,
    firstParagraph: true,
  },
  ask_want_options: {
    kind: null,
    task: 'одним коротким вопросом спроси, рассказать ли, как это можно проработать (например: «Рассказать вам, как это можно проработать?»)',
    title: 'вопрос, рассказать ли о вариантах работы',
    after: true,
  },
  ask_feedback: {
    kind: 'return_question',
    task: 'клиент молчит после диагностики — задай вопрос по ней; без слов «напоминаю», «напомню о себе»',
    title: 'вопрос-отклик на диагностику',
    // В таблице есть «Что бы вы хотели изменить? Каких результатов хотели бы достичь?» — один смысл, два знака.
    questions: 2,
    rotate: true,
  },
  ask_offer_questions: {
    kind: 'nudge',
    category: 'offer',
    task: 'спроси, всё ли понятно по направлениям и есть ли вопросы',
    title: 'вопрос после вариантов работы',
    rotate: true,
  },
  clarify_objection: {
    kind: null,
    task: 'отработка возражения закончилась уточняющим вопросом',
    title: 'уточняющий вопрос по возражению',
    marker: true,
  },
  pause_objection: {
    kind: null,
    task: 'отработка возражения оставила дверь открытой',
    title: 'пауза после возражения',
    marker: true,
  },
  release_objection: {
    kind: null,
    task: 'клиента отпустили после повторных возражений',
    title: 'клиента отпустили',
    marker: true,
  },
  follow_up: {
    kind: null,
    task: 'клиент прочитал и молчит — мягко вернись к разговору одним коротким сообщением: если твой последний вопрос остался без ответа, задай его ещё раз другими словами; без слов «напоминаю», «напомню о себе» и без давления',
    title: 'напоминание по разговору',
    reminds: [
      'ask_want_options',
      'ask_feedback',
      'ask_offer_questions',
      'clarify_objection',
    ],
  },
  unread_reminder: {
    kind: null,
    task: 'ненавязчиво напомни о себе одним коротким сообщением, опираясь на то, о чём шёл разговор; без давления и без повтора своих прошлых фраз',
    title: 'напоминание о себе',
  },
};

export function isNudge(key: string): key is Nudge {
  return key in STEPS;
}

/** Сколько вопросов может быть в сообщении шага; уточнение внутри просьбы о данных — ещё один. */
export function stepQuestions(
  nudge: Nudge,
  plan: Pick<Plan, 'coveredNudges'>,
): number {
  const step = STEPS[nudge];
  const own = step.statement ? 0 : (step.questions ?? 1);
  return own + (plan.coveredNudges.includes('clarify_request') ? 1 : 0);
}

const DATA_STEPS: readonly Nudge[] = [
  'ask_birth_data',
  'ask_birth_date',
  'birth_data_reminder',
];

/**
 * Задача шага словами для ответчика; просьба о данных и напоминание о них —
 * ровно о том, чего не хватает. Место рождения — только в первой просьбе и
 * только вместе с датой: оно необязательно.
 */
export function stepTask(
  nudge: Nudge,
  plan: Pick<Plan, 'coveredNudges'>,
  memory: Memory,
): string {
  if (!DATA_STEPS.includes(nudge)) return STEPS[nudge].task;
  const { card } = memory;
  const request = requestKnown(card);
  const date = !birthDateSettled(card);
  const place = nudge === 'ask_birth_data' && date && !card.birthPlace?.value;
  const missing = [
    ...(date ? ['дату рождения'] : []),
    ...(place ? ['место рождения'] : []),
    ...(request ? [] : ['в какой сфере вопрос']),
  ];
  const list =
    missing.length > 1
      ? `${missing.slice(0, -1).join(', ')} и ${missing.at(-1)}`
      : (missing[0] ?? 'дату рождения');
  if (nudge === 'birth_data_reminder') {
    const without = request
      ? 'анализ по тому, что есть'
      : 'общий анализ по основным сферам';
    return `коротко и мягко напомни, что для анализа нужно знать ${list}, а без этого сделаешь ${without}; без слов «напоминаю», «напомню о себе»`;
  }
  const clarify = plan.coveredNudges.includes('clarify_request')
    ? ' и задай уточняющий вопрос из образца'
    : '';
  return nudge === 'ask_birth_date'
    ? `одним коротким сообщением ещё раз попроси прислать ${list}${clarify}`
    : `одним сообщением попроси прислать ${list}${clarify}`;
}

/**
 * Фраза шага, которая уходит как есть, если текст ответчика не прошёл
 * проверки. У шага-утверждения — только фраза без вопроса («…вернусь,
 * хорошо?» не подходит); такой нет — null, уйдёт нейтральная запасная.
 */
export function fallbackStepPhrase(
  plan: Pick<Plan, 'nudge' | 'phrases'>,
): string | null {
  if (!plan.nudge) return null;
  const phrases = STEPS[plan.nudge].statement
    ? plan.phrases.filter((phrase) => !phrase.includes('?'))
    : plan.phrases;
  return phrases[0] ?? null;
}

/** Следующий по кругу вариант — первым: образцы не повторяются одним порядком. */
export function rotated<T>(items: readonly T[], shift: number): T[] {
  if (items.length === 0) return [];
  const start = shift % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}
