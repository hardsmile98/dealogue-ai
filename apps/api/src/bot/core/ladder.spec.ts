import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMINGS } from '../library/timings.js';
import type { Stage } from '../library/kinds.js';
import { nextLadderStep, stableFraction } from './ladder.js';
import type { LadderInput } from './ladder.js';
import { unansweredIncoming } from './history.js';
import type { HistoryMessage, SaidEntry } from './types.js';

const T0 = new Date('2026-09-25T10:00:00Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
const minutesAfter = (date: Date, from: Date) =>
  (date.getTime() - from.getTime()) / 60_000;

const incoming = (id: number, minute: number): HistoryMessage => ({
  id,
  direction: 'in',
  text: '…',
  mediaKind: null,
  sentAt: at(minute),
  readAt: null,
});
const outgoing = (
  id: number,
  minute: number,
  readMinute: number | null,
): HistoryMessage => ({
  id,
  direction: 'out',
  text: '…',
  mediaKind: null,
  sentAt: at(minute),
  readAt: readMinute === null ? null : at(readMinute),
});
const said = (
  kind: SaidEntry['kind'],
  key: string,
  messageId: number,
  minute: number,
): SaidEntry => ({ kind, key, messageId, at: at(minute) });
const withBirth = {
  birthDate: { value: '04.01.1999', confidence: 1 },
  birthPlace: { value: 'Москва', confidence: 1 },
};

function input(stage: Stage, patch: Partial<LadderInput> = {}): LadderInput {
  return {
    chatId: 'chat-1',
    stage,
    card: {},
    said: [],
    history: [incoming(1, 0), outgoing(2, 1, 5)],
    remindersSent: 0,
    timings: DEFAULT_TIMINGS,
    ...patch,
  };
}

const within = (value: number, range: { min: number; max: number }) =>
  value >= range.min && value <= range.max;

describe('лестница молчания', () => {
  it('знакомство: напоминание о данных после прочтения просьбы, один раз', () => {
    const asked = [said('nudge', 'ask_birth_data', 2, 1)];
    const step = nextLadderStep(input('intake', { said: asked }));
    expect(step?.kind).toBe('birth_data_reminder');
    expect(
      within(
        minutesAfter(step!.runAt, at(5)),
        DEFAULT_TIMINGS.birthDataReminderMin,
      ),
    ).toBe(true);
    // Данные пришли, напоминание уже было, данных не просили — ступени нет.
    expect(
      nextLadderStep(input('intake', { said: asked, card: withBirth })),
    ).toBeNull();
    expect(
      nextLadderStep(
        input('intake', {
          said: [...asked, said('nudge', 'birth_data_reminder', 2, 1)],
        }),
      ),
    ).toBeNull();
    expect(nextLadderStep(input('intake'))).toBeNull();
  });

  it('ссылки: диагностика по таймеру даже без прочтения; после напоминания — от напоминания', () => {
    const links = [said('milestone', 'links', 2, 1)];
    const unread = [incoming(1, 0), outgoing(2, 1, null)];
    const step = nextLadderStep(
      input('links', { said: links, history: unread }),
    );
    expect(step?.kind).toBe('diagnostic');
    expect(
      within(
        minutesAfter(step!.runAt, at(1)),
        DEFAULT_TIMINGS.diagnosticDelayMin,
      ),
    ).toBe(true);
    const reminded = nextLadderStep(
      input('links', {
        said: [...links, said('nudge', 'birth_data_reminder', 3, 80)],
        history: [...unread, outgoing(3, 80, null)],
      }),
    );
    expect(
      within(
        minutesAfter(reminded!.runAt, at(80)),
        DEFAULT_TIMINGS.diagnosticDelayMin,
      ),
    ).toBe(true);
  });

  it('диагностика: вопрос-отклик, потом предложение через 12–16 ч; при лимите — сразу веха', () => {
    const base = [
      said('milestone', 'links', 2, 1),
      said('milestone', 'diagnostic', 2, 1),
    ];
    const first = nextLadderStep(input('diagnostic', { said: base }));
    expect(first?.kind).toBe('return_question');
    expect(
      within(
        minutesAfter(first!.runAt, at(5)),
        DEFAULT_TIMINGS.returnQuestionMin,
      ),
    ).toBe(true);
    const asked = nextLadderStep(
      input('diagnostic', {
        said: [...base, said('nudge', 'ask_feedback', 2, 1)],
      }),
    );
    expect(asked?.kind).toBe('offer');
    expect(
      within(minutesAfter(asked!.runAt, at(5)) / 60, DEFAULT_TIMINGS.stepHours),
    ).toBe(true);
    expect(
      nextLadderStep(input('diagnostic', { said: base, remindersSent: 3 }))
        ?.kind,
    ).toBe('offer');
  });

  it('предложение: вопрос, потом цены; после цен ступеней нет', () => {
    expect(nextLadderStep(input('offer'))?.kind).toBe('offer_nudge');
    expect(
      nextLadderStep(
        input('offer', { said: [said('nudge', 'ask_offer_questions', 2, 1)] }),
      )?.kind,
    ).toBe('prices');
    expect(nextLadderStep(input('prices'))).toBeNull();
  });

  it('непрочитанное: одно напоминание через сутки, дальше тишина; лимит напоминаний', () => {
    const history = [incoming(1, 0), outgoing(2, 1, null)];
    const step = nextLadderStep(input('diagnostic', { history }));
    expect(step?.kind).toBe('unread_reminder');
    expect(minutesAfter(step!.runAt, at(1))).toBe(24 * 60);
    const reminded = nextLadderStep(
      input('diagnostic', {
        history: [...history, outgoing(3, 1500, null)],
        said: [said('nudge', 'unread_reminder', 3, 1500)],
      }),
    );
    expect(reminded).toBeNull();
    expect(
      nextLadderStep(input('diagnostic', { history, remindersSent: 3 })),
    ).toBeNull();
  });

  it('последнее слово за клиентом или агент ещё не писал — ступеней нет', () => {
    expect(
      nextLadderStep(
        input('diagnostic', { history: [outgoing(2, 1, 5), incoming(3, 6)] }),
      ),
    ).toBeNull();
    expect(
      nextLadderStep(input('intake', { history: [incoming(1, 0)] })),
    ).toBeNull();
  });

  it('пересчёт с тем же состоянием даёт то же время; разные чаты — разное', () => {
    const state = input('offer');
    expect(nextLadderStep(state)?.runAt).toEqual(
      nextLadderStep({ ...state })?.runAt,
    );
    expect(stableFraction('a')).toBe(stableFraction('a'));
    const values = new Set(['a', 'b', 'c', 'd', 'e'].map(stableFraction));
    expect(values.size).toBe(5);
    for (const value of values) expect(value >= 0 && value < 1).toBe(true);
  });
});

describe('неотвеченные сообщения клиента', () => {
  it('входящие после последнего обработанного', () => {
    const history = [
      incoming(1, 0),
      outgoing(2, 1, 2),
      incoming(3, 3),
      incoming(4, 4),
    ];
    expect(unansweredIncoming(history, 1).map((message) => message.id)).toEqual(
      [3, 4],
    );
    expect(unansweredIncoming(history, 4)).toEqual([]);
  });
});
