/**
 * Состояние песочницы: то же, что `ai_chat_state` в настоящем чате, но в
 * JSON и с виртуальными часами. Функции здесь меняют переданное состояние
 * на месте — шаг песочницы владеет своей копией и отдаёт её клиенту.
 *
 * Правила воронки не дублируются: этап считает `stageAfterFinished`,
 * следующее касание — `planNextTouch`; здесь только учёт того, что ушло.
 */

import type { ClientCard, FunnelStage, TimingsConfig, TouchKind, TurnTrigger } from '../../domain/types.js';
import type { ComposedMessage, HistoryMessage } from '../agent.types.js';
import { emptyCard } from '../card/client-card.js';
import { planNextTouch } from '../funnel/touch-planner.js';
import type { TouchPlan } from '../funnel/touch-planner.js';
import type { Rng } from '../lib/random.js';
import { startsWithGreeting } from '../lib/reply-text.js';
import type { SimMessage, SimState, SimTurnSummary } from './sandbox.types.js';

/** Сколько последних ходов помним — столько же смотрит Planner в настоящем чате. */
const RECENT_TURNS = 6;

export function startState(now: Date, stage: FunnelStage, card: ClientCard = emptyCard()): SimState {
  const at = now.toISOString();
  return {
    now: at,
    startedAt: at,
    stage,
    stageEnteredAt: at,
    card,
    messages: [],
    sentBlockIds: [],
    usedExampleIds: [],
    autoMessagesSinceClient: 0,
    remindersSent: 0,
    touchPostponedCount: 0,
    lastIntervalHours: null,
    diagnosticsSentAt: null,
    diagnosticsReadAt: null,
    lastGreetingAt: null,
    lastClientMessageAt: null,
    lastBotMessageAt: null,
    nextTouchKind: null,
    nextTouchAt: null,
    handoff: null,
    closedAt: null,
    turns: [],
    turnCount: 0,
  };
}

/** Переписка в том виде, в каком её видит модель. */
export function historyOf(messages: SimMessage[]): HistoryMessage[] {
  return messages.map((message, index) => ({
    id: `sim-${index}`,
    telegramMessageId: index + 1,
    role: message.role,
    text: message.text,
    sentAt: new Date(message.at),
    readAt: message.readAt ? new Date(message.readAt) : null,
    mediaKind: null,
    turnId: null,
  }));
}

/** Клиент написал: реплика в ленту, счётчик сообщений бота подряд сбрасывается. */
export function addClientMessage(state: SimState, text: string, now: Date): HistoryMessage {
  const at = now.toISOString();
  state.messages.push({ role: 'client', text, at, readAt: null, blockKind: null });
  state.lastClientMessageAt = at;
  state.autoMessagesSinceClient = 0;
  return historyOf(state.messages)[state.messages.length - 1];
}

/**
 * Клиент прочитал переписку. Диагностика считается прочитанной, когда
 * прочитаны все сообщения с момента её отправки (как в inbound-слушателе).
 */
export function markRead(state: SimState, now: Date): boolean {
  const at = now.toISOString();
  let changed = false;
  for (const message of state.messages) {
    if (message.role === 'bot' && !message.readAt) {
      message.readAt = at;
      changed = true;
    }
  }
  if (state.diagnosticsSentAt && !state.diagnosticsReadAt) state.diagnosticsReadAt = at;
  return changed;
}

export function recordTurn(state: SimState, summary: SimTurnSummary): void {
  state.turns = [...state.turns, summary].slice(-RECENT_TURNS);
  state.turnCount += 1;
}

export interface DeliverInput {
  state: SimState;
  now: Date;
  stageAfter: FunnelStage;
  trigger: TurnTrigger;
  touchKind: TouchKind | null;
  messages: ComposedMessage[];
  /** Шаблоны диагностики, предложенные ходу: по ним видно, что ушла диагностика. */
  diagnosticIds: string[];
  exampleIds: string[];
  hasDiscountBlock: boolean;
  timings: TimingsConfig;
  rng: Rng;
}

/**
 * Ход дошёл до клиента: сообщения в ленту, счётчики и следующее касание —
 * то же, что делает `TurnFinalizerService` после настоящей отправки.
 */
export function deliver(input: DeliverInput): TouchPlan | null {
  const { state, now, messages, timings, rng } = input;
  const at = now.toISOString();
  const isTouch = input.trigger === 'touch' || (input.trigger === 'manual' && input.touchKind !== null);
  const blockIds = messages.map((m) => m.blockId).filter((id): id is string => Boolean(id));

  for (const message of messages) {
    state.messages.push({ role: 'bot', text: message.text, at, readAt: null, blockKind: message.blockKind });
  }
  if (state.stage !== input.stageAfter) state.stageEnteredAt = at;
  state.stage = input.stageAfter;
  state.lastBotMessageAt = at;
  if (!isTouch) state.autoMessagesSinceClient += 1;
  state.sentBlockIds = [...new Set([...state.sentBlockIds, ...blockIds])];
  state.usedExampleIds = [...new Set([...state.usedExampleIds, ...input.exampleIds])];
  if (messages.some((m) => startsWithGreeting(m.text))) state.lastGreetingAt = at;
  if (input.diagnosticIds.some((id) => blockIds.includes(id))) {
    state.diagnosticsSentAt = at;
    state.diagnosticsReadAt = null;
  }
  if (isTouch && input.touchKind === 'reminder') state.remindersSent += 1;
  if (input.stageAfter === 'closed_silent') state.closedAt = at;
  state.touchPostponedCount = 0;

  const touch = planNextTouch({
    stage: input.stageAfter,
    trigger: input.trigger,
    touchKind: isTouch ? input.touchKind : null,
    birthKnown: Boolean(state.card.birthDate || state.card.birthDateText),
    remindersSent: state.remindersSent,
    lastIntervalHours: state.lastIntervalHours,
    diagnosticsReadAt: state.diagnosticsReadAt ? new Date(state.diagnosticsReadAt) : null,
    hasDiscountBlock: input.hasDiscountBlock,
    timings,
    now,
    rng,
  });
  setTouch(state, touch?.kind ?? null, touch?.at ?? null);
  if (touch?.intervalHours) state.lastIntervalHours = touch.intervalHours;
  return touch;
}

export function setTouch(state: SimState, kind: TouchKind | null, at: Date | null): void {
  state.nextTouchKind = kind;
  state.nextTouchAt = at ? at.toISOString() : null;
}
