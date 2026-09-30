import { describe, expect, it } from 'vitest';
import { saidEntries } from './said.js';
import type { SaidInput } from './said.js';
import type { FinalPart, ObjectionEnd, Plan, SentPart } from './types.js';

const text = (value: string): FinalPart => ({ text: value, block: false });
const block = (value: string): FinalPart => ({ text: value, block: true });

const objection = (
  category: string,
  approach: number,
  ends: ObjectionEnd,
): NonNullable<Plan['objection']> => ({
  category,
  approach,
  task: '…',
  ends,
  phrases: [],
});

function sentFor(parts: readonly FinalPart[], firstId = 100): SentPart[] {
  return parts.map((part, index) => ({
    text: part.text,
    block: part.block,
    messageId: firstId + index,
    delayMs: 0,
    typingMs: 0,
    sentAt: new Date('2026-09-25T10:00:00Z'),
  }));
}

function input(patch: Partial<SaidInput>): SaidInput {
  const parts = patch.parts ?? [text('привет')];
  return {
    plan: { milestone: null, nudge: null, objection: null },
    parts,
    sent: sentFor(parts),
    fallback: false,
    ...patch,
  };
}

describe('saidEntries', () => {
  it('уточнение внутри просьбы о данных записывается тем же сообщением', () => {
    expect(
      saidEntries(
        input({
          plan: {
            milestone: null,
            nudge: 'ask_birth_data',
            coveredNudges: ['clarify_request'],
            objection: null,
          },
        }),
      ),
    ).toEqual([
      { kind: 'nudge', key: 'ask_birth_data', messageId: 100 },
      { kind: 'nudge', key: 'clarify_request', messageId: 100 },
    ]);
  });

  it('ничего не ушло — ничего не сказано', () => {
    expect(
      saidEntries(
        input({
          plan: {
            milestone: {
              key: 'offer',
              itemId: 'x',
              title: 'Предложение',
              kind: 'offer',
              asks: false,
            },
            nudge: 'ask_feedback',
            objection: null,
          },
          sent: [],
        }),
      ),
    ).toEqual([]);
  });

  it('веха — по сообщению с её телом; ссылки записываются вместе с вехой links', () => {
    const parts = [text('займусь анализом'), block('тело')];
    expect(
      saidEntries(
        input({
          plan: {
            milestone: {
              key: 'links',
              itemId: 'x',
              title: 'Ссылки',
              kind: 'links',
              asks: false,
            },
            nudge: null,
            objection: null,
          },
          parts,
          sent: sentFor(parts),
        }),
      ),
    ).toEqual([
      { kind: 'milestone', key: 'links', messageId: 101 },
      { kind: 'link', key: 'pages', messageId: 101 },
    ]);
  });

  it('тело вехи не ушло (ход прервали) — веха не доставлена', () => {
    const parts = [text('вступление'), block('тело')];
    expect(
      saidEntries(
        input({
          plan: {
            milestone: {
              key: 'offer',
              itemId: 'x',
              title: 'Предложение',
              kind: 'offer',
              asks: false,
            },
            nudge: null,
            objection: null,
          },
          parts,
          sent: sentFor(parts.slice(0, 1)),
        }),
      ),
    ).toEqual([]);
  });

  it('отработка — по первому сообщению ответчика, шаг — по последнему; не ушёл шаг — он не сделан', () => {
    const parts = [text('раз'), text('два')];
    const plan = {
      milestone: null,
      nudge: 'ask_want_options' as const,
      objection: objection('think_about_it', 1, 'step'),
    };
    expect(saidEntries(input({ plan, parts, sent: sentFor(parts) }))).toEqual([
      { kind: 'nudge', key: 'ask_want_options', messageId: 101 },
      { kind: 'argument', key: 'think_about_it:1', messageId: 100 },
    ]);
    // Клиент дописал после первой части: вопрос о вариантах не ушёл.
    expect(
      saidEntries(input({ plan, parts, sent: sentFor(parts.slice(0, 1)) })),
    ).toEqual([{ kind: 'argument', key: 'think_about_it:1', messageId: 100 }]);
    // Вместо текста ушла фраза шага: шаг сделан, возражение не отработано.
    const phrase = [text('Рассказать вам, как это можно проработать?')];
    expect(
      saidEntries(
        input({ plan, parts: phrase, sent: sentFor(phrase), stepOnly: true }),
      ),
    ).toEqual([{ kind: 'nudge', key: 'ask_want_options', messageId: 100 }]);
  });

  it('отработка возражения своим вопросом — отметка уточнения: ответ клиента будет ответом на него', () => {
    const parts = [text('Понимаю. А что сейчас происходит на самом деле?')];
    expect(
      saidEntries(
        input({
          plan: {
            milestone: null,
            nudge: null,
            objection: objection('not_resonate', 0, 'question'),
          },
          parts,
          sent: sentFor(parts),
        }),
      ),
    ).toEqual([
      { kind: 'argument', key: 'not_resonate:0', messageId: 100 },
      { kind: 'nudge', key: 'clarify_objection', messageId: 100 },
    ]);
    // Пауза и «отпустили» — свои отметки; ход до 30.09 без исхода — без отметки.
    const plan = (ends: ObjectionEnd | undefined) => ({
      milestone: null,
      nudge: null,
      objection: {
        ...objection('later', 0, 'open'),
        ends: ends as ObjectionEnd,
      },
    });
    const markers = (ends: ObjectionEnd | undefined) =>
      saidEntries(input({ plan: plan(ends), parts, sent: sentFor(parts) }))
        .filter((entry) => entry.kind === 'nudge')
        .map((entry) => entry.key);
    expect(markers('open')).toEqual(['pause_objection']);
    expect(markers('release')).toEqual(['release_objection']);
    expect(markers(undefined)).toEqual([]);
  });

  it('агент промолчал — ничего не сказано', () => {
    expect(saidEntries(input({ parts: [], sent: [] }))).toEqual([]);
  });

  it('запасная фраза: веха записывается, шаг воронки — нет', () => {
    const parts = [block('тело'), text('запасная')];
    expect(
      saidEntries(
        input({
          plan: {
            milestone: {
              key: 'diagnostic',
              itemId: 'x',
              title: 'Диагностика',
              kind: 'diagnostic',
              asks: false,
            },
            nudge: 'ask_feedback',
            objection: objection('later', 0, 'question'),
          },
          parts,
          sent: sentFor(parts),
          fallback: true,
        }),
      ),
    ).toEqual([{ kind: 'milestone', key: 'diagnostic', messageId: 100 }]);
  });
});
