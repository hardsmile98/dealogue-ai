import {
  MILESTONE_TITLES,
  MIN_CLIENT_AGE,
  OBJECTION_TITLES,
  STAGES,
  isObjectionCategory,
} from '../library/kinds.js';
import type {
  Gender,
  HandoffAfter,
  HandoffReason,
  LibraryKind,
  Milestone,
  Stage,
} from '../library/kinds.js';
import type { Timings } from '../library/timings.js';
import { describeGoal } from './goal.js';
import {
  milestoneAt,
  milestoneMessageId,
  repliedAfter,
  seenByClient,
} from './history.js';
import {
  birthDateSettled,
  clientLanguage,
  dataRequestsSent,
  diagnosticCategory,
  isUnderage,
  knownCategory,
  knownGender,
  knownSphere,
  lastIntakeQuestion,
  nudgesSaid,
  objectionPending,
  requestKnown,
  toldConcern,
} from './memory.js';
import type { IntakeQuestionNudge, ObjectionPending } from './memory.js';
import { RETURN_STEPS, objectionMove, objectionStage } from './objections.js';
import type { ObjectionMove } from './objections.js';
import { STEPS, isNudge, rotated, stepQuestions } from './steps.js';
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

export { needsWriter } from './goal.js';

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
   * Фразы вида из таблиц — образцы тона для шага воронки и отработки
   * возражения: на языке клиента (нет на нём — на русском), по категории и
   * полу, в порядке библиотеки.
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
  /** Последняя веха агента (настройка аккаунта): после неё чат уходит менеджеру. */
  handoffAfter: HandoffAfter;
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
 * Вехи по расписанию: диагностика (таймер после «займусь анализом» или
 * клиенту, который молчит на знакомстве) и варианты — клиент молчит почти
 * сутки после диагностики (решение владельца 01.10.2026, как в реальной
 * переписке). Цены уходят только по реакции клиента.
 */
const JOB_MILESTONE: Partial<Record<JobKind, Milestone>> = {
  diagnostic: 'diagnostic',
  offer: 'offer',
};

