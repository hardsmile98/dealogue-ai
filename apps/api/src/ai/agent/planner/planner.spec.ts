import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS } from '../../domain/defaults.js';
import type { HistoryMessage, PlaybookSnapshot, SlotsSnapshot } from '../agent.types.js';
import { advanceStage, canJump, plan, stageAfterTurn, stageForTouch } from './planner.js';
import type { PlannerInput } from './planner.js';

const NOW = new Date('2026-09-17T12:00:00Z');

function msg(text: string, mediaKind: string | null = null): HistoryMessage {
  return { id: `m-${text}`, telegramMessageId: 1, role: 'client', text, sentAt: NOW, readAt: null, mediaKind, turnId: null };
}

const slots: SlotsSnapshot = {
  birthDate: null,
  birthDateText: null,
  birthPlace: null,
  age: null,
  gender: null,
  language: 'ru',
  requestCategoryKey: null,
  requestSummary: null,
  manualSlots: [],
};

const playbook: PlaybookSnapshot = {
  stage: 'greeting',
  goal: 'поздороваться',
  instructions: '',
  requiredBlockKinds: [],
  allowedBlockKinds: [],
  exampleKinds: ['greeting'],
  noQuestions: false,
  enabled: true,
};

function input(overrides: Partial<PlannerInput> = {}): PlannerInput {
  return {
    trigger: 'inbound',
    touchKind: null,
    mode: 'auto',
    stage: 'greeting',
    playbook,
    slots,
    batch: [msg('Здравствуйте, хочу разбор')],
    history: [],
    isMinor: false,
    autoMessagesSinceClient: 0,
    remindersSent: 0,
    diagnosticsSentAt: null,
    diagnosticsReadAt: null,
    lastClientMessageAt: null,
    limits: DEFAULT_LIMITS,
    blocks: [],
    recentTurns: [],
    now: NOW,
    ...overrides,
  };
}

describe('plan', () => {
  it('в auto формулирует задачу приветствия', () => {
    const verdict = plan(input());
    expect(verdict.kind).toBe('proceed');
    if (verdict.kind === 'proceed') {
      expect(verdict.task.text).toContain('дату и место рождения');
      expect(verdict.task.exampleKinds).toEqual(['greeting']);
    }
  });

  it('пропускает чат в режимах off и manager', () => {
    expect(plan(input({ mode: 'off' })).kind).toBe('skip');
    expect(plan(input({ mode: 'manager' })).kind).toBe('skip');
  });

  it('медиа и несовершеннолетний — передача до модели', () => {
    const media = plan(input({ batch: [msg('[Голосовое сообщение]', 'voice')] }));
    expect(media).toMatchObject({ kind: 'handoff', reason: 'media' });
    expect(plan(input({ isMinor: true }))).toMatchObject({ kind: 'handoff', reason: 'minor' });
  });

  it('лимит сообщений без ответа и разговор по кругу', () => {
    expect(plan(input({ trigger: 'manual', autoMessagesSinceClient: 4 }))).toMatchObject({ kind: 'handoff', reason: 'auto_limit' });
    const intent = 'клиент снова спрашивает, точно ли поможет и сколько ждать результата';
    const turns = [1, 2, 3].map(() => ({ stageBefore: 'offer' as const, stageAfter: 'offer' as const, clientIntent: intent, trigger: 'inbound' as const }));
    expect(plan(input({ stage: 'offer', recentTurns: turns }))).toMatchObject({ kind: 'handoff', reason: 'loop' });
  });

  it('обязательный блок без текста в библиотеке — пропуск с пометкой', () => {
    const verdict = plan(input({ stage: 'price', playbook: { ...playbook, stage: 'price', requiredBlockKinds: ['price'] } }));
    expect(verdict).toEqual({ kind: 'skip', detail: 'library_incomplete:price' });
  });

  it('касание диагностики требует блок diagnostics и задачу под запрос', () => {
    const blocks = [{ kind: 'diagnostics', id: 'd1', title: 'Диагностика', text: '…', source: 'diagnostic' as const }];
    const verdict = plan(input({ trigger: 'touch', touchKind: 'diagnostics', stage: 'diagnostics', batch: [], blocks, slots: { ...slots, requestSummary: 'развод' } }));
    expect(verdict.kind).toBe('proceed');
    if (verdict.kind === 'proceed') {
      expect(verdict.task.requiredBlockKinds).toEqual(['diagnostics']);
      expect(verdict.task.text).toContain('развод');
    }
    expect(plan(input({ trigger: 'touch', touchKind: 'diagnostics', stage: 'diagnostics', batch: [] }))).toEqual({ kind: 'skip', detail: 'library_incomplete:diagnostics' });
  });
});

describe('этапы', () => {
  const ctx = { birthKnown: false, requestKnown: false, hasDiscountBlock: false };

  it('advance идёт по воронке с учётом слотов', () => {
    expect(advanceStage('greeting', ctx)).toBe('collect_birth');
    expect(advanceStage('greeting', { ...ctx, birthKnown: true })).toBe('collect_request');
    expect(advanceStage('greeting', { ...ctx, birthKnown: true, requestKnown: true })).toBe('ack_request');
    expect(advanceStage('price', ctx)).toBe('reminders');
    expect(advanceStage('price', { ...ctx, hasDiscountBlock: true })).toBe('discount');
  });

  it('приветствие заканчивается первым сообщением бота даже при stay', () => {
    expect(stageAfterTurn('greeting', 'inbound', null, 'stay', ctx)).toBe('collect_birth');
    expect(stageAfterTurn('collect_birth', 'inbound', null, 'stay', { ...ctx, birthKnown: true })).toBe('collect_request');
    expect(stageAfterTurn('collect_request', 'inbound', null, 'stay', ctx)).toBe('collect_request')
    // Запрос уже понятен, но модель задала уточняющий вопрос — этап не торопим.
    expect(stageAfterTurn('collect_request', 'inbound', null, 'stay', { ...ctx, requestKnown: true })).toBe('collect_request')
    expect(stageAfterTurn('collect_request', 'inbound', null, 'advance', { ...ctx, requestKnown: true })).toBe('ack_request');
  });

  it('jump только вперёд и после диагностики', () => {
    expect(canJump('offer', 'price')).toBe(true);
    expect(canJump('collect_request', 'price')).toBe(false);
    expect(canJump('price', 'offer')).toBe(false);
    expect(stageAfterTurn('collect_request', 'inbound', null, 'jump:price', ctx)).toBe('collect_request');
    expect(stageAfterTurn('post_diagnostics', 'inbound', null, 'jump:price', ctx)).toBe('price');
  });

  it('касания задают этап сами', () => {
    expect(stageAfterTurn('diagnostics', 'touch', 'diagnostics', 'advance', ctx)).toBe('post_diagnostics');
    expect(stageAfterTurn('post_diagnostics', 'touch', 'reengage', 'advance', ctx)).toBe('post_diagnostics');
    expect(stageAfterTurn('offer', 'touch', 'price', 'stay', ctx)).toBe('price');
    expect(stageForTouch('offer_question')).toBe('offer');
  });
});
