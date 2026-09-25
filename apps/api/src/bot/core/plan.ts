import { MILESTONE_TITLES, STAGES } from '../library/kinds.js';
import type { Gender, Milestone, Stage } from '../library/kinds.js';
import type { Timings } from '../library/timings.js';
import { isRead, milestoneAt, milestoneMessageId } from './history.js';
import {
  argumentsUsed,
  clientLanguage,
  hasBirthData,
  knownCategory,
  knownGender,
  nudgesSaid,
} from './memory.js';
import type {
  Analysis,
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

/** Что библиотека аккаунта может дать плану: тела вех и поддержка языка. */
export interface LibraryAvailability {
  /** Элемент вехи для клиента или null, если нечего отправить. */
  milestone(
    key: Milestone,
    query: { category: string | null; gender: Gender | null; language: string },
  ): PlanMilestone | null;
  /** Есть ли на языке хотя бы одна диагностика — иначе клиента ведёт менеджер. */
  supportsLanguage(language: string): boolean;
}

export interface PlanState {
  turnsWithoutNudge: number;
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

/** Считаются напоминаниями (лимит `maxReminders`); вехи в лимит не входят. */
const REMINDER_JOBS: readonly JobKind[] = [
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

const JOB_MILESTONE: Partial<Record<JobKind, Milestone>> = {
  diagnostic: 'diagnostic',
  offer: 'offer',
  prices: 'prices',
};

/**
 * Темы, которые раскрываются только вехой: до этапа `opensAt` на такой
 * пункт ответчик отвечает по формуле `hold`, не раскрывая. Если веха этого
 * хода сама отвечает на тему (`coveredBy`), формула не нужна — иначе ответ
 * повторит веху. Тему пункта называет анализатор (answerPoints[].topic) —
 * код текст не разбирает.
 */
const TOPIC_HOLDS: Partial<
  Record<AnswerTopic, { opensAt: Stage; hold: string; coveredBy?: Milestone }>
> = {
  price: {
    opensAt: 'prices',
    hold: 'конкретные цены не называй: скажи, что к стоимости вернёшься чуть позже, и продолжай разговор',
  },
  diagnostic: {
    opensAt: 'diagnostic',
    hold: 'результаты диагностики не пересказывай и не придумывай: скажи, что пришлёшь их, когда посмотришь',
    // Веха «ссылки» — это и есть «займусь диагностикой и вернусь».
    coveredBy: 'links',
  },
  practice: {
    opensAt: 'diagnostic',
    hold: 'ответь коротко и общо, без подробностей: о практиках подробно расскажешь после диагностики',
  },
};

/** Намерения, при которых клиент «увлечён разговором» и подталкивание можно отложить. */
const ENGAGED_INTENTS = new Set([
  'shares_story',
  'asks_about_practitioner',
  'asks_practice',
  'doubts',
  'objects',
]);

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
 * План хода (docs/agent-architecture.md, 3.4): передача → ответить → веха →
 * подталкивание → ограничения. Чистая функция: единственное место, которое
 * правится при изменении логики воронки, покрыто таблицами тестов.
 */
export function buildPlan(input: PlanInput): Plan {
  const { analysis, memory, stage, trigger, job, timings, state } = input;
  // Язык — из карточки: он «липкий» и уже обновлён анализом этого хода (memory.nextLanguage).
  const language = clientLanguage(memory.card);
  const intents = new Set(analysis?.intents ?? []);
  const said = memory.said;

  const plan: Plan = {
    handoff: null,
    answer: [],
    milestone: null,
    nudge: null,
    objection: null,
    constraints: {
      doNotRepeat: [],
      doNotMention: [],
      language,
      maxParts: 3,
      hook: true,
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

  // 2. Веха (ответы клиенту идут раньше неё в тексте, но какие темы можно раскрыть, зависит от вехи).
  const hasRequest =
    knownCategory(memory.card) !== null ||
    intents.has('shares_story') ||
    memory.facts.some((fact) => fact.kind === 'situation');
  const category = knownCategory(memory.card);
  const gender = knownGender(memory.card);
  const query = { category, gender, language };
  const jobMilestone = job ? JOB_MILESTONE[job.kind] : undefined;
  const due = (kind: JobKind) =>
    input.dueJobs.includes(kind) || job?.kind === kind;

  const wantMilestone = (key: Milestone): boolean => {
    switch (key) {
      case 'links': {
        // Данные рождения хотя бы раз просили: «займусь диагностикой» без них звучит странно.
        const askedBirth =
          hasBirthData(memory.card) || nudgesSaid(said, 'ask_birth_data') > 0;
        return (
          stage === 'intake' &&
          trigger === 'client' &&
          askedBirth &&
          (hasRequest || state.turnsInStage >= 2)
        );
      }
      case 'diagnostic': {
        if (stage !== 'links') return false;
        const elapsed = minutesBetween(milestoneAt(said, 'links'), input.now);
        const asked =
          intents.has('asks_diagnostic_status') &&
          elapsed >= timings.diagnosticDelayMin.min;
        return due('diagnostic') || asked;
      }
      case 'offer': {
        if (
          stage !== 'diagnostic' ||
          !isRead(input.history, milestoneMessageId(said, 'diagnostic'))
        )
          return false;
        if (due('offer')) return true;
        return (
          Boolean(analysis) &&
          (analysis!.interest >= 2 ||
            intents.has('asks_practice') ||
            intents.has('ready'))
        );
      }
      case 'prices': {
        if (
          stage !== 'offer' ||
          !isRead(input.history, milestoneMessageId(said, 'offer'))
        )
          return false;
        return (
          due('prices') || intents.has('asks_price') || intents.has('ready')
        );
      }
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
  let diagnosticBlocked = false;
  const wanted = target !== null && wantMilestone(target);
  if (
    wanted &&
    target === 'diagnostic' &&
    !hasBirthData(memory.card) &&
    nudgesSaid(said, 'birth_data_reminder') === 0
  ) {
    // Данных нет и напоминания ещё не было: сначала напоминание, диагностика подождёт.
    diagnosticBlocked = true;
  } else if (target && wanted) {
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

  // 3. Ответить клиенту — раньше всего остального. Тема, до которой разговор
  // ещё не дошёл (с учётом вехи этого хода), получает формулу ответа без раскрытия.
  const reached: Stage = plan.milestone ? plan.milestone.key : stage;
  plan.answer = (analysis?.answerPoints ?? [])
    .filter((point) => !point.skip)
    .map<PlannedAnswer>((point) => {
      const rule = TOPIC_HOLDS[point.topic];
      const covered =
        rule?.coveredBy !== undefined && plan.milestone?.key === rule.coveredBy;
      const held = rule && before(reached, rule.opensAt) && !covered;
      return { ...point, hold: held ? rule.hold : null };
    });
  const priceHeld = plan.answer.some(
    (point) => point.topic === 'price' && point.hold,
  );

  // 4. Подталкивание — одно, только если вехи в ходе нет.
  if (!plan.milestone) {
    if (diagnosticBlocked) {
      // Таймер диагностики сработал раньше данных: сначала напоминание,
      // лестница отсчитает диагностику заново от него (core/ladder.ts).
      plan.nudge = 'birth_data_reminder';
    } else if (trigger === 'schedule' && job) {
      plan.nudge = scheduledNudge(job.kind, stage, memory);
      if (plan.nudge && REMINDER_JOBS.includes(job.kind)) plan.reminders = 1;
    } else {
      plan.nudge = clientNudge(stage, memory, said, intents, state, timings);
    }
  }
  // Условие задания проверяется в момент срабатывания, а не при постановке.
  if (trigger === 'schedule' && !plan.milestone && !plan.nudge) {
    plan.idle = `задание «${job?.kind ?? '—'}» неактуально на этапе «${stage}»`;
    plan.goal = `Пропустить: ${plan.idle}.`;
    return plan;
  }

  // 5. Возражение: следующий подход из плейбука.
  if (analysis?.objection) {
    plan.objection = {
      category: analysis.objection,
      approach: argumentsUsed(said, analysis.objection),
    };
  }

  // 6. Ограничения.
  plan.constraints.doNotRepeat = [
    ...new Set(
      said
        .filter((entry) => entry.kind === 'nudge')
        .map((entry) => `вопрос: ${entry.key}`),
    ),
    ...said
      .filter((entry) => entry.kind === 'argument')
      .map((entry) => `аргумент: ${entry.key}`),
  ];
  // Цены своими словами — никогда: они уходят только телом вехи «стоимость».
  plan.constraints.doNotMention.push(
    priceHeld
      ? 'конкретные цены и суммы (сказать, что к стоимости вернёшься позже, — можно и нужно)'
      : 'цены и суммы своими словами',
  );
  if (before(stage, 'diagnostic') && plan.milestone?.key !== 'diagnostic') {
    plan.constraints.doNotMention.push('содержание и выводы диагностики');
  }
  if (before(stage, 'diagnostic'))
    plan.constraints.doNotMention.push('подробное описание практик и услуг');
  plan.constraints.hook = plan.milestone === null;
  // Первым после паузы человек пишет коротко: одно-два сообщения, не лекцию.
  if (trigger === 'schedule') plan.constraints.maxParts = 2;

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

/**
 * Подталкивание ступени по расписанию — только если оно ещё к месту:
 * напоминание о данных, пока их нет; вопрос-отклик, пока этап не сменился.
 */
function scheduledNudge(
  kind: JobKind,
  stage: Stage,
  memory: Memory,
): Nudge | null {
  const nudge = JOB_NUDGE[kind];
  if (!nudge) return null;
  switch (kind) {
    case 'birth_data_reminder':
      return stage === 'intake' && !hasBirthData(memory.card) ? nudge : null;
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

function clientNudge(
  stage: Stage,
  memory: Memory,
  said: Memory['said'],
  intents: Set<string>,
  state: PlanState,
  timings: Timings,
): Nudge | 'skip' | null {
  const hasRequest =
    knownCategory(memory.card) !== null ||
    memory.facts.some((fact) => fact.kind === 'situation');
  let candidate: Nudge | null = null;
  switch (stage) {
    case 'intake':
      if (
        !hasBirthData(memory.card) &&
        nudgesSaid(said, 'ask_birth_data') === 0
      )
        candidate = 'ask_birth_data';
      else if (!hasRequest && nudgesSaid(said, 'ask_request') < 2)
        candidate = 'ask_request';
      break;
    case 'links':
      candidate = null;
      break;
    case 'diagnostic':
      if (nudgesSaid(said, 'ask_feedback') === 0) candidate = 'ask_feedback';
      break;
    case 'offer':
      if (nudgesSaid(said, 'ask_offer_questions') === 0)
        candidate = 'ask_offer_questions';
      break;
    default:
      candidate = null;
  }
  if (!candidate) return null;
  // Право поговорить — но не в первом ходе: там приветствие и просьба о данных обязательны.
  const engaged = [...intents].some((intent) => ENGAGED_INTENTS.has(intent));
  const firstTurn = stage === 'intake' && state.turnsInStage === 0;
  if (
    engaged &&
    !firstTurn &&
    state.turnsWithoutNudge < timings.maxTurnsWithoutNudge
  )
    return 'skip';
  return candidate;
}

const NUDGE_TEXT: Record<Nudge, string> = {
  ask_birth_data: 'попроси дату и место рождения, привязав к разговору',
  birth_data_reminder:
    'мягко напомни, что для диагностики нужны дата и место рождения; если не пришлёт, сделаешь общий анализ',
  ask_request: 'спроси, что беспокоит и на какую сферу смотреть',
  ask_feedback:
    'спроси, что из диагностики откликнулось и что хотелось бы изменить',
  ask_offer_questions: 'спроси, всё ли понятно по практикам и какая ближе',
  unread_reminder: 'ненавязчиво напомни о себе одним коротким сообщением',
};

function describeGoal(plan: Plan, input: PlanInput, stage: Stage): string {
  const lines: string[] = [];
  if (input.trigger === 'schedule') {
    lines.push(
      'Ход по расписанию: ты пишешь первым, клиент ничего нового не писал. Не благодари и не отвечай — отвечать не на что; не утешай и не повторяй сочувствие из прошлых сообщений; паузу не комментируй. Не повторяй своих прошлых фраз («я рядом», «никуда не спешу») — пиши по-новому, опираясь на то, что знаешь о клиенте.',
    );
  }
  if (plan.answer.length > 0) {
    const items = plan.answer.map((point, index) => {
      const hold = point.hold ? ` — ${point.hold}` : '';
      return `${index + 1}) ${point.text}${hold}`;
    });
    lines.push(
      `Ответить (в этом порядке, раньше всего остального): ${items.join('; ')}.`,
    );
  } else if (input.trigger === 'client') {
    lines.push('Ответить: отреагируй на сообщение клиента по существу.');
  }
  if (
    stage === 'intake' &&
    input.state.turnsInStage === 0 &&
    input.trigger === 'client'
  ) {
    lines.push('Это первый ответ клиенту: поздоровайся.');
  }
  if (plan.milestone) {
    lines.push(
      `Веха: система отправит «${MILESTONE_TITLES[plan.milestone.key]}» (${plan.milestone.title}) сразу после твоих messages. Напиши только обрамление: вступление к ней в messages (после ответов клиенту) и, если нужно, одно короткое предложение в after_block. Во вступлении своих вопросов не задавай — клиент получит веху раньше, чем ответит; вопрос, если нужен, — в after_block. Текст вехи не пиши и не пересказывай.`,
    );
  } else if (plan.nudge === 'skip') {
    lines.push(
      'Шаг воронки: пропустить, клиент увлечён разговором. Закончи вопросом, который продолжает его тему.',
    );
  } else if (plan.nudge) {
    lines.push(
      `Шаг воронки (один, после ответов, вплетённый в разговор): ${NUDGE_TEXT[plan.nudge]}.`,
    );
  } else if (stage === 'links') {
    lines.push(
      'Шаг воронки: нет. Поддерживай ожидание — ты сейчас смотришь карту клиента; содержание диагностики не раскрывай.',
    );
  } else {
    lines.push(
      'Шаг воронки: нет. Поддержи разговор и закончи вопросом или приглашением.',
    );
  }
  if (plan.objection) {
    lines.push(
      plan.objection.approach === 0
        ? `Возражение «${plan.objection.category}»: отработай первым подходом из плейбука.`
        : `Возражение «${plan.objection.category}» повторяется (${plan.objection.approach + 1}-й раз): возьми другой подход, чем раньше.`,
    );
  }
  if (plan.constraints.doNotRepeat.length > 0)
    lines.push(`Не повторять: ${plan.constraints.doNotRepeat.join(', ')}.`);
  if (plan.constraints.doNotMention.length > 0)
    lines.push(`Не упоминать: ${plan.constraints.doNotMention.join(', ')}.`);
  return lines.join('\n');
}