/** Пункты, на которые перед вариантами уместна фраза-отклик (`offer_intro`). */
const REACTABLE_KINDS: readonly AnswerPoint['kind'][] = [
  'story',
  'emotion',
  'feedback',
];

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
  // О работе подробно рассказывает веха «описание практик»; до неё — только общо.
  practice: {
    opensAt: 'offer',
    hold: 'ответь коротко и общо, без подробностей о практиках и вариантах работы',
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

/**
 * Намерения, которые прямо просят веху. Варианты — «расскажите»,
 * «сколько стоит», «готов», выбрал; цены — только цена, готовность и
 * выбор: вопрос о практиках после вариантов («как проходит чистка?») —
 * это вопрос, а не согласие.
 */
const EXPLICIT_INTENTS: Readonly<
  Record<'offer' | 'prices', readonly string[]>
> = {
  offer: ['asks_practice', 'asks_price', 'ready', 'chooses_option'],
  prices: ['asks_price', 'ready', 'chooses_option'],
};

/** Как клиент отреагировал на веху — по намерениям и пунктам анализа. */
interface Reaction {
  /** Прямо просит эту веху (`EXPLICIT_INTENTS`). */
  explicit(milestone: 'offer' | 'prices'): boolean;
  /** Возражает или сомневается. */
  resists: boolean;
  /**
   * Спросил или попросил о чём-то, кроме того, на что отвечает следующая
   * веха: «где вы живёте?», «расскажите про себя» — это не согласие на
   * варианты, на это отвечают.
   */
  asksBeyond(topic: AnswerTopic): boolean;
}

function reactionOf(analysis: Analysis): Reaction {
  const intents = new Set<string>(analysis.intents);
  return {
    explicit: (milestone) =>
      EXPLICIT_INTENTS[milestone].some((intent) => intents.has(intent)),
    resists:
      analysis.objection !== null ||
      intents.has('objects') ||
      intents.has('doubts') ||
      analysis.answerPoints.some((point) => point.kind === 'objection'),
    asksBeyond: (topic) =>
      analysis.answerPoints.some(
        (point) =>
          !point.skip &&
          (point.kind === 'question' || point.kind === 'request') &&
          point.topic !== topic,
      ),
  };
}

/**
 * План хода (docs/agent-architecture.md, 3.4): передача → веха →
 * возражение и шаг воронки → ответы → ограничения. Чистая функция:
 * единственное место логики воронки, покрыто таблицами тестов. Таблицы
 * шагов и возражений — `steps.ts` и `objections.ts`, план словами —
 * `goal.ts`.
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
    close: null,
    answer: [],
    react: [],
    milestone: null,
    nudge: null,
    coveredNudges: [],
    phrases: [],
    objection: null,
    constraints: {
      doNotRepeat: [],
      doNotMention: [],
      language,
      maxParts: 0,
      maxQuestions: 0,
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
  // Последняя веха агента уже ушла (настройку убавили или чат вернули
  // агенту руками): дальше ведёт менеджер. Клиент написал — ему нужен ответ;
  // созрело напоминание — молча, с ярлыком «агент закончил».
  if (stage !== 'prices' && !before(stage, input.handoffAfter)) {
    const last = MILESTONE_TITLES[input.handoffAfter];
    return trigger === 'client'
      ? handoff(
          plan,
          'reply_after_limit',
          `клиент ответил после последней вехи агента («${last}»)`,
        )
      : handoff(
          plan,
          'limit_reached',
          `агент дошёл до последней вехи («${last}»)`,
        );
  }
  if (!input.library.supportsLanguage(language)) {
    return handoff(
      plan,
      'no_language_materials',
      `нет материалов на языке «${language}»`,
    );
  }

  const category = diagnosticCategory(card);
  const gender = knownGender(card);
  const query = { category, gender, language };

  // Младше порога — вежливый отказ одним сообщением, после него чат уходит
  // менеджеру, агент больше не пишет (решение владельца 01.10.2026).
  if (isUnderage(card, input.now, MIN_CLIENT_AGE)) {
    plan.nudge = 'age_refusal';
    plan.close = 'underage';
    plan.phrases = stepPhrases('age_refusal', input, query);
    plan.constraints.maxParts = 1;
    plan.constraints.doNotMention.push(
      'цены и суммы своими словами',
      'содержание и выводы диагностики',
    );
    plan.goal = describeGoal(plan, {
      trigger,
      firstReply: false,
      memory,
      history: input.history,
      afterDiagnostic: !before(stage, 'diagnostic'),
    });
    return plan;
  }

  // 2. Веха — по реакции клиента; по расписанию — диагностика и варианты
  // после суток молчания.
  // Клиент рассказал о своей ситуации: сферу всё равно спрашиваем
  // (решение 30.09), но «не увидел вашего запроса» ему не говорим.
  const told = intents.has('shares_story') || toldConcern(memory);
  const clarify = clarifyPhrases(input, query);
  const intake =
    stage === 'intake' && trigger === 'client'
      ? intakeMove({
          memory,
          clarify: clarify.length > 0,
          acknowledged: analysis !== null && onlyAcknowledges(analysis),
        })
      : null;
  const reaction = analysis ? reactionOf(analysis) : null;
  // Где разговор после возражения: ответ на уточнение или «ок» после «я на
  // связи» — не согласие на следующую веху.
  const at = objectionStage(stage);
  const pending: ObjectionPending | null =
    at !== null ? objectionPending(said, at) : null;
  const jobMilestone = job ? JOB_MILESTONE[job.kind] : undefined;
  const due = (kind: JobKind) =>
    input.dueJobs.includes(kind) || job?.kind === kind;
  // Откликнулся на веху, не возражая и не спрашивая о другом, и разговор не
  // ждёт ответа на уточнение или паузу после возражения.
  const agrees = (topic: AnswerTopic) =>
    reaction !== null &&
    pending === null &&
    !reaction.resists &&
    !reaction.asksBeyond(topic);
  // Горе: варианты не шлём, пока клиент сам о них не попросит (в реальной
  // переписке после соболезнований человек не продаёт).
  const grieving = analysis?.mood === 'grieving';
  plan.condolences = grieving;
  const remindersLeft =
    input.state.remindersSent < timings.maxReminders && pending !== 'release';
  const diagnosticId = milestoneMessageId(said, 'diagnostic');

  const wantMilestone = (key: Milestone): boolean => {
    switch (key) {
      case 'links':
        // Вопросы знакомства кончились: ответ на последний, каким бы он ни
        // был, ведёт к «займусь анализом» и ссылкам.
        return intake?.links === true;
      case 'diagnostic': {
        // Молчит и после напоминания — диагностика по тому, что известно
        // (без сферы — общая), по лестнице. Клиент написал — он уже не
        // молчит: решают вопросы знакомства.
        if (stage === 'intake')
          return (
            trigger === 'schedule' &&
            job?.kind === 'diagnostic' &&
            lastIntakeQuestion(said) !== null
          );
        if (stage !== 'links') return false;
        const elapsed = minutesBetween(milestoneAt(said, 'links'), input.now);
        const asked =
          intents.has('asks_diagnostic_status') &&
          elapsed >= timings.diagnosticDelayMin.min;
        return due('diagnostic') || asked;
      }
      case 'offer':
        if (stage !== 'diagnostic') return false;
        // Клиент молчит почти сутки после диагностики и напоминания —
        // варианты по таймеру; отвечал после неё — нет, там свой разговор.
        if (trigger === 'schedule')
          return (
            job?.kind === 'offer' &&
            remindersLeft &&
            !repliedAfter(input.history, diagnosticId)
          );
        // Хочет узнать варианты или откликнулся без возражения и без
        // вопроса о другом («да», «ок», «хочу всё изменить») — варианты сразу.
        return (
          reaction !== null &&
          seenByClient(input.history, diagnosticId) &&
          (reaction.explicit('offer') ||
            (!grieving && agrees(MILESTONE_ANSWERS.offer)))
        );
      case 'prices':
        // Выбрал вариант, спросил цену, готов или ответил без возражения и
        // без вопроса («да, всё понятно») — цены сразу. «Дорого», «нет
        // денег» до цен — тоже цены: как в реальной переписке, клиенту
        // показывают стоимость, а решать ему.
        return (
          stage === 'offer' &&
          reaction !== null &&
          seenByClient(input.history, milestoneMessageId(said, 'offer')) &&
          (reaction.explicit('prices') ||
            agrees(MILESTONE_ANSWERS.prices) ||
            (analysis?.objection === 'expensive' && pending !== 'release'))
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
    // Вехи на языке клиента нет — вести его дальше нечем: менеджер.
    if (!item) {
      return handoff(
        plan,
        'no_language_materials',
        target === 'diagnostic'
          ? `нет диагностики для «${category ?? 'универсальная'}», ${gender ?? 'любой пол'}, ${language}`
          : `нет «${MILESTONE_TITLES[target]}» на языке «${language}»`,
      );
    }
    plan.milestone = item;
    // Последняя веха агента: после её отправки чат уходит менеджеру (после
    // цен — своей причиной, `prices_sent`).
    if (target === input.handoffAfter && target !== 'prices')
      plan.close = 'limit_reached';
  }

  // 3. Возражение: подход по этапу и повтору, образцы — из плейбука этапа.
  let move: ObjectionMove | null = null;
  if (analysis?.objection) {
    const chosen = objectionMove(stage, analysis.objection, said);
    move = chosen.move;
    plan.objection = {
      category: analysis.objection,
      approach: chosen.approach,
      task: move.task,
      ends: move.ends,
      phrases: chosen.playbook
        ? rotated(
            input.library.phrases(chosen.playbook, {
              ...query,
              category: analysis.objection,
            }),
            chosen.approach,
          )
        : [],
    };
  }

  // 4. Шаг воронки — один за ход. У вехи свой шаг: перед ссылками —
  // «займусь анализом»; перед общей диагностикой — «не увидел запроса».
  // После диагностики своего вопроса нет: она сама кончается вопросом.
  if (plan.milestone) {
    plan.nudge = milestoneNudge(plan.milestone, stage, category, told, {
      trigger,
      reacts:
        analysis?.answerPoints.some(
          (point) => !point.skip && REACTABLE_KINDS.includes(point.kind),
        ) ?? false,
      objection: plan.objection !== null,
    });
    // Варианты по таймеру заменяют второе напоминание — и считаются им.
    if (trigger === 'schedule' && plan.milestone.key === 'offer')
      plan.reminders = 1;
  } else if (trigger === 'schedule' && job) {
    plan.nudge = scheduledNudge(
      job.kind,
      stage,
      said,
      input.history,
      birthDateSettled(card),
    );
    if (plan.nudge && REMINDER_JOBS.includes(job.kind)) {
      // Лимит напоминаний и «отпустили» проверяются и здесь: повтор
      // упавшего напоминания лестница не пересчитывает.
      const allowed =
        input.state.remindersSent < timings.maxReminders &&
        pending !== 'release';
      if (allowed) plan.reminders = 1;
      else plan.nudge = null;
    }
  } else if (intake) {
    plan.nudge = intake.nudge;
    if (intake.withClarify) plan.coveredNudges = ['clarify_request'];
  } else if (trigger === 'client') {
    plan.nudge = clientNudge(stage, said, move, pending, grieving);
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
  }
  // Отработка не может обещать того, чего в ходе нет: уходит веха — она и
  // ответ, своего вопроса и паузы не нужно; шага нет — нечем «вести к
  // вариантам».
  if (plan.objection) {
    if (plan.milestone || (plan.objection.ends === 'step' && !plan.nudge))
      plan.objection.ends = 'open';
  }

  // 5. Ответить клиенту — только на то, что не закрывают шаг, веха и
  // отработка возражения; на рассказ — отклик в сообщении шага. Тема, до
  // которой разговор ещё не дошёл, получает формулу без раскрытия.
  const reached: Stage = plan.milestone ? plan.milestone.key : stage;
  const turn: TurnCoverage = {
    step: plan.nudge !== null,
    milestone: plan.milestone?.key ?? null,
    stage,
    objection: plan.objection !== null,
    answersQuestion: trigger === 'client' && pending === 'question',
  };
  // Цена раньше времени после диагностики — по смыслу фразы из таблиц
  // («стоимость — вопрос обсуждаемый, сначала поймём, какой результат
  // нужен»); до диагностики — «к стоимости вернусь позже»: расклад и так
  // бесплатный, обсуждать нечего.
  const priceDeflect = before(reached, 'diagnostic')
    ? undefined
    : input.library.phrases('price_deflect', { ...query, category: null })[0];
  for (const point of analysis?.answerPoints ?? []) {
    const mode = answerMode(point, turn);
    if (mode === 'react') {
      plan.react.push(point.text);
      continue;
    }
    if (mode !== 'answer') continue;
    const rule = TOPIC_HOLDS[point.topic];
    const hold =
      !rule || !before(reached, rule.opensAt)
        ? null
        : point.topic === 'price' && priceDeflect
          ? `цены не называй: скажи своими словами то же, что практик говорит так — «${priceDeflect}»`
          : rule.hold;
    plan.answer.push({ ...point, hold } satisfies PlannedAnswer);
  }
  const priceHeld = plan.answer.some(
    (point) => point.topic === 'price' && point.hold,
  );

  // 6. Ограничения. Ответчик пишет одно сообщение: ответ, отработка
  // возражения и шаг — вместе, как человек в реальной переписке (86% ответов
  // одним сообщением). Вопросы — только те, что просит план.
  plan.constraints.maxParts =
    plan.answer.length > 0 || plan.objection || plan.nudge ? 1 : 0;
  plan.constraints.maxQuestions =
    (plan.nudge ? stepQuestions(plan.nudge, plan) : 0) +
    (plan.objection?.ends === 'question' ? 1 : 0);
  plan.constraints.doNotRepeat = doNotRepeat(said, plan.nudge);
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

  plan.goal = describeGoal(plan, {
    trigger,
    firstReply:
      stage === 'intake' &&
      input.state.turnsInStage === 0 &&
      trigger === 'client',
    memory,
    history: input.history,
    afterDiagnostic: !before(stage, 'diagnostic'),
    told,
    mood: analysis?.mood ?? null,
    answersClarification: turn.answersQuestion,
  });
  return plan;
}

/** Шаги знакомства: в примерах им соответствует повод «нехватка данных». */
function handoff(plan: Plan, reason: HandoffReason, detail: string): Plan {
  plan.handoff = { reason, detail };
  plan.goal = `Передать менеджеру: ${detail}.`;
  return plan;
}

/**
 * «Уже было, не повторять»: сделанные шаги (кроме текущего, того, о чём он
 * напоминает, и отметок) и прошлые отработки возражений.
 */
function doNotRepeat(said: Memory['said'], nudge: Nudge | null): string[] {
  const reminded: readonly string[] = nudge ? (STEPS[nudge].reminds ?? []) : [];
  const steps = said
    .filter(
      (entry) =>
        entry.kind === 'nudge' &&
        entry.key !== nudge &&
        !reminded.includes(entry.key) &&
        isNudge(entry.key) &&
        !STEPS[entry.key].marker,
    )
    .map((entry) => STEPS[entry.key as Nudge].title);
  const argued = said
    .filter((entry) => entry.kind === 'argument')
    .map((entry) => {
      const category = entry.key.split(':')[0] ?? entry.key;
      return `твоя прошлая отработка возражения «${isObjectionCategory(category) ? OBJECTION_TITLES[category] : category}»`;
    });
  return [...new Set(steps), ...new Set(argued)];
}

interface TurnCoverage {
  /** В ходе есть шаг воронки — сообщение, к которому можно приложить отклик. */
  step: boolean;
  milestone: Milestone | null;
  stage: Stage;
  /** В ходе есть отработка возражения — она и отвечает на него. */
  objection: boolean;
  /** Клиент отвечает на уточнение по возражению. */
  answersQuestion: boolean;
}

/**
 * Что делать с пунктом клиента: отдельный ответ (`answer`), короткий
 * отклик в начале сообщения шага (`react`) или ничего (null).
 * - Приветствие, «ок», присланные данные — ничего: их закрывает шаг
 *   («всё записал» — лишнее).
 * - Рассказ и чувства: есть шаг — отклик в нём; нет ни шага, ни вехи —
 *   ответ; веха без шага — ничего: вехи уходят без обрамления.
 * - Короткий ответ на наш вопрос — ничего; на уточнение по возражению —
 *   как рассказ: клиент сказал, что у него на самом деле.
 * - Возражение и всё о нём закрывает его отработка.
 * - Вопрос, на который отвечает веха хода, и просьба о раскладе до
 *   диагностики (её закрывает шаг) — ничего; прочие вопросы — ответ.
 */
function answerMode(
  point: AnswerPoint,
  turn: TurnCoverage,
): 'answer' | 'react' | null {
  if (point.skip) return null;
  const story = (): 'answer' | 'react' | null =>
    turn.objection
      ? null
      : turn.step
        ? 'react'
        : turn.milestone
          ? null
          : 'answer';
  switch (point.kind) {
    case 'greeting':
    case 'ack':
    case 'data':
      return null;
    case 'answer':
      return turn.answersQuestion ? story() : null;
    case 'story':
    case 'emotion':
    case 'feedback':
      return story();
    case 'objection':
      return turn.objection ? null : 'answer';
    default:
      break;
  }
  // «Расскажите о практиках», «а цена?» — веха этого хода и есть ответ.
  if (turn.milestone && MILESTONE_ANSWERS[turn.milestone] === point.topic)
    return null;
  // Просьба о раскладе и «когда будет»: пока диагностика не ушла, на них отвечает шаг воронки.
  if (point.topic === 'diagnostic' && before(turn.stage, 'diagnostic'))
    return turn.step || turn.milestone ? null : 'answer';
  return 'answer';
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
  /** У названной сферы есть уточняющий вопрос, а подкатегория не ясна. */
  clarify: boolean;
  /** Клиент только подтвердил («ок», «сейчас пришлю») — ничего не прислал и не спросил. */
  acknowledged: boolean;
}): IntakeMove {
  const { card, said } = input.memory;
  const clarify = input.clarify && nudgesSaid(said, 'clarify_request') === 0;
  const needDate = !birthDateSettled(card);
  // Сферу узнаём всегда (решение 30.09): рассказ без сферы её не заменяет.
  const needSphere = !requestKnown(card);
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
  const sphere = knownSphere(input.memory.card);
  if (!sphere || knownCategory(input.memory.card)) return [];
  return input.library.phrases('ask_request', { ...query, category: sphere });
}

