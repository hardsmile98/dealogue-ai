import { describe, expect, it } from 'vitest';
import { saidEntries } from './said.js';
import type { SaidInput } from './said.js';
import type { FinalPart, SentPart } from './types.js';

const text = (value: string): FinalPart => ({ text: value, block: false });
const block = (value: string): FinalPart => ({ text: value, block: true });

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
    writerArguments: [],
    parts,
    sent: sentFor(parts),
    fallback: false,
    ...patch,
  };
}

describe('saidEntries', () => {
  it('ничего не ушло — ничего не сказано', () => {
    expect(
      saidEntries(
        input({
          plan: {
            milestone: { key: 'offer', itemId: 'x', title: 'Предложение' },
            nudge: 'ask_feedback',
            objection: null,
          },
          sent: [],
        }),
      ),
    ).toEqual([]);
  });

  it('веха — по сообщению с её телом; ссылки записываются вместе с вехой links', () => {
    const parts = [text('вступление'), block('тело'), text('после')];
    expect(
      saidEntries(
        input({
          plan: {
            milestone: { key: 'links', itemId: 'x', title: 'Ссылки' },
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
            milestone: { key: 'offer', itemId: 'x', title: 'Предложение' },
            nudge: null,
            objection: null,
          },
          parts,
          sent: sentFor(parts.slice(0, 1)),
        }),
      ),
    ).toEqual([]);
  });

  it('подталкивание, подход к возражению и аргументы — по последнему сообщению', () => {
    const parts = [text('раз'), text('два')];
    expect(
      saidEntries(
        input({
          plan: {
            milestone: null,
            nudge: 'ask_offer_questions',
            objection: { category: 'expensive', approach: 1 },
          },
          writerArguments: ['expensive:1', 'x'.repeat(80)],
          parts,
          sent: sentFor(parts),
        }),
      ),
    ).toEqual([
      { kind: 'nudge', key: 'ask_offer_questions', messageId: 101 },
      { kind: 'argument', key: 'expensive:1', messageId: 101 },
      { kind: 'argument', key: 'x'.repeat(64), messageId: 101 },
    ]);
  });

  it('«пропустить» подталкивание — не подталкивание', () => {
    expect(
      saidEntries(
        input({ plan: { milestone: null, nudge: 'skip', objection: null } }),
      ),
    ).toEqual([]);
  });

  it('запасная фраза: веха записывается, шаг воронки — нет', () => {
    const parts = [block('тело'), text('запасная')];
    expect(
      saidEntries(
        input({
          plan: {
            milestone: { key: 'diagnostic', itemId: 'x', title: 'Диагностика' },
            nudge: 'ask_feedback',
            objection: { category: 'later', approach: 0 },
          },
          writerArguments: ['later:0'],
          parts,
          sent: sentFor(parts),
          fallback: true,
        }),
      ),
    ).toEqual([{ kind: 'milestone', key: 'diagnostic', messageId: 100 }]);
  });
});
