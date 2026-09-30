import {
  MILESTONE_TITLES,
  SPHERE_QUESTION,
  STAGES,
  isSphere,
} from '../library/kinds.js';
import type {
  Gender,
  LibraryKind,
  Milestone,
  Stage,
} from '../library/kinds.js';
import type { Timings } from '../library/timings.js';
import { milestoneAt, milestoneMessageId, seenByClient } from './history.js';
import {
  argumentsUsed,
  birthDateSettled,
  clientLanguage,
  dataRequestsSent,
  diagnosticCategory,
  knownCategory,
  knownGender,
  lastIntakeQuestion,
  nudgesSaid,
  requestKnown,
} from './memory.js';
import type { IntakeQuestionNudge } from './memory.js';
import type {
  Analysis,
  AnswerPoint,
  AnswerTopic,
  HistoryMessage,
  IncomingMessage,
  JobKind,
  Memory,
  Nudge,
  Plan,
  PlanMilestone,
  PlannedAnswer,
  TurnJob,
  TurnTrigger,
} from './types.js';

export interface PhraseQuery {
  language: string;
  gender: Gender | null;
  /** Категория элемента библиотеки; null — общий вариант. */
  category: string | null;
}

/** Что библиотека аккаунта может дать плану: тела вех, фразы шагов, поддержка языка. */
export interface LibraryAvailability {
  /** Элемент вехи для клиента или null, если нечего отправить. */
  milestone(
    key: Milestone,
    query: { category: string | null; gender: Gender | null; language: string },
  ): PlanMilestone | null;
  /**
   * Фразы вида из таблиц — основа шага воронки: на языке клиента (нет на
   * нём — на русском, ответчик переведёт), по категории и полу, в порядке
   * библиотеки.
   */
  phrases(kind: LibraryKind, query: PhraseQuery): string[];
  /** Есть ли на языке хотя бы одна диагностика — иначе клиента ведёт менеджер. */
  supportsLanguage(language: string): boolean;
}

export interface PlanState {
  remindersSent: number;
  /** Ходов уже было на текущем этапе (этот ход не считается). */
  turnsInStage: number;
}

export interface PlanInput {
  trigger: TurnTrigger;
  job: TurnJob | null;
  messages: readonly IncomingMessage[];
  /** null у хода по расписанию. */
  analysis: Analysis | null;
  /** Память уже с учётом анализа этого хода. */
  memory: Memory;
  history: readonly HistoryMessage[];
  stage: Stage;
  now: Date;
  timings: Timings;
  state: PlanState;
  library: LibraryAvailability;
  /** Задания, которые созрели или созреют в ближайшие минуты, — входят в ход как срочные. */
  dueJobs: readonly JobKind[];
}

/**
 * Просьб о данных (дата рождения, сфера) в ответах клиенту — не больше:
 * первое сообщение и ещё две (решение владельца 30.09).
 */
export const MAX_DATA_REQUESTS = 3;

/** Напоминания — всего не больше `maxReminders` на чат (лимит держит лестница). */
const REMINDER_JOBS: readonly JobKind[] = [
  'birth_data_reminder',
  'return_question',
  'offer_nudge',
  'unread_reminder',
];

const JOB_NUDGE: Partial<Record<JobKind, Nudge>> = {
  birth_data_reminder: 'birth_data_reminder',
  return_question: 'ask_feedback',
  offer_nudge: 'ask_offer_questions',
  unread_reminder: 'unread_reminder',
};

/**
 * Веха по расписанию — только диагностика: таймер после «займусь
 * анализом» или общая диагностика клиенту, который молчит и после
 * напоминания. Варианты и цены уходят только по реакции клиента.
 */
const JOB_MILESTONE: Partial<Record<JobKind, Milestone>> = {
  diagnostic: 'diagnostic',
};

