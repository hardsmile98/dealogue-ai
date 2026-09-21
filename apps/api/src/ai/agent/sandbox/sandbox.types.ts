/**
 * Песочница (раздел 12.1 п. 7 ТЗ): моделирование диалога с клиентом от
 * первого сообщения до конца воронки, без отправки и без записи в базу.
 *
 * Состояние песочницы живёт у клиента и приходит в каждом запросе: сервер
 * ничего не помнит между шагами, поэтому перезапуск API не роняет сценарий,
 * а «очистить» — это просто забыть состояние в браузере.
 */

import type { ClientCard, FunnelStage, Gender, HandoffReason, TouchKind, TurnTrigger } from '../../domain/types.js';

/** Сообщение диалога песочницы. Время — по виртуальным часам сценария. */
export interface SimMessage {
  role: 'client' | 'bot' | 'manager';
  text: string;
  at: string;
  /** Клиент прочитал сообщение бота (влияет на таймер reengage). */
  readAt: string | null;
  /** Вид дословного блока, если сообщение — блок из библиотеки. */
  blockKind: string | null;
}

/** Ход песочницы глазами Planner'а: по нему он ловит хождение по кругу. */
export interface SimTurnSummary {
  stageBefore: FunnelStage;
  stageAfter: FunnelStage;
  clientIntent: string | null;
  trigger: TurnTrigger;
}

/** Всё, что песочница помнит о диалоге: воронка, карточка, переписка, таймеры. */
export interface SimState {
  /** Виртуальные часы сценария: их двигает шаг «клиент молчит». */
  now: string;
  startedAt: string;
  stage: FunnelStage;
  stageEnteredAt: string;
  card: ClientCard;
  messages: SimMessage[];
  sentBlockIds: string[];
  usedExampleIds: string[];
  autoMessagesSinceClient: number;
  remindersSent: number;
  touchPostponedCount: number;
  lastIntervalHours: number | null;
  diagnosticsSentAt: string | null;
  diagnosticsReadAt: string | null;
  lastGreetingAt: string | null;
  lastClientMessageAt: string | null;
  lastBotMessageAt: string | null;
  nextTouchKind: TouchKind | null;
  nextTouchAt: string | null;
  /** Чат передан менеджеру — бот молчит, пока его не вернут. */
  handoff: { reason: HandoffReason; detail: string; at: string } | null;
  closedAt: string | null;
  turns: SimTurnSummary[];
  turnCount: number;
}

/** Разбор одного хода: то, что в настоящем чате видно в журнале ходов. */
export interface SimTurnInfo {
  trigger: TurnTrigger;
  touchKind: TouchKind | null;
  stageBefore: FunnelStage;
  stageAfter: FunnelStage;
  task: string | null;
  analysis: Record<string, unknown> | null;
  guardNotes: Record<string, unknown>[];
  guardOk: boolean;
  examples: { kind: string; title: string }[];
  blocks: { kind: string; title: string }[];
  /** Похожие прошлые случаи, подмешанные в промпт (раздел 9.3 ТЗ). */
  similarCases: { source: string; outcome: string; clientText: string; answerText: string }[];
  usage: { tokensIn: number; tokensOut: number; durationMs: number; model: string };
  prompts: { system: string; user: string } | null;
}

/** Что случилось с касанием: сработало, запланировано, перенесено, снято. */
export type SimTouchState = 'fired' | 'planned' | 'postponed' | 'dropped';

/**
 * Событие ленты песочницы. Кроме реплик и ходов в ленту попадает то, что в
 * настоящем чате видно по событиям: смена этапа и судьба касаний. `note` —
 * просто строка посередине ленты («клиент молчит 20 ч»).
 */
export type SimEvent =
  | { kind: 'client'; at: string; text: string }
  | { kind: 'bot'; at: string; messages: { text: string; blockKind: string | null }[]; turn: SimTurnInfo }
  | { kind: 'silent'; at: string; text: string; turn: SimTurnInfo }
  | { kind: 'handoff'; at: string; reason: HandoffReason; text: string; turn: SimTurnInfo | null }
  | { kind: 'skip'; at: string; text: string }
  | { kind: 'stage'; at: string; from: FunnelStage; to: FunnelStage }
  | { kind: 'touch'; at: string; touchKind: TouchKind | null; touchAt: string | null; state: SimTouchState }
  | { kind: 'note'; at: string; text: string };

/** Слоты, которые можно задать на старте, чтобы начать не с чистого листа. */
export interface SimStartSlots {
  birthDate?: string | null;
  birthPlace?: string | null;
  gender?: Gender | null;
  language?: string | null;
  requestSummary?: string | null;
  requestCategoryKey?: string | null;
}

export type SimAction =
  /** Новый диалог: чистая песочница, при желании сразу с этапа и известных слотов. */
  | { kind: 'start'; stage?: FunnelStage | null; slots?: SimStartSlots | null }
  /** Клиент написал — бот отвечает так же, как ответил бы в чате. */
  | { kind: 'client'; text: string }
  /** Клиент молчит: двигаем часы и выполняем касания, срок которых наступил. */
  | { kind: 'wait'; minutes: number; read?: boolean }
  /** Ход по кнопке менеджера: конкретное касание или просто следующий шаг. */
  | { kind: 'touch'; touchKind?: TouchKind | null }
  /** Вернуть боту чат, который он передал менеджеру. */
  | { kind: 'resume' };

export interface SimRequest {
  action: SimAction;
  /** Состояние прошлого шага; для `start` не нужно. */
  state?: SimState | null;
}

export interface SimResponse {
  state: SimState;
  /** Что произошло на этом шаге — дописывается в конец ленты. */
  events: SimEvent[];
}