/**
 * Шаг вместе с вехой: перед ссылками, перед общей диагностикой, перед
 * вариантами. «Не увидел вашего запроса» — только если клиент и правда
 * ничего не рассказал. После диагностики шага нет: каждая диагностика
 * кончается своим вопросом или приглашением («Если вам интересно, могу
 * рассказать…»), второй вопрос следом — лишний (решение владельца 01.10.2026).
 * Перед вариантами (решения владельца 01.10.2026): по таймеру — связка «жду
 * обратную связь по раскладу», по ответу клиента с отзывом или рассказом —
 * короткая фраза-отклик; на возражение отвечает его отработка.
 */
function milestoneNudge(
  milestone: PlanMilestone,
  stage: Stage,
  category: string | null,
  told: boolean,
  turn: { trigger: TurnTrigger; reacts: boolean; objection: boolean },
): Nudge | null {
  if (milestone.key === 'links')
    return milestone.kind === 'links' ? 'start_analysis' : null;
  if (milestone.key === 'offer') {
    if (turn.trigger === 'schedule') return 'offer_after_silence';
    return turn.reacts && !turn.objection ? 'offer_intro' : null;
  }
  if (milestone.key !== 'diagnostic') return null;
  return stage === 'intake' && category === null && !told
    ? 'general_analysis'
    : null;
}

