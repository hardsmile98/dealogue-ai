import type { ClientFactKind } from '../entities/bot-client-fact.entity.js';
import type {
  Gender,
  HandoffReason,
  LibraryKind,
  Milestone,
  Stage,
} from '../library/kinds.js';

/**
 * Типы ядра хода (docs/agent-architecture.md, разделы 3–4). Чистые данные:
 * ими обмениваются сборщик, анализ, план, ответчик, проверка и доставка.
 */

export interface IncomingMessage {
  /** telegram_message_id или id сообщения песочницы. */
  id: number;
  text: string;
  mediaKind: string | null;
  sentAt: Date;
}

export interface HistoryMessage {
  id: number;
  direction: 'in' | 'out';
  text: string;
  mediaKind: string | null;
  sentAt: Date;
  /** Когда собеседник прочитал наше исходящее; у входящих null. */
  readAt: Date | null;
}

export interface CardField<T> {
  value: T;
  /** 0–1, уверенность анализатора. */
  confidence: number;
  sourceMessageId?: number;
}

/**
 * Почему даты рождения не будет: клиент не знает или не помнит её
 * (`unknown`) или не хочет называть (`refused`). Тогда агент больше не
 * просит дату.
 */
export const BIRTH_DATE_DECLINES = ['unknown', 'refused'] as const;
export type BirthDateDecline = (typeof BIRTH_DATE_DECLINES)[number];

/** Структурная карточка клиента — только то, по чему код принимает решения. */
export interface ClientCard {
  name?: CardField<string>;
  gender?: CardField<Gender>;
  birthDate?: CardField<string>;
  /**
   * Год рождения четырьмя цифрами: из даты с годом или из возраста, который
   * назвал клиент. Без года дата не считается полученной (агент просит год),
   * по нему проверяется возраст.
   */
  birthYear?: CardField<string>;
  /** Клиент сказал, что даты рождения не даст (`BIRTH_DATE_DECLINES`). */
  birthDateDeclined?: CardField<BirthDateDecline>;
  birthPlace?: CardField<string>;
  /** Сфера, которую назвал клиент (`SPHERES`), — запрос известен, даже если подкатегория не ясна. */
  sphere?: CardField<string>;
  category?: CardField<string>;
  language?: CardField<string>;
}

export interface ClientFact {
  id?: string;
  kind: ClientFactKind;
  text: string;
  confidence: number;
  sourceMessageId: number | null;
}

export type SaidKind = 'milestone' | 'nudge' | 'argument' | 'link';

export interface SaidEntry {
  kind: SaidKind;
  key: string;
  messageId: number | null;
  at: Date;
}

/** Память о клиенте целиком — то, что читают план и промпты. */
export interface Memory {
  card: ClientCard;
  facts: ClientFact[];
  summary: string;
  said: SaidEntry[];
}

export const RISK_FLAGS = [
  'aggression',
  'crisis',
  'wants_human',
  'asks_if_bot',
  'unclear',
] as const;
export type RiskFlag = (typeof RISK_FLAGS)[number];

export const INTENTS = [
  'asks_price',
  'asks_practice',
  'asks_about_practitioner',
  'asks_diagnostic_status',
  'shares_story',
  'ready',
  'chooses_option',
  'doubts',
  'objects',
  'smalltalk',
  'answers_question',
  'silent_ack',
] as const;
export type Intent = (typeof INTENTS)[number];

export const MOODS = [
  'calm',
  'sad',
  'anxious',
  'skeptical',
  'irritated',
  /** Горе: клиент пишет о смерти или потере близкого. */
  'grieving',
] as const;
export type Mood = (typeof MOODS)[number];

/**
 * О чём пункт ответа. По теме код решает, можно ли раскрывать её на текущем
 * этапе (цена — только вехой «стоимость», диагностика — вехой «диагностика»).
 */
export const ANSWER_TOPICS = [
  'price',
  'practice',
  'diagnostic',
  'practitioner',
  'client',
  'other',
] as const;
export type AnswerTopic = (typeof ANSWER_TOPICS)[number];

/**
 * Что это за пункт. По виду код решает, нужен ли на него отдельный ответ
 * или его закрывает сам шаг воронки (core/plan.ts): присланные данные,
 * приветствие, «ок» отдельного ответа не требуют.
 */
export const ANSWER_KINDS = [
  'question',
  'request',
  'objection',
  'story',
  'emotion',
  'data',
  'answer',
  /** Отзыв о том, что прислал практик: «всё совпало», «очень точно», «впечатлили». */
  'feedback',
  'greeting',
  'ack',
  'other',
] as const;
export type AnswerKind = (typeof ANSWER_KINDS)[number];

