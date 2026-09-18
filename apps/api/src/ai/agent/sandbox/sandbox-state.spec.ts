import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMINGS } from '../../domain/defaults.js';
import type { ComposedMessage } from '../agent.types.js';
import { emptyCard } from '../card/client-card.js';
import { addClientMessage, deliver, historyOf, markRead, recordTurn, startState } from './sandbox-state.js';
import type { DeliverInput } from './sandbox-state.js';
import type { SimState } from './sandbox.types.js';

const NOW = new Date('2026-09-17T12:00:00Z');
const mid = () => 0.5;

function message(text: string, blockKind: string | null = null, blockId: string | null = null): ComposedMessage {
  return { text, blockKind, blockId };
}

function delivery(state: SimState, overrides: Partial<DeliverInput> = {}): DeliverInput {
  return {
    state,
    now: NOW,
    stageAfter: state.stage,
    trigger: 'inbound',
    touchKind: null,
    messages: [message('Здравствуйте! Подскажите дату и место рождения')],
    diagnosticIds: [],
    exampleIds: [],
    hasDiscountBlock: false,
    timings: DEFAULT_TIMINGS,
    rng: mid,
    ...overrides,
  };
}

describe('песочница: состояние диалога', () => {
  it('новый диалог пуст, первая реплика клиента сбрасывает счётчик сообщений бота', () => {
    const state = startState(NOW, 'greeting');
    expect(state.messages).toHaveLength(0);
    expect(state.nextTouchAt).toBeNull();

    state.autoMessagesSinceClient = 3;
    const batch = addClientMessage(state, 'Привет!', NOW);
    expect(batch.role).toBe('client');
    expect(state.autoMessagesSinceClient).toBe(0);
    expect(state.lastClientMessageAt).toBe(NOW.toISOString());
    expect(historyOf(state.messages)).toHaveLength(1);
  });

  it('ответ клиенту двигает этап, копит счётчики и планирует касание', () => {
    const state = startState(NOW, 'greeting');
    addClientMessage(state, 'Привет', NOW);
    const touch = deliver(delivery(state, { stageAfter: 'collect_birth', exampleIds: ['example-1'] }));

    expect(state.stage).toBe('collect_birth');
    expect(state.messages.at(-1)?.role).toBe('bot');
    expect(state.autoMessagesSinceClient).toBe(1);
    expect(state.usedExampleIds).toEqual(['example-1']);
    // Бот поздоровался — повторное приветствие в тот же день чинит guard.
    expect(state.lastGreetingAt).toBe(NOW.toISOString());
    expect(touch?.kind).toBe('birth_nudge');
    expect(state.nextTouchKind).toBe('birth_nudge');
  });

  it('касание с диагностикой отмечает отправку, а прочтение — дату прочтения', () => {
    const state = startState(NOW, 'diagnostics');
    deliver(
      delivery(state, {
        stageAfter: 'post_diagnostics',
        trigger: 'touch',
        touchKind: 'diagnostics',
        messages: [message('Смотрите разбор', 'diagnostics', 'diag-1')],
        diagnosticIds: ['diag-1'],
      }),
    );

    expect(state.diagnosticsSentAt).toBe(NOW.toISOString());
    expect(state.diagnosticsReadAt).toBeNull();
    expect(state.sentBlockIds).toEqual(['diag-1']);
    // Касание не считается сообщением «подряд без ответа клиента».
    expect(state.autoMessagesSinceClient).toBe(0);
    expect(state.nextTouchKind).toBe('reengage');

    const readAt = new Date(NOW.getTime() + 3_600_000);
    expect(markRead(state, readAt)).toBe(true);
    expect(state.diagnosticsReadAt).toBe(readAt.toISOString());
    expect(markRead(state, readAt)).toBe(false);
  });

  it('напоминания считаются, а на последнем воронка закрывается', () => {
    const state = startState(NOW, 'reminders');
    state.remindersSent = DEFAULT_TIMINGS.maxReminders - 1;
    const touch = deliver(delivery(state, { stageAfter: 'closed_silent', trigger: 'touch', touchKind: 'reminder', messages: [message('Напоминаю о себе')] }));

    expect(state.remindersSent).toBe(DEFAULT_TIMINGS.maxReminders);
    expect(state.closedAt).toBe(NOW.toISOString());
    expect(touch).toBeNull();
    expect(state.nextTouchKind).toBeNull();
  });

  it('помним только последние шесть ходов — столько же смотрит Planner', () => {
    const state = startState(NOW, 'greeting', emptyCard());
    for (let i = 0; i < 8; i += 1) {
      recordTurn(state, { stageBefore: 'greeting', stageAfter: 'greeting', clientIntent: `ход ${i}`, trigger: 'inbound' });
    }
    expect(state.turnCount).toBe(8);
    expect(state.turns).toHaveLength(6);
    expect(state.turns[0].clientIntent).toBe('ход 2');
  });
});