interface StepSpec {
  /** Вид библиотеки с фразой шага; null — фразы в таблицах нет, шаг пишется по задаче. */
  kind: LibraryKind | null;
  category?: string;
  task: string;
  /** Как шаг называется в «уже было, не повторять». */
  title: string;
  /** Утверждение, а не вопрос: вопрос из фразы («хорошо?») убирается. */
  statement?: boolean;
  /** Идёт после тела вехи этого хода, а не перед ним. */
  after?: boolean;
  /** Напоминание, которое может повториться: каждый раз — следующий вариант фразы. */
  rotate?: boolean;
  /** Из фразы берётся только первый абзац (дальше в ней ссылки — они уходят вехой). */
  firstParagraph?: boolean;
  /**
   * Какие шаги повторяет по своей сути (напоминание, повторный вопрос о
   * сфере) — их нет в «не повторять».
   */
  reminds?: readonly Nudge[];
}

/**
 * Шаги воронки: чья фраза из таблиц — основа сообщения и что шаг делает.
 * Ответчик пишет шаг по фразе, а не придумывает его: так агент идёт по
 * воронке из таблиц и не задаёт лишних вопросов.
 */
const STEPS: Record<Nudge, StepSpec> = {
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
    rotate: true,
  },
  ask_offer_questions: {
    kind: 'nudge',
    category: 'offer',
    task: 'спроси, всё ли понятно по направлениям и есть ли вопросы',
    title: 'вопрос после вариантов работы',
    rotate: true,
  },
  unread_reminder: {
    kind: null,
    task: 'ненавязчиво напомни о себе одним коротким сообщением, опираясь на то, о чём шёл разговор; без давления и без повтора своих прошлых фраз',
    title: 'напоминание о себе',
  },
};

/**
 * Темы, которые раскрываются только вехой: до этапа `opensAt` на такой
 * пункт ответчик отвечает по формуле, не раскрывая. Тему пункта называет
 * анализатор (answerPoints[].topic) — код текст не разбирает.
 */
const TOPIC_HOLDS: Partial<
  Record<AnswerTopic, { opensAt: Stage; hold: string }>
> = {
  price: {
    opensAt: 'prices',
    hold: 'конкретные цены не называй: скажи, что к стоимости вернёшься чуть позже',
  },
  diagnostic: {
    opensAt: 'diagnostic',
    hold: 'результаты диагностики не пересказывай и не придумывай: скажи, что пришлёшь их, когда посмотришь',
  },
  practice: {
    opensAt: 'diagnostic',
    hold: 'ответь коротко и общо, без подробностей: о практиках подробно расскажешь после диагностики',
  },
};

/** Тема, на которую отвечает сама веха хода: клиент об этом спросил — веха и есть ответ. */
const MILESTONE_ANSWERS: Record<Milestone, AnswerTopic> = {
  links: 'diagnostic',
  diagnostic: 'diagnostic',
  offer: 'practice',
  prices: 'price',
};

function stageIndex(stage: Stage): number {
  return STAGES.indexOf(stage);
}

function before(stage: Stage, other: Stage): boolean {
  return stageIndex(stage) < stageIndex(other);
}

function minutesBetween(from: Date | null, to: Date): number {
  return from
    ? (to.getTime() - from.getTime()) / 60_000
    : Number.POSITIVE_INFINITY;
}

/** Как клиент отреагировал на веху — по намерениям и пунктам анализа. */
interface Reaction {
  /** Прямо просит следующий шаг: варианты, цену, выбрал вариант, готов. */
  explicit: boolean;
  /** Спросил что-то (на вопрос нужен ответ). */
  asks: boolean;
  /** Возражает или сомневается. */
  resists: boolean;
}

function reactionOf(analysis: Analysis): Reaction {
  const intents = new Set(analysis.intents);
  return {
    explicit:
      intents.has('asks_practice') ||
      intents.has('asks_price') ||
      intents.has('ready') ||
      intents.has('chooses_option'),
    asks: analysis.answerPoints.some(
      (point) => !point.skip && point.kind === 'question',
    ),
    resists:
      analysis.objection !== null ||
      intents.has('objects') ||
      intents.has('doubts') ||
      analysis.answerPoints.some((point) => point.kind === 'objection'),
  };
}