export interface AnswerPoint {
  id: string;
  /** Что именно сказал или спросил клиент, словами анализатора. */
  text: string;
  kind: AnswerKind;
  topic: AnswerTopic;
  /** Можно оставить без ответа («ок», стикер). */
  skip: boolean;
}

/** Результат анализатора после нормализации (core/analysis.ts). */
export interface Analysis {
  card: ClientCard;
  facts: ClientFact[];
  /** Тексты активных фактов, которым новые противоречат. */
  supersedes: string[];
  /** Пустая строка — резюме не обновилось, остаётся прежнее. */
  summary: string;
  /** Язык новых сообщений: код из LANGUAGES, 'other' или null, если по ним не понять («ок», эмодзи). */
  language: string | null;
  risk: RiskFlag[];
  intents: Intent[];
  /** Категория из OBJECTION_CATEGORIES. */
  objection: string | null;
  interest: number;
  mood: Mood;
  answerPoints: AnswerPoint[];
}

/**
 * Шаги воронки между вехами (раздел 2.3). У шага есть фраза из таблиц —
 * образец тона, по которому ответчик пишет своё сообщение. `start_analysis`
 * и `general_analysis` идут в одном ходе с вехой перед ней,
 * `ask_want_options` — после диагностики без своего вопроса в конце.
 * Вопросы знакомства: `ask_birth_data` (дата, место, сфера),
 * `ask_birth_date` (повторная просьба о дате рождения, а если сферы нет —
 * и о ней), `ask_sphere` (дата есть, сферы нет), `clarify_request`
 * (уточнение внутри сферы, «Вы состоите в отношениях?»); на молчание после
 * них — `birth_data_reminder` или `clarify_reminder`. `follow_up` —
 * напоминание по разговору, когда клиент уже отвечал после вехи.
 * `offer_intro` — короткий отклик на отзыв или рассказ перед вариантами,
 * `offer_after_silence` — связка к вариантам, которые уходят по таймеру после
 * суток молчания, `age_refusal` — вежливый отказ клиенту младше
 * `MIN_CLIENT_AGE` (решения владельца 01.10.2026).
 * `clarify_objection`, `pause_objection`, `release_objection` — не шаги
 * хода, а отметки в реестре: чем закончилась отработка возражения (раздел
 * 2.5).
 */
export const NUDGES = [
  'ask_birth_data',
  'ask_birth_date',
  'ask_sphere',
  'clarify_request',
  'birth_data_reminder',
  'clarify_reminder',
  'start_analysis',
  'general_analysis',
  'ask_want_options',
  'ask_feedback',
  'ask_offer_questions',
  'follow_up',
  'unread_reminder',
  'offer_intro',
  'offer_after_silence',
  'age_refusal',
  'clarify_objection',
  'pause_objection',
  'release_objection',
] as const;
export type Nudge = (typeof NUDGES)[number];

/**
 * Чем заканчивается отработка возражения (раздел 2.5):
 * - `question` — своим вопросом клиенту (уточнение);
 * - `step` — шагом воронки отдельным сообщением («рассказать, как
 *   проработать?»);
 * - `open` — ничем: без вопросов, дверь открыта («посоветуйтесь, я на
 *   связи»), клиент сам вернётся;
 * - `release` — клиента отпускаем после повторных возражений: без
 *   вопросов, и напоминаний на этапе больше нет.
 */
export type ObjectionEnd = 'question' | 'step' | 'open' | 'release';

/** Отметка в реестре для каждого исхода отработки, кроме шага (его записывает сам шаг). */
export const OBJECTION_MARKERS: Readonly<
  Record<Exclude<ObjectionEnd, 'step'>, Nudge>
> = {
  question: 'clarify_objection',
  open: 'pause_objection',
  release: 'release_objection',
};

/**
 * Виды заданий планировщика: ступени лестницы молчания (раздел 2.4),
 * `reply` — повтор ответа клиенту после сбоя (раздел 10) и `resume` —
 * досылка хода, текст которого уже собран и проверен (после перезапуска
 * API или сбоя отправки; `payload.turnId`). `offer` — варианты по таймеру
 * после суток молчания после диагностики (решение владельца 01.10.2026);
 * `prices` лестница не ставит (цены — только по реакции клиента): вид
 * остался ради старых заданий, план закрывает их без текста.
 */
export const JOB_KINDS = [
  'diagnostic',
  'birth_data_reminder',
  'return_question',
  'offer',
  'offer_nudge',
  'prices',
  'unread_reminder',
  'reply',
  'resume',
] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export interface PlannedAnswer extends AnswerPoint {
  /** Тему по этапу рано раскрывать — как ответить, не раскрывая; null — отвечать как есть. */
  hold: string | null;
}