/**
 * Образцы шага из таблиц. У «займусь анализом» свой вариант, когда запроса
 * нет; у напоминаний каждый раз первым идёт следующий вариант — он же
 * уйдёт как есть, если текст ответчика не пройдёт проверки.
 */
function stepPhrases(
  nudge: Nudge,
  input: PlanInput,
  query: { category: string | null; gender: Gender | null; language: string },
): string[] {
  const step = STEPS[nudge];
  if (!step.kind) {
    const own = step.defaultPhrase?.[query.language] ?? step.defaultPhrase?.ru;
    return own ? [own] : [];
  }
  const find = (category: string | null) =>
    input.library.phrases(step.kind as LibraryKind, { ...query, category });
  let phrases: string[];
  if (nudge === 'start_analysis') {
    const preferred = query.category === null ? find('no_request') : [];
    phrases = preferred.length > 0 ? preferred : find(null);
  } else if (nudge === 'clarify_request' || nudge === 'clarify_reminder') {
    // Уточнение — фраза названной сферы.
    const sphere = knownSphere(input.memory.card);
    phrases = sphere ? find(sphere) : [];
  } else {
    phrases = find(step.category ?? null);
  }
  if (step.firstParagraph) {
    phrases = phrases
      .map((phrase) => phrase.split(/\n\s*\n/)[0]?.trim() ?? '')
      .filter(Boolean);
  }
  // Шаг-утверждение: образцы без вопроса, если такие есть («жду обратную
  // связь по раскладу», а не «что бы вы хотели изменить?»).
  if (step.statement) {
    const statements = phrases.filter((phrase) => !phrase.includes('?'));
    if (statements.length > 0) phrases = statements;
  }
  return step.rotate
    ? rotated(phrases, nudgesSaid(input.memory.said, nudge))
    : phrases;
}

