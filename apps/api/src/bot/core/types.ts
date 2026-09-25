import type { ClientFactKind } from '../entities/bot-client-fact.entity.js';
import type {
  Gender,
  HandoffReason,
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

/** Структурная карточка клиента — только то, по чему код принимает решения. */
export interface ClientCard {
  name?: CardField<string>;
  gender?: CardField<Gender>;
  birthDate?: CardField<string>;
  birthPlace?: CardField<string>;
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

export interface AnswerPoint {
  id: string;
  /** Что именно требует ответа, словами анализатора. */
  text: string;
  kind: 'question' | 'fact' | 'request' | 'emotion' | 'other';
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

/** Подталкивания — то, что готовит следующую веху (раздел 2.3). */
export const NUDGES = [
  'ask_birth_data',
  'birth_data_reminder',
  'ask_request',
  'ask_feedback',
  'ask_offer_questions',
  'unread_reminder',
] as const;
export type Nudge = (typeof NUDGES)[number];

/**
 * Виды заданий планировщика: ступени лестницы молчания (раздел 2.4) и
 * `reply` — повтор ответа клиенту после сбоя (раздел 10).
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
}

/** План хода — собирает код, LLM пишет текст под него (раздел 3.4). */
export interface Plan {
  handoff: { reason: HandoffReason; detail: string } | null;
  answer: PlannedAnswer[];
  milestone: PlanMilestone | null;
  nudge: Nudge | 'skip' | null;
  /** Подход из плейбука: категория и номер (0 — первый). */
  objection: { category: string; approach: number } | null;
  constraints: {
    doNotRepeat: string[];
    doNotMention: string[];
    language: string;
    maxParts: number;
    /** Закончить вопросом или приглашением. */
    hook: boolean;
  };
  /** Задание, из которого пришёл ход по расписанию, — чтобы закрыть его. */
  goal: string;
  /** Сколько напоминаний это добавляет к счётчику. */
  reminders: number;
  /**
   * Ходу по расписанию нечего сказать: задание устарело (веха уже ушла,
   * данные пришли, этап сменился). Ход закрывается без обращения к модели.
   */
  idle: string | null;
}

export interface WriterMeta {
  nudge: string | null;
  arguments: string[];
  unansweredAbout: string[];
  notes: string;
}

export interface Draft {
  /** Сообщения по порядку; при вехе — вступление к ней. */
  parts: string[];
  /** Короткое продолжение после тела вехи; без вехи идёт следом за parts. */
  after: string[];
  meta: WriterMeta;
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

export type TurnStatus = 'sent' | 'handoff' | 'skipped' | 'failed';

export interface TurnResult {
  turnId: string;
  status: TurnStatus;
  stage: Stage;
  sent: SentPart[];
  handoff: HandoffReason | null;
  error?: string;
}
