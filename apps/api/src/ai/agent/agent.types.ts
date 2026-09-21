/**
 * Общие типы хода агента (раздел 4 ТЗ). Чистые структуры без Nest и
 * TypeORM — их используют Planner, Composer, Guard и тесты.
 */

import type { FunnelStage, Gender, HandoffReason, PhraseKind, TouchKind, TurnTrigger } from '../domain/types.js';

/** Сообщение переписки в том виде, в каком его видит модель. */
export interface HistoryMessage {
  id: string;
  telegramMessageId: number;
  role: 'client' | 'bot' | 'manager';
  text: string;
  sentAt: Date;
  /** Для наших исходящих — когда клиент прочитал. */
  readAt: Date | null;
  mediaKind: string | null;
  turnId: string | null;
}

/** Слоты клиента, известные на момент хода. */
export interface SlotsSnapshot {
  birthDate: string | null;
  birthDateText: string | null;
  birthPlace: string | null;
  age: number | null;
  gender: Gender | null;
  language: string;
  requestCategoryKey: string | null;
  requestSummary: string | null;
  /** Какие слоты правил менеджер — их не перезаписываем. */
  manualSlots: string[];
}

/** Дословный блок, который модель вставляет маркером `[[BLOCK:kind]]`. */
export interface LibraryBlock {
  /** Вид блока: `links`, `price`, `discount` … или `diagnostics` для шаблона диагностики. */
  kind: string;
  id: string;
  title: string;
  text: string;
  /** Откуда: фраза-блок или шаблон диагностики. */
  source: 'phrase' | 'diagnostic';
}

/** Один вариант блока: чем он помечен и что в нём написано. */
export interface BlockCandidate {
  id: string;
  title: string;
  text: string;
  categoryKey: string | null;
  gender: string | null;
  language: string;
}

/**
 * Варианты блока одного вида, уже перемешанные по весам. Конкретный выбирается
 * после ответа модели — по карточке, которую она вернула в этом ходе.
 */
export interface BlockPool {
  kind: string;
  source: 'phrase' | 'diagnostic';
  items: BlockCandidate[];
}

/** Образец тона из библиотеки (модель перефразирует). */
export interface LibraryExample {
  id: string;
  kind: PhraseKind;
  title: string;
  text: string;
}

export interface PlaybookSnapshot {
  stage: FunnelStage;
  goal: string;
  instructions: string;
  requiredBlockKinds: PhraseKind[];
  allowedBlockKinds: PhraseKind[];
  exampleKinds: PhraseKind[];
  noQuestions: boolean;
  enabled: boolean;
}

/** Задача хода, которую Planner формулирует для Composer. */
export interface TurnTask {
  trigger: TurnTrigger;
  touchKind: TouchKind | null;
  stage: FunnelStage;
  /** Человеческое описание задачи («клиент прислал дату, запроса нет → …»). */
  text: string;
  /** Блоки, которые обязательно вставить маркером. */
  requiredBlockKinds: string[];
  /** Блоки, которые можно вставить. */
  allowedBlockKinds: string[];
  exampleKinds: PhraseKind[];
  noQuestions: boolean;
}

/** Сообщение, которое предложил Composer, после разворачивания маркеров. */
export interface ComposedMessage {
  text: string;
  /** Вид блока, если сообщение — дословный блок. */
  blockKind: string | null;
  blockId: string | null;
}

export interface GuardViolation {
  check:
    | 'price_not_in_facts'
    | 'url_not_allowed'
    | 'block_not_allowed'
    | 'block_already_sent'
    | 'block_missing'
    | 'block_unknown'
    | 'bot_admission'
    | 'promise'
    | 'too_similar'
    | 'too_long'
    | 'question_forbidden'
    | 'empty'
    // Смысловой промах, который нашла вторая модель (guard/critic.ts).
    | 'critic';
  messageIndex: number | null;
  detail: string;
}

export interface GuardNote {
  /** Какая попытка: 1 — первый ответ модели, 2 — регенерация. */
  attempt: number;
  violations: GuardViolation[];
  /** Автоправки без регенерации («убрали повторное приветствие»). */
  fixes: string[];
}

/** Что решил Planner до вызова модели: остановиться или идти дальше. */
export type PlannerVerdict =
  | { kind: 'proceed'; task: TurnTask }
  | { kind: 'handoff'; reason: HandoffReason; detail: string }
  | { kind: 'skip'; detail: string };