/**
 * План хода (docs/agent-architecture.md, 3.4): передача → веха → шаг
 * воронки → ответы → ограничения. Чистая функция: единственное место,
 * которое правится при изменении логики воронки, покрыто таблицами тестов.
 */
export function buildPlan(input: PlanInput): Plan {
  const { analysis, memory, stage, trigger, job, timings } = input;
  // Язык — из карточки: он «липкий» и уже обновлён анализом этого хода (memory.nextLanguage).
  const language = clientLanguage(memory.card);
  const intents = new Set(analysis?.intents ?? []);
  const said = memory.said;
  const card = memory.card;

  const plan: Plan = {
    handoff: null,
    answer: [],
    milestone: null,
    nudge: null,
    coveredNudges: [],
    phrases: [],
    afterBlock: false,
    objection: null,
    constraints: {
      doNotRepeat: [],
      doNotMention: [],
      language,
      maxParts: 0,
    },
    goal: '',
    reminders: 0,
    idle: null,
  };

  // 1. Передача менеджеру — дальше план не идёт.
  const media = input.messages.find((message) => message.mediaKind);
  if (media) return handoff(plan, 'media', `клиент прислал ${media.mediaKind}`);
  if (analysis && analysis.risk.length > 0)
    return handoff(plan, 'risk', analysis.risk.join(', '));
  if (stage === 'prices' && trigger === 'client')
    return handoff(plan, 'reply_after_prices', 'клиент ответил после цен');
  if (!input.library.supportsLanguage(language)) {
    return handoff(
      plan,
      'no_language_materials',
      `нет материалов на языке «${language}»`,
    );
  }

  // 2. Веха — по реакции клиента; по расписанию — только диагностика.
  const category = diagnosticCategory(card);
  const gender = knownGender(card);
  const query = { category, gender, language };
  const hasRequest =
    requestKnown(card) ||
    intents.has('shares_story') ||
    memory.facts.some((fact) => fact.kind === 'situation');
  const clarify = clarifyPhrases(input, query);
  const intake =
    stage === 'intake' && trigger === 'client'
      ? intakeMove({
          memory,
          hasRequest,
          clarify: clarify.length > 0,
          acknowledged: analysis !== null && onlyAcknowledges(analysis),
        })
      : null;
  const reaction = analysis ? reactionOf(analysis) : null;
  const jobMilestone = job ? JOB_MILESTONE[job.kind] : undefined;
  const due = (kind: JobKind) =>
    input.dueJobs.includes(kind) || job?.kind === kind;

  const wantMilestone = (key: Milestone): boolean => {
    switch (key) {
      case 'links':
        // Вопросы знакомства кончились: ответ на последний, каким бы он ни
        // был, ведёт к «займусь анализом» и ссылкам.
        return intake?.links === true;
      case 'diagnostic': {
        // Молчит и после напоминания — диагностика по тому, что известно
        // (без сферы — общая), по лестнице.
        if (stage === 'intake')
          return lastIntakeQuestion(said) !== null && due('diagnostic');
        if (stage !== 'links') return false;
        const elapsed = minutesBetween(milestoneAt(said, 'links'), input.now);
        const asked =
          intents.has('asks_diagnostic_status') &&
          elapsed >= timings.diagnosticDelayMin.min;
        return due('diagnostic') || asked;
      }
      case 'offer':
        // Хочет узнать варианты или откликнулся без вопроса и возражения
        // («да», «ок», «хочу всё изменить») — варианты сразу.
        return (
          stage === 'diagnostic' &&
          reaction !== null &&
          seenByClient(input.history, milestoneMessageId(said, 'diagnostic')) &&
          (reaction.explicit ||
            (!reaction.resists && (!reaction.asks || analysis!.interest >= 2)))
        );
      case 'prices':
        // Выбрал вариант, спросил цену, готов или ответил без вопроса и
        // возражения («да, всё понятно») — цены сразу.
        return (
          stage === 'offer' &&
          reaction !== null &&
          seenByClient(input.history, milestoneMessageId(said, 'offer')) &&
          (reaction.explicit || (!reaction.resists && !reaction.asks))
        );
      default:
        return false;
    }
  };

  const target: Milestone | null =
    jobMilestone ??
    (['links', 'diagnostic', 'offer', 'prices'] as Milestone[]).find(
      wantMilestone,
    ) ??
    null;
  if (target && wantMilestone(target)) {
    const item = input.library.milestone(target, query);
    if (item) {
      plan.milestone = item;
    } else if (target === 'diagnostic') {
      return handoff(
        plan,
        'no_language_materials',
        `нет диагностики для «${category ?? 'универсальная'}», ${gender ?? 'любой пол'}, ${language}`,
      );
    }
  }

  // 3. Возражение: следующий подход из плейбука.
  if (analysis?.objection) {
    const approach = argumentsUsed(said, analysis.objection);
    const approaches = input.library.phrases('objection', {
      ...query,
      category: analysis.objection,
    });
    plan.objection = {
      category: analysis.objection,
      approach,
      phrase:
        approaches.length > 0
          ? (approaches[approach % approaches.length] as string)
          : null,
    };
  }

  // 4. Шаг воронки — один за ход. У вехи свой шаг: перед ссылками —
  // «займусь анализом»; после диагностики без вопроса в конце — вопрос,
  // рассказать ли о вариантах; перед общей диагностикой — «не увидел запроса».
  if (plan.milestone) {
    plan.nudge = milestoneNudge(plan.milestone, stage, category);
  } else if (trigger === 'schedule' && job) {
    plan.nudge = scheduledNudge(job.kind, stage, said);
    if (plan.nudge && REMINDER_JOBS.includes(job.kind)) plan.reminders = 1;
  } else if (intake) {
    plan.nudge = intake.nudge;
    if (intake.withClarify) plan.coveredNudges = ['clarify_request'];
  } else if (trigger === 'client') {
    plan.nudge = clientNudge(stage, said, Boolean(plan.objection?.phrase));
  }
  // Условие задания проверяется в момент срабатывания, а не при постановке.
  if (trigger === 'schedule' && !plan.milestone && !plan.nudge) {
    plan.idle = `задание «${job?.kind ?? '—'}» неактуально на этапе «${stage}»`;
    plan.goal = `Пропустить: ${plan.idle}.`;
    return plan;
  }
  if (plan.nudge) {
    plan.phrases = stepPhrases(plan.nudge, input, query);
    // Уточнение внутри просьбы о данных — одним сообщением с ней.
    const withClarify = clarify[0];
    if (plan.coveredNudges.includes('clarify_request') && withClarify) {
      plan.phrases =
        plan.phrases.length > 0
          ? plan.phrases.map((phrase) => `${phrase} ${withClarify}`)
          : [withClarify];
    }
    plan.afterBlock = Boolean(STEPS[plan.nudge].after && plan.milestone);
  }

  // 5. Ответить клиенту — только на то, что не закрывают шаг и веха.
  // Тема, до которой разговор ещё не дошёл, получает формулу без раскрытия.
  const reached: Stage = plan.milestone ? plan.milestone.key : stage;
  const turn: TurnCoverage = {
    handled: plan.nudge !== null || plan.milestone !== null,
    stage,
    milestone: plan.milestone?.key ?? null,
  };
  // Ранняя цена без вехи в ходе — фраза из таблиц «стоимость — вопрос обсуждаемый».
  const priceDeflect = plan.milestone
    ? undefined
    : input.library.phrases('price_deflect', { ...query, category: null })[0];
  plan.answer = (analysis?.answerPoints ?? [])
    .filter((point) => needsOwnAnswer(point, turn))
    .map<PlannedAnswer>((point) => {
      const rule = TOPIC_HOLDS[point.topic];
      if (!rule || !before(reached, rule.opensAt))
        return { ...point, hold: null };
      const hold =
        point.topic === 'price' && priceDeflect
          ? `цены не называй: ответь по фразе из сценария, смысл не меняй — «${priceDeflect}»`
          : rule.hold;
      return { ...point, hold };
    });
  const priceHeld = plan.answer.some(
    (point) => point.topic === 'price' && point.hold,
  );

  // 6. Ограничения. Сообщений ответчика: одно на ответы, одно на шаг.
  plan.constraints.maxParts =
    (plan.answer.length > 0 || plan.objection ? 1 : 0) + (plan.nudge ? 1 : 0);
  // Напоминание по своей сути повторяет то, о чём напоминает, — это не повтор.
  const reminded: readonly string[] = plan.nudge
    ? (STEPS[plan.nudge].reminds ?? [])
    : [];
  plan.constraints.doNotRepeat = [
    ...new Set(
      said
        .filter(
          (entry) =>
            entry.kind === 'nudge' &&
            entry.key !== plan.nudge &&
            !reminded.includes(entry.key) &&
            entry.key in STEPS,
        )
        .map((entry) => STEPS[entry.key as Nudge].title),
    ),
    ...said
      .filter((entry) => entry.kind === 'argument')
      .map((entry) => `подход к возражению ${entry.key}`),
  ];
  // Цены своими словами — никогда: они уходят только телом вехи «стоимость».
  plan.constraints.doNotMention.push(
    priceHeld
      ? 'конкретные цены и суммы (сказать, что к стоимости вернёшься позже, — можно)'
      : 'цены и суммы своими словами',
  );
  if (before(stage, 'diagnostic') && plan.milestone?.key !== 'diagnostic') {
    plan.constraints.doNotMention.push('содержание и выводы диагностики');
  }
  if (before(stage, 'diagnostic'))
    plan.constraints.doNotMention.push('подробное описание практик и услуг');

  plan.goal = describeGoal(plan, input, stage);
  return plan;
}

