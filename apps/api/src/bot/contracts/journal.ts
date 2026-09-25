import type { Memory } from '../core/types.js';
import type { BotChatStateEntity } from '../entities/bot-chat-state.entity.js';
import type { BotJobEntity } from '../entities/bot-job.entity.js';
import type { BotTurnEntity } from '../entities/bot-turn.entity.js';

/** Задание лестницы или повтор — в журнале чата и в песочнице. */
export interface SandboxJobDto {
  id: string;
  kind: string;
  runAt: string;
  status: string;
  /** Почему поставлено: от чего отсчитана ступень или «повтор N после сбоя». */
  note: string | null;
}

export interface SandboxViolationDto {
  code: string;
  severity: string;
  detail: string;
}

export interface AnswerPointDto {
  text: string;
  topic: string;
  skip: boolean;
}

export interface TurnAnalysisDto {
  summary: string;
  language: string | null;
  intents: string[];
  risk: string[];
  mood: string;
  interest: number;
  objection: string | null;
  answerPoints: AnswerPointDto[];
}

export interface TurnPlanDto {
  goal: string;
  milestone: string | null;
  nudge: string | null;
  handoff: string | null;
  idle: string | null;
}

export interface TurnReviewDto {
  violations: SandboxViolationDto[];
  rewritten: boolean;
  final: SandboxViolationDto[] | null;
}

export interface TurnFinalDto {
  removed: { part: string; reason: string }[];
  fallback: boolean;
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
  analysis: TurnAnalysisDto | null;
  plan: TurnPlanDto | null;
  draft: string | null;
  review: TurnReviewDto | null;
  final: TurnFinalDto | null;
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

// Журнал хранит анализ, план и проверку как jsonb произвольной формы:
// из него берётся только читаемая часть, всё непонятное — пустым значением.
type Json = Record<string, unknown>;

const asObject = (value: unknown): Json | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)
    : null;

const asString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const asStrings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

const asObjects = (value: unknown): Json[] =>
  Array.isArray(value)
    ? value.map(asObject).filter((item): item is Json => item !== null)
    : [];

const asViolations = (value: unknown): SandboxViolationDto[] =>
  asObjects(value).map((item) => ({
    code: asString(item.code) ?? '',
    severity: asString(item.severity) ?? '',
    detail: asString(item.detail) ?? '',
  }));

function toAnalysisDto(analysis: Json): TurnAnalysisDto {
  return {
    summary: asString(analysis.summary) ?? '',
    language: asString(analysis.language),
    intents: asStrings(analysis.intents),
    risk: asStrings(analysis.risk),
    mood: asString(analysis.mood) ?? '',
    interest: typeof analysis.interest === 'number' ? analysis.interest : 0,
    objection: asString(analysis.objection),
    answerPoints: asObjects(analysis.answerPoints).map((point) => ({
      text: asString(point.text) ?? '',
      topic: asString(point.topic) ?? 'other',
      skip: point.skip === true,
    })),
  };
}

function toPlanDto(plan: Json): TurnPlanDto {
  return {
    goal: asString(plan.goal) ?? '',
    milestone: asString(asObject(plan.milestone)?.key),
    nudge: asString(plan.nudge),
    handoff: asString(asObject(plan.handoff)?.reason),
    idle: asString(plan.idle),
  };
}

function toReviewDto(review: Json): TurnReviewDto {
  return {
    violations: asViolations(review.violations),
    rewritten: review.rewritten === true,
    final: Array.isArray(review.final) ? asViolations(review.final) : null,
  };
}

function toFinalDto(final: Json): TurnFinalDto {
  return {
    removed: asObjects(final.removed).map((item) => ({
      part: asString(item.part) ?? '',
      reason: asString(item.reason) ?? '',
    })),
    fallback: final.fallback === true,
  };
}

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
    analysis: analysis ? toAnalysisDto(analysis) : null,
    plan: plan ? toPlanDto(plan) : null,
    draft: turn.draft,
    review: review ? toReviewDto(review) : null,
    final: final ? toFinalDto(final) : null,
  };
}

/** Память из состояния чата и загруженных фактов и реестра сказанного. */
export function toMemoryDto(
  state: BotChatStateEntity,
  memory: Memory,
): BotMemoryDto {
  return {
    card: state.card,
    summary: state.summary,
    facts: memory.facts.map((fact) => ({
      kind: fact.kind,
      text: fact.text,
      confidence: fact.confidence,
    })),
    said: memory.said.map((entry) => ({
      kind: entry.kind,
      key: entry.key,
      at: entry.at.toISOString(),
    })),
    turnsWithoutNudge: state.turnsWithoutNudge,
    remindersSent: state.remindersSent,
  };
}

export function toSandboxJobDto(job: BotJobEntity): SandboxJobDto {
  const retry = asObject(job.payload?.retry);
  const note =
    retry && typeof retry.attempt === 'number'
      ? `повтор ${retry.attempt} после сбоя`
      : asString(job.payload?.reason);
  return {
    id: job.id,
    kind: job.kind,
    runAt: job.runAt.toISOString(),
    status: job.status,
    note,
  };
}