export interface PlanMilestone {
  key: Milestone;
  /** id элемента библиотеки с телом вехи (диагностика выбирается по карточке). */
  itemId: string;
  title: string;
  /** Вид элемента: у «ссылок» без страниц в образе телом уходит `wait`. */
  kind: LibraryKind;
}

/** План хода — собирает код, LLM пишет текст под него (раздел 3.4). */
export interface Plan {
  handoff: { reason: HandoffReason; detail: string } | null;
  /**
   * После отправки хода чат уходит менеджеру с этой причиной, а агент больше
   * не пишет: вежливый отказ клиенту младше `MIN_CLIENT_AGE` или последняя
   * веха агента по настройке аккаунта (`limit_reached`). null — ход как обычно.
   */
  close: HandoffReason | null;
  /** Пункты, на которые нужен отдельный ответ; остальное закрывают шаг, веха и отработка возражения. */
  answer: PlannedAnswer[];
  /**
   * Что клиент рассказал (ситуация, чувства, ответ на уточнение) — на это
   * короткий отклик в начале сообщения шага, отдельного ответа нет.
   */
  react: string[];
  milestone: PlanMilestone | null;
  /** Шаг воронки этого хода. */
  nudge: Nudge | null;
  /**
   * Шаги, которые сообщение шага делает заодно: уточняющий вопрос внутри
   * просьбы о данных. В реестр сказанного идут вместе с `nudge`.
   */
  coveredNudges: Nudge[];
  /**
   * Фразы шага из таблиц — образцы тона и длины, а не шаблон; первая уходит
   * как есть, если текст ответчика не прошёл проверки. Пусто — шаг пишется
   * по задаче.
   */
  phrases: string[];
  /**
   * Отработка возражения (раздел 2.5): категория, номер подхода на этапе
   * (0 — первый), задача словами, чем заканчивается и образцы тона из
   * плейбука этапа.
   */
  objection: {
    category: string;
    approach: number;
    task: string;
    ends: ObjectionEnd;
    phrases: string[];
  } | null;
  constraints: {
    doNotRepeat: string[];
    doNotMention: string[];
    language: string;
    /** Сколько сообщений может написать ответчик (тело вехи не считается). */
    maxParts: number;
    /** Сколько вопросов клиенту может быть в тексте ответчика: шаг и уточнение по возражению. */
    maxQuestions: number;
  };
  /** План словами — для ответчика, проверяющего и журнала. */
  goal: string;
  /** Сколько напоминаний это добавляет к счётчику. */
  reminders: number;
  /**
   * Ходу по расписанию нечего сказать: задание устарело (веха уже ушла,
   * данные пришли, этап сменился). Ход закрывается без обращения к модели.
   */
  idle: string | null;
  /**
   * Клиент пишет о горе (`mood: grieving`): сообщение начинается с
   * соболезнования, без пересказа его слов. Нет у ходов до 01.10.
   */
  condolences?: boolean;
}

export interface Draft {
  /** Сообщения по порядку; тело вехи, если оно есть, код ставит после них. */
  parts: string[];
  /** Одно предложение ответчика о том, что он сделал, — только в журнал. */
  notes: string;
}

export interface ReviewViolation {
  code: string;
  severity: 'hard' | 'style';
  detail: string;
}

export interface Review {
  violations: ReviewViolation[];
}

export interface FinalPart {
  text: string;
  /** Часть — тело вехи, уходит одним сообщением после короткого «печатает». */
  block: boolean;
}

export interface SentPart {
  text: string;
  /** Тело вехи. */
  block: boolean;
  messageId: number;
  delayMs: number;
  typingMs: number;
  sentAt: Date;
}

export type TurnTrigger = 'client' | 'schedule';

/** Повторы после сбоя: когда ход упал впервые и какая это попытка. */
export interface RetryState {
  firstFailedAt: string;
  attempt: number;
}

export interface TurnJob {
  id: string;
  kind: JobKind;
  /** Есть у повтора после сбоя. */
  retry?: RetryState;
}

export interface TurnRequest {
  chatId: string;
  accountId: string;
  trigger: TurnTrigger;
  /** Сообщения хода клиента по порядку; у хода по расписанию пусто. */
  messages: IncomingMessage[];
  job: TurnJob | null;
  /** Поколение генерации на момент сборки хода. */
  generationSeq: number;
}

/** `interrupted` — остановка API: ход доведёт восстановление после старта. */
export type TurnStatus =
  'sent' | 'handoff' | 'skipped' | 'failed' | 'interrupted';

export interface TurnResult {
  turnId: string;
  status: TurnStatus;
  stage: Stage;
  sent: SentPart[];
  handoff: HandoffReason | null;
  error?: string;
}