function handoff(
  plan: Plan,
  reason: Plan['handoff'] extends infer H
    ? H extends { reason: infer R }
      ? R
      : never
    : never,
  detail: string,
): Plan {
  plan.handoff = { reason, detail };
  plan.goal = `Передать менеджеру: ${detail}.`;
  return plan;
}

interface TurnCoverage {
  /** В ходе есть шаг воронки или веха. */
  handled: boolean;
  stage: Stage;
  milestone: Milestone | null;
}

/**
 * Нужен ли пункту отдельный ответ. Шаг воронки и веха сами отвечают на
 * рассказ о проблеме и просьбу о раскладе: «понимаю вас» к ним — это и
 * есть лишние сообщения. Приветствие, «ок», присланные данные и короткий
 * ответ на наш вопрос отдельного ответа не требуют никогда («всё
 * записал», «хорошо, посмотрю в целом»); если в ходе нет ни шага, ни
 * вехи, на них агент молчит.
 */
function needsOwnAnswer(point: AnswerPoint, turn: TurnCoverage): boolean {
  if (point.skip) return false;
  switch (point.kind) {
    case 'greeting':
    case 'ack':
    case 'data':
    case 'answer':
      return false;
    case 'story':
    case 'emotion':
      return !turn.handled;
    default:
      break;
  }
  // «Расскажите о практиках», «а цена?» — веха этого хода и есть ответ.
  if (turn.milestone && MILESTONE_ANSWERS[turn.milestone] === point.topic)
    return false;
  // Просьба о раскладе и «когда будет»: пока диагностика не ушла, на них отвечает шаг воронки.
  if (point.topic === 'diagnostic' && before(turn.stage, 'diagnostic'))
    return !turn.handled;
  return true;
}

