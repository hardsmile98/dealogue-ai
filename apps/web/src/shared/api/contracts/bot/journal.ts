/**
 * Журнал агента: ходы, память о клиенте, задания планировщика — общий для
 * реального чата и песочницы. Зеркало apps/api/src/bot/bot.types.ts.
 */

/** Задание планировщика (ступень лестницы молчания, повтор хода). */
export interface SandboxJobDto {
  id: string;
  kind: string;
  runAt: string;
  /** pending | running | done | cancelled | failed */
  status: string;
  /** Почему поставлено: от чего отсчитана ступень или «повтор N после сбоя». */
  note: string | null;
}

export interface SandboxViolationDto {
  code: string;
  /** hard — грубое нарушение, иначе стилистическое. */
  severity: string;
  detail: string;
}

/** Пункт ответа: что клиент спросил или рассказал. */
export interface AnswerPointDto {
  text: string;
  topic: string;
  /** Отвечать не нужно — уже отвечено или не по делу. */
  skip: boolean;
}

/** Что понял анализатор. */
export interface TurnAnalysisDto {
  summary: string;
  language: string | null;
  intents: string[];
  risk: string[];
  mood: string;
  /** 0–3 */
  interest: number;
  objection: string | null;
  answerPoints: AnswerPointDto[];
}

/** Что решил план хода. */
export interface TurnPlanDto {
  goal: string;
  milestone: string | null;
  nudge: string | null;
  handoff: string | null;
  idle: string | null;
}

/** Замечания проверяющего промпта. */
export interface TurnReviewDto {
  violations: SandboxViolationDto[];
  rewritten: boolean;
  /** Что осталось после переписывания; null — не переписывали. */
  final: SandboxViolationDto[] | null;
}

/** Что вырезали жёсткие проверки кодом. */
export interface TurnFinalDto {
  removed: { part: string; reason: string }[];
  /** Ушёл запасной текст вместо ответа модели. */
  fallback: boolean;
}

/** Ход из журнала агента — в песочнице и в реальном чате. */
export interface BotTurnDto {
  id: string;
  /** Сообщения, ушедшие этим ходом (telegram_message_id или id песочницы). */
  messageIds: number[];
  /** client | schedule | restore */
  trigger: string;
  /** running | sent | handoff | skipped | failed | done */
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
  /** Поле карточки → `{ value, confidence }`. */
  card: Record<string, unknown>;
  summary: string;
  facts: { kind: string; text: string; confidence: number }[];
  /** Реестр сказанного: вехи (`kind = milestone`) и прочее. */
  said: { kind: string; key: string; at: string }[];
  turnsWithoutNudge: number;
  remindersSent: number;
}
