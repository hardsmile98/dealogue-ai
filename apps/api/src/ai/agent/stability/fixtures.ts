/**
 * Регрессионные фикстуры (раздел 15 ТЗ): обезличенные диалоги с тем, что
 * код должен был решить — передать менеджеру, промолчать, вести дальше.
 * Фикстуры лежат в `fixtures/*.json`, прогоняет их `regression.spec.ts`,
 * пополняет — `npm run ai:fixtures` из реальных ходов.
 *
 * Модель здесь не вызывается: проигрывается только детерминированная часть
 * (Planner + стоп-триггеры по записанному `analysis`), поэтому прогон
 * быстрый и не зависит от сети.
 */

import { DEFAULT_GUARD, DEFAULT_LIMITS } from '../../domain/defaults.js';
import type { ChatMode, FunnelStage, HandoffReason, TouchKind, TurnTrigger } from '../../domain/types.js';
import type { HistoryMessage, PlaybookSnapshot, SlotsSnapshot } from '../agent.types.js';
import { plan } from '../planner/planner.js';
import type { RecentTurnSummary } from '../planner/planner.js';
import { stopReason } from '../planner/stop-reason.js';

export interface FixtureMessage {
  role: 'client' | 'bot' | 'manager';
  text: string;
  mediaKind?: string | null;
}

/** Записанный ответ модели — то, на что реагирует код. */
export interface FixtureAnalysis {
  escalation: { reason: HandoffReason; note: string | null } | null;
  language: string;
  confidence: number;
  clientIntent: string | null;
  send: boolean;
}

export interface RegressionFixture {
  id: string;
  title: string;
  stage: FunnelStage;
  trigger: TurnTrigger;
  touchKind?: TouchKind | null;
  mode?: ChatMode;
  /** История до пачки (роли как в промпте). */
  history?: FixtureMessage[];
  /** Новые сообщения клиента, на которые отвечаем. */
  client: FixtureMessage[];
  isMinor?: boolean;
  /** Сколько сообщений бот написал подряд без ответа клиента. */
  autoMessagesSinceClient?: number;
  /** Языки, на которых в библиотеке есть тексты; по умолчанию только русский. */
  libraryLanguages?: string[];
  guardOk?: boolean;
  analysis?: FixtureAnalysis | null;
  /** Предыдущие ходы — для проверки «разговора по кругу». */
  recentTurns?: RecentTurnSummary[];
  expected: FixtureExpectation;
}

export interface FixtureExpectation {
  kind: 'handoff' | 'silent' | 'proceed' | 'skip';
  reason?: HandoffReason | null;
}

export interface ReplayResult {
  kind: FixtureExpectation['kind'];
  reason: HandoffReason | null;
  detail: string;
}

const PLAYBOOK: PlaybookSnapshot = {
  stage: 'greeting',
  goal: 'цель этапа',
  instructions: '',
  requiredBlockKinds: [],
  allowedBlockKinds: [],
  exampleKinds: [],
  noQuestions: false,
  enabled: true,
};

/** Прогон фикстуры через детерминированную часть хода. */
export function replay(fixture: RegressionFixture): ReplayResult {
  const now = new Date('2026-09-17T12:00:00Z');
  const batch = fixture.client.map((m, index) => toHistory(m, index, now));
  const history = (fixture.history ?? []).map((m, index) => toHistory(m, index - 100, now));

  const verdict = plan({
    trigger: fixture.trigger,
    touchKind: fixture.touchKind ?? null,
    mode: fixture.mode ?? 'auto',
    stage: fixture.stage,
    playbook: { ...PLAYBOOK, stage: fixture.stage },
    slots: SLOTS,
    batch,
    history,
    isMinor: fixture.isMinor ?? false,
    autoMessagesSinceClient: fixture.autoMessagesSinceClient ?? 0,
    remindersSent: 0,
    diagnosticsSentAt: null,
    diagnosticsReadAt: null,
    lastClientMessageAt: batch.length > 0 ? batch[batch.length - 1].sentAt : null,
    limits: DEFAULT_LIMITS,
    blocks: [],
    recentTurns: fixture.recentTurns ?? [],
    now,
  });
  if (verdict.kind === 'handoff') return { kind: 'handoff', reason: verdict.reason, detail: verdict.detail };
  if (verdict.kind === 'skip') return { kind: 'skip', reason: null, detail: verdict.detail };

  const analysis = fixture.analysis;
  if (!analysis) return { kind: 'proceed', reason: null, detail: verdict.task.text };

  const stop = stopReason({
    isMinor: fixture.isMinor ?? false,
    analysis,
    language: analysis.language,
    libraryLanguages: fixture.libraryLanguages ?? ['ru'],
    guardOk: fixture.guardOk ?? true,
    guardRemark: null,
    confidenceThreshold: DEFAULT_GUARD.confidenceThreshold,
  });
  if (stop) return { kind: 'handoff', reason: stop.reason, detail: stop.detail };
  if (!analysis.send) return { kind: 'silent', reason: null, detail: 'Модель решила промолчать' };
  return { kind: 'proceed', reason: null, detail: verdict.task.text };
}

