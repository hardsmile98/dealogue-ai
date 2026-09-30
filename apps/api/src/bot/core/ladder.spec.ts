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
function input(stage: Stage, patch: Partial<LadderInput> = {}): LadderInput {
  return {
    chatId: 'chat-1',
    stage,
    said: [],
    history: [incoming(1, 0), outgoing(2, 1, 5)],
    lastHandledMessageId: 1,
    remindersSent: 0,
    timings: DEFAULT_TIMINGS,
    ...patch,
  };
}

const within = (value: number, range: { min: number; max: number }) =>
  value >= range.min && value <= range.max;

describe('лестница молчания', () => {
  it('знакомство: клиент молчит — одно напоминание о данных, потом общая диагностика', () => {
    const asked = [said('nudge', 'ask_birth_data', 2, 1)];
    const step = nextLadderStep(input('intake', { said: asked }));
    expect(step?.kind).toBe('birth_data_reminder');
    expect(
      within(
        minutesAfter(step!.runAt, at(5)),
        DEFAULT_TIMINGS.birthDataReminderMin,
      ),
    ).toBe(true);
    // Напоминание прочитано, клиент молчит — общая диагностика.
    const general = nextLadderStep(
      input('intake', {
        said: [...asked, said('nudge', 'birth_data_reminder', 3, 80)],
        history: [incoming(1, 0), outgoing(2, 1, 5), outgoing(3, 80, 90)],
      }),
    );
    expect(general?.kind).toBe('diagnostic');
    expect(
      within(
        minutesAfter(general!.runAt, at(90)),
        DEFAULT_TIMINGS.diagnosticDelayMin,
      ),
    ).toBe(true);
    // Ничего не просили — ступени нет.
    expect(nextLadderStep(input('intake'))).toBeNull();
  });

  it('знакомство: после вопроса о сфере и после уточнения — снова одно напоминание, потом диагностика', () => {
    // Данные пришли без сферы (напоминание о них уже было) — спросили сферу.
    const sphereAsked = [
      said('nudge', 'ask_birth_data', 2, 1),
      said('nudge', 'birth_data_reminder', 3, 80),
      said('nudge', 'ask_sphere', 5, 100),
    ];
    const history = [
      incoming(1, 0),
      outgoing(2, 1, 5),
      outgoing(3, 80, 90),
      incoming(4, 95),
      outgoing(5, 100, 101),
    ];
    const reminder = nextLadderStep(
      input('intake', {
        said: sphereAsked,
        history,
        lastHandledMessageId: 4,
        remindersSent: 1,
      }),
    );
    expect(reminder?.kind).toBe('birth_data_reminder');
    expect(reminder?.reason).toContain('вопрос о сфере');
    expect(
      within(
        minutesAfter(reminder!.runAt, at(101)),
        DEFAULT_TIMINGS.birthDataReminderMin,
      ),
    ).toBe(true);

    // Уточнение в первом же ответе (дата, место и сфера пришли сразу).
    const clarified = [said('nudge', 'clarify_request', 2, 1)];
    expect(nextLadderStep(input('intake', { said: clarified }))?.kind).toBe(
      'birth_data_reminder',
    );
    const after = nextLadderStep(
      input('intake', {
        said: [...clarified, said('nudge', 'clarify_reminder', 3, 80)],
        history: [incoming(1, 0), outgoing(2, 1, 5), outgoing(3, 80, 90)],
        remindersSent: 1,
      }),
    );
    expect(after?.kind).toBe('diagnostic');

    // Уточнение вошло в просьбу о данных — это один вопрос, не два.
    const merged = [
      said('nudge', 'clarify_request', 2, 1),
      said('nudge', 'ask_birth_data', 2, 1),
    ];
    const one = nextLadderStep(
      input('intake', {
        said: [...merged, said('nudge', 'birth_data_reminder', 3, 80)],
        history: [incoming(1, 0), outgoing(2, 1, 5), outgoing(3, 80, 90)],
        remindersSent: 1,
      }),
    );
    expect(one?.kind).toBe('diagnostic');
  });

  it('ссылки: диагностика по таймеру даже без прочтения', () => {
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
  });

  it('после диагностики — только напоминания: первое быстро, следующие через 12–16 ч; вариантов по таймеру нет', () => {
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
    const second = nextLadderStep(
      input('diagnostic', {
        said: [...base, said('nudge', 'ask_feedback', 2, 1)],
        remindersSent: 1,
      }),
    );
    expect(second?.kind).toBe('return_question');
    expect(
      within(
        minutesAfter(second!.runAt, at(5)) / 60,
        DEFAULT_TIMINGS.stepHours,
      ),
    ).toBe(true);
    // Лимит кончился — агент ждёт клиента.
    expect(
      nextLadderStep(input('diagnostic', { said: base, remindersSent: 3 })),
    ).toBeNull();
  });

  it('клиент отвечал после диагностики и замолчал — первое напоминание не быстро, а через 12–16 ч', () => {
    const step = nextLadderStep(
      input('diagnostic', {
        said: [
          said('milestone', 'links', 2, 1),
          said('milestone', 'diagnostic', 2, 1),
          said('argument', 'not_resonate:0', 4, 20),
          said('nudge', 'clarify_objection', 4, 20),
        ],
        history: [
          incoming(1, 0),
          outgoing(2, 1, 5),
          incoming(3, 10),
          outgoing(4, 20, 25),
        ],
        lastHandledMessageId: 3,
      }),
    );
    expect(step?.kind).toBe('return_question');
    expect(step?.reason).toContain('отвечал после диагностики');
    expect(
      within(minutesAfter(step!.runAt, at(25)) / 60, DEFAULT_TIMINGS.stepHours),
    ).toBe(true);
  });

  it('после вариантов — только напоминания, цены по таймеру не уходят', () => {
    expect(nextLadderStep(input('offer'))?.kind).toBe('offer_nudge');
    expect(
      nextLadderStep(
        input('offer', {
          said: [said('nudge', 'ask_offer_questions', 2, 1)],
          remindersSent: 2,
        }),
      )?.kind,
    ).toBe('offer_nudge');
    expect(nextLadderStep(input('offer', { remindersSent: 3 }))).toBeNull();
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
      nextLadderStep(
        input('intake', { history: [incoming(1, 0)], lastHandledMessageId: 0 }),
      ),
    ).toBeNull();
  });

  it('агент промолчал на «ок» — лестница идёт дальше, молчание считается с ответа клиента', () => {
    const links = [said('milestone', 'links', 2, 1)];
    const history = [incoming(1, 0), outgoing(2, 1, 5), incoming(3, 6)];
    // Ссылки: диагностика по-прежнему по таймеру от ссылок.
    expect(
      nextLadderStep(
        input('links', { said: links, history, lastHandledMessageId: 3 }),
      )?.kind,
    ).toBe('diagnostic');
    // Предложение прочитано до «ок»: вопрос после него — от «ок».
    const offer = nextLadderStep(
      input('offer', { history, lastHandledMessageId: 3 }),
    );
    expect(offer?.kind).toBe('offer_nudge');
    expect(
      within(minutesAfter(offer!.runAt, at(6)) / 60, DEFAULT_TIMINGS.stepHours),
    ).toBe(true);
    // Пока «ок» не обработан — ждём ответа агента.
    expect(nextLadderStep(input('links', { said: links, history }))).toBeNull();
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
