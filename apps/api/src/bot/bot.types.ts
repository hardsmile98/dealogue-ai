import type { Memory } from './core/types.js';
import type { BotAccountSettingsEntity } from './entities/bot-account-settings.entity.js';
import type { BotChatStateEntity } from './entities/bot-chat-state.entity.js';
import type { BotExampleEntity } from './entities/bot-example.entity.js';
import type { BotJobEntity } from './entities/bot-job.entity.js';
import type { BotLibraryItemEntity } from './entities/bot-library-item.entity.js';
import type { BotSandboxMessageEntity } from './entities/bot-sandbox-message.entity.js';
import type { BotTurnEntity } from './entities/bot-turn.entity.js';
import type {
  ChatLabel,
  ChatMode,
  Gender,
  HandoffReason,
  LibraryKind,
  Stage,
} from './library/kinds.js';
import { readPersona } from './library/persona.js';
import type { Persona } from './library/persona.js';
import { readTimings } from './library/timings.js';
import type { Timings } from './library/timings.js';

/**
 * Формы ответов агента — зеркало контракта фронтенда
 * (apps/web/src/shared/api/contracts/bot.ts). Менять синхронно.
 */

export interface BotSettingsDto {
  accountId: string;
  enabled: boolean;
  enabledAt: string | null;
  persona: Persona;
  timings: Timings;
  model: string;
  /** Сколько элементов в библиотеке по видам — чтобы веб показал, что импорт сделан. */
  library: { total: number; byKind: Partial<Record<LibraryKind, number>> };
}