/**
 * Обезличивание (раздел 15 ТЗ): из фикстур уходит всё, по чему можно узнать
 * человека — имена, телефоны, ники, почта, ссылки, даты рождения.
 */
export function anonymize(text: string, names: string[] = []): string {
  let result = text;
  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed.length < 3) continue;
    result = result.replace(new RegExp(escapeRegExp(trimmed), 'gi'), '{имя}');
  }
  return result
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '{почта}')
    .replace(/https?:\/\/[^\s,;]+/gi, '{ссылка}')
    .replace(/@[a-z0-9_]{4,}/gi, '{ник}')
    .replace(/\+?\d[\d\s()-]{8,}\d/g, '{телефон}')
    .replace(/\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})\b/g, '{дата}')
    .replace(/\d{1,2}\s+(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-яё]*\s+\d{4}/gi, '{дата}');
}

/** Ход из базы → фикстура. Ожидание берём из того, чем ход кончился. */
export function toFixture(input: {
  id: string;
  stage: FunnelStage | null;
  trigger: TurnTrigger;
  touchKind: TouchKind | null;
  outcome: string;
  clientText: string;
  history: FixtureMessage[];
  analysis: Record<string, unknown> | null;
  handoffReason: HandoffReason | null;
  names: string[];
}): RegressionFixture {
  const analysis = readAnalysis(input.analysis);
  const client = input.clientText
    .split('\n')
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({ role: 'client' as const, text: anonymize(text, input.names) }));
  const expected: FixtureExpectation =
    input.outcome === 'handoff'
      ? { kind: 'handoff', reason: analysis?.escalation?.reason ?? input.handoffReason ?? null }
      : input.outcome === 'silent'
        ? { kind: 'silent' }
        : { kind: 'proceed' };
  return {
    id: input.id,
    title: `${input.trigger}${input.touchKind ? `/${input.touchKind}` : ''} на этапе ${input.stage ?? 'greeting'}`,
    stage: input.stage ?? 'greeting',
    trigger: input.trigger,
    touchKind: input.touchKind,
    history: input.history.map((m) => ({ ...m, text: anonymize(m.text, input.names) })),
    client,
    analysis,
    expected,
  };
}

const SLOTS: SlotsSnapshot = {
  birthDate: null,
  birthDateText: null,
  birthPlace: null,
  age: null,
  gender: null,
  language: 'ru',
  requestSummary: null,
  requestCategoryKey: null,
  manualSlots: [],
};

function toHistory(message: FixtureMessage, index: number, now: Date): HistoryMessage {
  return {
    id: `fixture-${index}`,
    telegramMessageId: 1000 + index,
    role: message.role,
    text: message.text,
    sentAt: new Date(now.getTime() - 60_000 + index * 1_000),
    readAt: null,
    mediaKind: message.mediaKind ?? null,
    turnId: null,
  };
}

function readAnalysis(raw: Record<string, unknown> | null): FixtureAnalysis | null {
  if (!raw) return null;
  const escalation = raw.escalation as { reason?: string; note?: string | null } | null | undefined;
  return {
    escalation: escalation?.reason ? { reason: escalation.reason as HandoffReason, note: escalation.note ?? null } : null,
    language: typeof raw.language === 'string' ? raw.language : 'ru',
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.8,
    clientIntent: typeof raw.clientIntent === 'string' ? raw.clientIntent : null,
    send: true,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