interface IntakeMove {
  /** Вопрос знакомства этого хода; null — спрашивать нечего. */
  nudge: IntakeQuestionNudge | null;
  /** Уточняющий вопрос входит в просьбу о данных — одним сообщением. */
  withClarify: boolean;
  /** Вопросы кончились — пора «займусь анализом» и ссылок. */
  links: boolean;
}

/**
 * Ход клиента на знакомстве (docs/agent-architecture.md, 2.0): что
 * спросить или пора ссылок. Нужны дата рождения и сфера; место
 * необязательно — его просим только в первом сообщении, вместе с датой.
 * Пока даты или сферы нет, каждый ответ клиента получает просьбу о
 * недостающем — всего не больше `MAX_DATA_REQUESTS` просьб; дату больше не
 * просим, если клиент сказал, что не знает её или не даст. Сфера названа,
 * а подкатегория не ясна и у сферы есть уточняющий вопрос — один раз
 * уточняем, в той же просьбе, если она есть. Вопросы кончились или лимит
 * просьб вышел — ссылки. На «ок, сейчас пришлю» не переспрашиваем: ждём
 * данных, молчит — напомнит лестница.
 */
function intakeMove(input: {
  memory: Memory;
  hasRequest: boolean;
  /** У названной сферы есть уточняющий вопрос, а подкатегория не ясна. */
  clarify: boolean;
  /** Клиент только подтвердил («ок», «сейчас пришлю») — ничего не прислал и не спросил. */
  acknowledged: boolean;
}): IntakeMove {
  const { card, said } = input.memory;
  const clarify = input.clarify && nudgesSaid(said, 'clarify_request') === 0;
  const needDate = !birthDateSettled(card);
  const needSphere = !input.hasRequest;
  const requests = dataRequestsSent(said);
  if ((needDate || needSphere) && requests < MAX_DATA_REQUESTS) {
    if (requests > 0 && input.acknowledged)
      return { nudge: null, withClarify: false, links: false };
    // Дата есть — остаётся сфера: её вопрос по своей фразе, и в первом ответе тоже.
    const nudge: IntakeQuestionNudge = !needDate
      ? 'ask_sphere'
      : requests === 0
        ? 'ask_birth_data'
        : 'ask_birth_date';
    return { nudge, withClarify: clarify, links: false };
  }
  if (clarify)
    return { nudge: 'clarify_request', withClarify: false, links: false };
  return { nudge: null, withClarify: false, links: true };
}