export interface LibraryItemDto {
  id: string;
  accountId: string;
  kind: LibraryKind;
  language: string;
  gender: Gender | null;
  category: string | null;
  title: string;
  text: string;
  sort: number;
  enabled: boolean;
  /** Ключ стандартной библиотеки; null у созданных руками. */
  seedKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryImportResultDto {
  inserted: number;
  updated: number;
  skipped: number;
  total: number;
}

export interface ExampleDto {
  id: string;
  accountId: string;
  stage: Stage;
  situation: string;
  client: string;
  practitioner: string;
  enabled: boolean;
  sort: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatBotStateDto {
  chatId: string;
  accountId: string;
  mode: ChatMode;
  /** Вычисляется по доставленным вехам. */
  stage: Stage;
  label: ChatLabel | null;
  handoffReason: HandoffReason | null;
  handoffAt: string | null;
  card: Record<string, unknown>;
  summary: string;
  turnsWithoutNudge: number;
  remindersSent: number;
  updatedAt: string;
}

/** Состояние чата или null, если агент этот чат не вёл и режим руками не ставили. */
export interface ChatBotStateResponse {
  state: ChatBotStateDto | null;
}

export function toSettingsDto(
  settings: BotAccountSettingsEntity,
  accountName: string,
  library: BotSettingsDto['library'],
): BotSettingsDto {
  return {
    accountId: settings.accountId,
    enabled: settings.enabled,
    enabledAt: settings.enabledAt?.toISOString() ?? null,
    persona: readPersona(settings.persona, accountName),
    timings: readTimings(settings.timings),
    model: settings.model,
    library,
  };
}

export function toLibraryItemDto(item: BotLibraryItemEntity): LibraryItemDto {
  return {
    id: item.id,
    accountId: item.accountId,
    kind: item.kind,
    language: item.language,
    gender: item.gender,
    category: item.category,
    title: item.title,
    text: item.text,
    sort: item.sort,
    enabled: item.enabled,
    seedKey: item.seedKey,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function toExampleDto(example: BotExampleEntity): ExampleDto {
  return {
    id: example.id,
    accountId: example.accountId,
    stage: example.stage,
    situation: example.situation,
    client: example.client,
    practitioner: example.practitioner,
    enabled: example.enabled,
    sort: example.sort,
    createdAt: example.createdAt.toISOString(),
    updatedAt: example.updatedAt.toISOString(),
  };
}

export function toChatStateDto(state: BotChatStateEntity, stage: Stage): ChatBotStateDto {
  return {
    chatId: state.chatId,
    accountId: state.accountId,
    mode: state.mode,
    stage,
    label: state.label,
    handoffReason: state.handoffReason,
    handoffAt: state.handoffAt?.toISOString() ?? null,
    card: state.card,
    summary: state.summary,
    turnsWithoutNudge: state.turnsWithoutNudge,
    remindersSent: state.remindersSent,
    updatedAt: state.updatedAt.toISOString(),
  };
}

// ── Песочница ──────────────────────────────────────────────────────────

export interface SandboxSummaryDto {
  id: string;
  accountId: string;
  title: string;
  /** Реальный чат, из которого скопирована переписка. */
  sourceChatId: string | null;
  virtualNow: string;
  stage: Stage;
  mode: ChatMode;
  label: ChatLabel | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SandboxMessageDto {
  id: number;
  direction: 'in' | 'out';
  text: string;
  mediaKind: string | null;
  sentAt: string;
  readAt: string | null;
  /** Тело вехи из библиотеки. */
  block: boolean;
  delayMs: number | null;
  typingMs: number | null;
  turnId: string | null;
}

export interface SandboxJobDto {
  id: string;
  kind: string;
  runAt: string;
  status: string;
  /** Почему поставлено: от чего отсчитана ступень или «повтор N после сбоя». */
  note: string | null;
}

/** Ход из журнала — то, что нужно, чтобы понять «почему агент так ответил». */
export interface BotTurnDto {
  id: string;
  /** Сообщения, которые ушли этим ходом (telegram_message_id или id песочницы). */
  messageIds: number[];
  trigger: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  analysis: {
    summary: string;
    language: string | null;
    intents: string[];
    risk: string[];
    mood: string;
    interest: number;
    objection: string | null;
    answerPoints: { text: string; topic: string; skip: boolean }[];
  } | null;
  plan: {
    goal: string;
    milestone: string | null;
    nudge: string | null;
    handoff: string | null;
    idle: string | null;
  } | null;
  draft: string | null;
  review: {
    violations: { code: string; severity: string; detail: string }[];
    rewritten: boolean;
    final: { code: string; severity: string; detail: string }[] | null;
  } | null;
  final: {
    removed: { part: string; reason: string }[];
    fallback: boolean;
  } | null;
}

export type SandboxTurnDto = BotTurnDto;

/** Память о клиенте — как её видят план и ответчик. */
export interface BotMemoryDto {
  card: Record<string, unknown>;
  summary: string;
  facts: { kind: string; text: string; confidence: number }[];
  said: { kind: string; key: string; at: string }[];
  turnsWithoutNudge: number;
  remindersSent: number;
}

/** Журнал агента в реальном чате. */
export interface ChatJournalDto {
  memory: BotMemoryDto;
  jobs: SandboxJobDto[];
  turns: BotTurnDto[];
}

/** null — агент этот чат не вёл (обёртка: голый null ушёл бы пустым телом). */
export interface ChatJournalResponse {
  journal: ChatJournalDto | null;
}

/** Чат у менеджера — строка списка «у менеджера». */
export interface HandoffChatDto {
  chatId: string;
  peerName: string;
  peerUsername: string | null;
  stage: Stage;
  label: ChatLabel | null;
  handoffReason: HandoffReason | null;
  handoffAt: string | null;
  /** С какого сообщения клиента он ждёт ответа; null — последнее слово за нами. */
  waitingSince: string | null;
  lastMessageAt: string | null;
  lastMessageText: string;
  lastMessageDirection: 'in' | 'out' | null;
}

export interface SandboxSessionDto extends SandboxSummaryDto {
  /** Идёт ход или перемотка — веб опрашивает, пока true. */
  running: boolean;
  /** Ошибка последнего фонового запуска (сеть, модель), если была. */
  lastError: string | null;
  handoffReason: HandoffReason | null;
  /** Сообщения клиента, на которые агент ещё не отвечал. */
  pendingCount: number;
  messages: SandboxMessageDto[];
  memory: BotMemoryDto;
  jobs: SandboxJobDto[];
  nextJob: SandboxJobDto | null;
  turns: SandboxTurnDto[];
}

type Json = Record<string, unknown>;
const asObject = (value: unknown): Json | null => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : null);
const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const asStrings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
const asViolations = (value: unknown): { code: string; severity: string; detail: string }[] =>
  Array.isArray(value)
    ? value.map(asObject).filter((item): item is Json => item !== null).map((item) => ({
        code: asString(item.code) ?? '',
        severity: asString(item.severity) ?? '',
        detail: asString(item.detail) ?? '',
      }))
    : [];

/** Журнал хранит анализ, план и проверку как jsonb — в вебе нужна только их читаемая часть. */
export function toBotTurnDto(turn: BotTurnEntity): BotTurnDto {
  const analysis = asObject(turn.analysis);
  const plan = asObject(turn.plan);
  const review = asObject(turn.review);
  const final = asObject(turn.final);
  const sent = asObject(turn.sent);
  return {
    id: turn.id,
    messageIds: (Array.isArray(sent?.parts) ? sent.parts : [])
      .map(asObject)
      .map((part) => part?.messageId)
      .filter((id): id is number => typeof id === 'number'),
    trigger: turn.trigger,
    status: turn.status,
    startedAt: turn.startedAt.toISOString(),
    finishedAt: turn.finishedAt?.toISOString() ?? null,
    error: turn.error,
    analysis: analysis
      ? {
          summary: asString(analysis.summary) ?? '',
          language: asString(analysis.language),
          intents: asStrings(analysis.intents),
          risk: asStrings(analysis.risk),
          mood: asString(analysis.mood) ?? '',
          interest: typeof analysis.interest === 'number' ? analysis.interest : 0,
          objection: asString(analysis.objection),
          answerPoints: (Array.isArray(analysis.answerPoints) ? analysis.answerPoints : [])
            .map(asObject)
            .filter((point): point is Json => point !== null)
            .map((point) => ({ text: asString(point.text) ?? '', topic: asString(point.topic) ?? 'other', skip: point.skip === true })),
        }
      : null,
    plan: plan
      ? {
          goal: asString(plan.goal) ?? '',
          milestone: asString(asObject(plan.milestone)?.key),
          nudge: asString(plan.nudge),
          handoff: asString(asObject(plan.handoff)?.reason),
          idle: asString(plan.idle),
        }
      : null,
    draft: turn.draft,
    review: review
      ? { violations: asViolations(review.violations), rewritten: review.rewritten === true, final: Array.isArray(review.final) ? asViolations(review.final) : null }
      : null,
    final: final
      ? {
          removed: (Array.isArray(final.removed) ? final.removed : [])
            .map(asObject)
            .filter((item): item is Json => item !== null)
            .map((item) => ({ part: asString(item.part) ?? '', reason: asString(item.reason) ?? '' })),
          fallback: final.fallback === true,
        }
      : null,
  };
}

export const toSandboxTurnDto = toBotTurnDto;

/** Память из состояния чата и загруженных фактов и реестра сказанного. */
export function toMemoryDto(state: BotChatStateEntity, memory: Memory): BotMemoryDto {
  return {
    card: state.card,
    summary: state.summary,
    facts: memory.facts.map((fact) => ({ kind: fact.kind, text: fact.text, confidence: fact.confidence })),
    said: memory.said.map((entry) => ({ kind: entry.kind, key: entry.key, at: entry.at.toISOString() })),
    turnsWithoutNudge: state.turnsWithoutNudge,
    remindersSent: state.remindersSent,
  };
}

export function toSandboxMessageDto(message: BotSandboxMessageEntity): SandboxMessageDto {
  return {
    id: message.id,
    direction: message.direction,
    text: message.text,
    mediaKind: message.mediaKind,
    sentAt: message.sentAt.toISOString(),
    readAt: message.readAt?.toISOString() ?? null,
    block: message.block,
    delayMs: message.delayMs,
    typingMs: message.typingMs,
    turnId: message.turnId,
  };
}

export function toSandboxJobDto(job: BotJobEntity): SandboxJobDto {
  const retry = asObject(job.payload?.retry);
  const note = retry && typeof retry.attempt === 'number' ? `повтор ${retry.attempt} после сбоя` : asString(job.payload?.reason);
  return { id: job.id, kind: job.kind, runAt: job.runAt.toISOString(), status: job.status, note };
}