/**
 * Шаг по расписанию — только если он ещё к месту: напоминание о данных,
 * пока клиент молчит на этапе знакомства; вопрос-отклик, пока этап не
 * сменился. Клиент уже отвечал после вехи этапа (спросил, возразил) —
 * отклик уже был, и напоминание идёт по разговору (`follow_up`), а не
 * «жду обратную связь по раскладу».
 */
function scheduledNudge(
  kind: JobKind,
  stage: Stage,
  said: Memory['said'],
  history: readonly HistoryMessage[],
  dateKnown: boolean,
): Nudge | null {
  const nudge = JOB_NUDGE[kind];
  if (!nudge) return null;
  switch (kind) {
    case 'birth_data_reminder': {
      // Одно напоминание после каждого вопроса знакомства: об уточнении —
      // тем же уточняющим вопросом, о данных и сфере — фразой из таблиц.
      if (stage !== 'intake') return null;
      // Дата есть — на молчание о сфере или уточнении уходит диагностика, без
      // напоминания (решение владельца 01.10.2026).
      if (dateKnown) return null;
      const question = lastIntakeQuestion(said);
      if (!question || question.reminded) return null;
      return question.nudge === 'clarify_request'
        ? 'clarify_reminder'
        : 'birth_data_reminder';
    }
    case 'return_question':
    case 'offer_nudge': {
      const at = kind === 'return_question' ? 'diagnostic' : 'offer';
      if (stage !== at) return null;
      return repliedAfter(history, milestoneMessageId(said, at))
        ? 'follow_up'
        : nudge;
    }
    case 'unread_reminder':
      return before(stage, 'prices') ? nudge : null;
    default:
      return null;
  }
}