/** В ходе клиента только «ок», «спасибо», «сейчас пришлю» — по пунктам анализатора. */
function onlyAcknowledges(analysis: Analysis): boolean {
  return (
    analysis.answerPoints.length > 0 &&
    analysis.answerPoints.every((point) => point.kind === 'ack')
  );
}

/**
 * Уточняющий вопрос внутри названной сферы — фраза `ask_request` с
 * категорией-сферой. Пусто — уточнять нечего: сферы нет, подкатегория уже
 * ясна или у сферы нет такой фразы.
 */
function clarifyPhrases(
  input: PlanInput,
  query: { category: string | null; gender: Gender | null; language: string },
): string[] {
  const sphere = input.memory.card.sphere?.value;
  if (!sphere || !isSphere(sphere) || knownCategory(input.memory.card))
    return [];
  return input.library.phrases('ask_request', { ...query, category: sphere });
}

/** Шаг вместе с вехой: перед ссылками, после диагностики без вопроса, перед общей диагностикой. */
function milestoneNudge(
  milestone: PlanMilestone,
  stage: Stage,
  category: string | null,
): Nudge | null {
  if (milestone.key === 'links')
    return milestone.kind === 'links' ? 'start_analysis' : null;
  if (milestone.key !== 'diagnostic') return null;
  // Вопрос после диагностики обязателен; «не увидел запроса» — только если
  // диагностика спрашивает сама (шаг за ход — один).
  if (!milestone.asks) return 'ask_want_options';
  return stage === 'intake' && category === null ? 'general_analysis' : null;
}

/** Фразы шага из таблиц. У «займусь анализом» свой вариант, когда запроса нет. */
function stepPhrases(
  nudge: Nudge,
  input: PlanInput,
  query: { category: string | null; gender: Gender | null; language: string },
): string[] {
  const step = STEPS[nudge];
  if (!step.kind) return [];
  const find = (category: string | null) =>
    input.library.phrases(step.kind as LibraryKind, { ...query, category });
  let phrases: string[];
  if (nudge === 'start_analysis') {
    const preferred = query.category === null ? find('no_request') : [];
    phrases = preferred.length > 0 ? preferred : find(null);
  } else if (nudge === 'clarify_request' || nudge === 'clarify_reminder') {
    // Уточнение — фраза названной сферы.
    const sphere = input.memory.card.sphere?.value;
    phrases = sphere ? find(sphere) : [];
  } else {
    phrases = find(step.category ?? null);
  }
  if (step.firstParagraph) {
    phrases = phrases
      .map((phrase) => phrase.split(/\n\s*\n/)[0]?.trim() ?? '')
      .filter(Boolean);
  }
  if (step.rotate && phrases.length > 0) {
    // Повторное напоминание — следующим вариантом фразы.
    const sent = nudgesSaid(input.memory.said, nudge);
    return [phrases[sent % phrases.length] as string];
  }
  return phrases;
}

/**
 * Шаг по расписанию — только если он ещё к месту: напоминание о данных,
 * пока клиент молчит на этапе знакомства; вопрос-отклик, пока этап не
 * сменился.
 */
function scheduledNudge(
  kind: JobKind,
  stage: Stage,
  said: Memory['said'],
): Nudge | null {
  const nudge = JOB_NUDGE[kind];
  if (!nudge) return null;
  switch (kind) {
    case 'birth_data_reminder': {
      // Одно напоминание после каждого вопроса знакомства: об уточнении —
      // тем же уточняющим вопросом, о данных и сфере — фразой из таблиц.
      if (stage !== 'intake') return null;
      const question = lastIntakeQuestion(said);
      if (!question || question.reminded) return null;
      return question.nudge === 'clarify_request'
        ? 'clarify_reminder'
        : 'birth_data_reminder';
    }
    case 'return_question':
      return stage === 'diagnostic' ? nudge : null;
    case 'offer_nudge':
      return stage === 'offer' ? nudge : null;
    case 'unread_reminder':
      return before(stage, 'prices') ? nudge : null;
    default:
      return null;
  }
}

/**
 * Шаг в ходе клиента без вехи после знакомства (вопросы знакомства —
 * `intakeMove`): после диагностики на вопрос или сомнение — ответ и один
 * раз предложить рассказать о вариантах (если фраза плейбука на
 * возражение уже не предлагает это сама); дальше клиенту только отвечают.
 */