/**
 * Сколько раз после диагностики агент сам, без возражения, спрашивает,
 * рассказать ли о вариантах, — клиент задаёт вопросы о другом. Дальше ему
 * только отвечают, чтобы не давить.
 */
const MAX_OPTIONS_QUESTIONS = 2;

/**
 * Шаг в ходе клиента без вехи после знакомства (вопросы знакомства —
 * `intakeMove`). Возвратный вопрос этапа — «рассказать, как проработать?»
 * после диагностики, «всё ли понятно по направлениям?» после вариантов:
 * - возражение — решает его отработка: вопрос идёт следом, только если она
 *   заканчивается шагом;
 * - ответ на уточнение по возражению — отклик и возвратный вопрос;
 * - пауза после возражения или клиента отпустили — только ответ;
 * - после диагностики на вопрос о другом — ответ и вопрос о вариантах, не
 *   больше `MAX_OPTIONS_QUESTIONS` раз за этап.
 */
function clientNudge(
  stage: Stage,
  said: Memory['said'],
  move: ObjectionMove | null,
  pending: ObjectionPending | null,
  grieving: boolean,
): Nudge | null {
  const at = objectionStage(stage);
  if (!at) return null;
  const back = RETURN_STEPS[at];
  if (move) return move.ends === 'step' ? back : null;
  // Горе: только слова поддержки, без вопросов о работе.
  if (grieving) return null;
  if (pending === 'question') return back;
  if (pending) return null;
  return at === 'diagnostic' && nudgesSaid(said, back) < MAX_OPTIONS_QUESTIONS
    ? back
    : null;
}