function clientNudge(
  stage: Stage,
  said: Memory['said'],
  objectionPhrase: boolean,
): Nudge | null {
  switch (stage) {
    case 'diagnostic':
      return !objectionPhrase && nudgesSaid(said, 'ask_want_options') === 0
        ? 'ask_want_options'
        : null;
    default:
      return null;
  }
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
function stepTask(nudge: Nudge, plan: Plan, memory: Memory): string {
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
    ? ' и задай уточняющий вопрос из фразы'
    : '';
  return nudge === 'ask_birth_date'
    ? `одним коротким сообщением ещё раз попроси прислать ${list}${clarify}`
    : `одним сообщением попроси прислать ${list}${clarify}`;
}

/**
 * Нужен ли ответчик: есть шаг воронки или то, на что ответить. Иначе ход —
 * это веха сама по себе или молчание («ок» во время ожидания).
 */
export function needsWriter(
  plan: Pick<Plan, 'nudge' | 'answer' | 'objection'>,
): boolean {
  return (
    plan.nudge !== null || plan.answer.length > 0 || plan.objection !== null
  );
}

function describeGoal(plan: Plan, input: PlanInput, stage: Stage): string {
  const lines: string[] = [];
  if (!needsWriter(plan)) {
    return plan.milestone
      ? `Отправить «${MILESTONE_TITLES[plan.milestone.key]}» (${plan.milestone.title}) без сопровождения — писать ничего не нужно.`
      : 'Промолчать: клиенту нечего отвечать, шага воронки нет — только «прочитано».';
  }
  if (input.trigger === 'schedule') {
    lines.push(
      'Ход по расписанию: ты пишешь первым, клиент ничего нового не писал. Не благодари, не отвечай и не сочувствуй — отвечать не на что; паузу не комментируй; не ссылайся на слова клиента, которых нет в истории.',
    );
  }
  if (
    stage === 'intake' &&
    input.state.turnsInStage === 0 &&
    input.trigger === 'client'
  ) {
    lines.push('Это первый ответ клиенту: начни с приветствия.');
  }
  if (plan.milestone && plan.afterBlock) {
    lines.push(
      `Сначала система отправит «${MILESTONE_TITLES[plan.milestone.key]}» (${plan.milestone.title}) текстом из библиотеки, твоё сообщение уйдёт сразу после неё. Её не пересказывай и не комментируй.`,
    );
  }
  if (plan.answer.length > 0) {
    const items = plan.answer.map((point, index) => {
      const hold = point.hold ? ` — ${point.hold}` : '';
      return `${index + 1}) ${point.text}${hold}`;
    });
    lines.push(
      `Ответить коротко, по существу, одним сообщением, в этом порядке: ${items.join('; ')}.`,
    );
  }
  if (plan.objection) {
    const nth =
      plan.objection.approach > 0
        ? ` (повторяется, ${plan.objection.approach + 1}-й раз — не так, как раньше)`
        : '';
    lines.push(
      plan.objection.phrase
        ? `Возражение «${plan.objection.category}»${nth}: отработай по фразе из сценария, смысл не меняй — «${plan.objection.phrase}».`
        : `Возражение «${plan.objection.category}»${nth}: отработай коротко и спокойно, без давления.`,
    );
  }
  if (plan.nudge) {
    const step = STEPS[plan.nudge];
    const task = stepTask(plan.nudge, plan, input.memory);
    const statement = step.statement
      ? ' Шаг — утверждение: без вопросов клиенту; если во фразе есть вопрос (например, «хорошо?»), убери его.'
      : '';
    if (plan.phrases.length === 0) {
      lines.push(`Шаг воронки (отдельным сообщением): ${task}.${statement}`);
    } else {
      const variants =
        plan.phrases.length > 1
          ? ' Вариантов несколько — возьми за основу один, не смешивай.'
          : '';
      lines.push(
        `Шаг воронки (отдельным сообщением): ${task}. Пиши его по фразе из сценария — её смысл, похожая длина; подстроить под разговор и под задачу шага можно, добавлять другое — нет.${statement}${variants}`,
        ...plan.phrases.map((phrase) => `«${phrase}»`),
      );
    }
  }
  if (plan.milestone && !plan.afterBlock) {
    lines.push(
      `Сразу после твоих сообщений система отправит «${MILESTONE_TITLES[plan.milestone.key]}» (${plan.milestone.title}) текстом из библиотеки. О ней не пиши: ни вступления, ни пересказа, ни продолжения.`,
    );
  }
  if (plan.constraints.doNotRepeat.length > 0)
    lines.push(
      `Уже было, не повторять: ${plan.constraints.doNotRepeat.join(', ')}.`,
    );
  if (plan.constraints.doNotMention.length > 0)
    lines.push(`Не упоминать: ${plan.constraints.doNotMention.join(', ')}.`);
  return lines.join('\n');
}
