/**
 * Доменные типы ИИ-агента v2 (см. docs/ai-agent-spec.md). Здесь только
 * то, что хранится в базе или ходит между слоями; DTO наружу лежат рядом
 * с модулем, который их отдаёт (settings/, alerts/, library/, agent/dto/).
 */

/** Режим чата: кто пишет клиенту. */
export type ChatMode = 'off' | 'auto' | 'supervised' | 'manager';

/**
 * Этап воронки (раздел 5.2 ТЗ). Порядок значим: он же порядок движения по
 * воронке. Список — источник истины и для типа, и для zod-схем.
 */
export const FUNNEL_STAGES = [
  'greeting',
  'collect_birth',
  'collect_request',
  'ack_request',
  'diagnostics',
  'post_diagnostics',
  'offer',
  'price',
  'discount',
  'reminders',
  'closed_silent',
] as const;

export type FunnelStage = (typeof FUNNEL_STAGES)[number];

/** Цель касания по таймеру. */
export type TouchKind =
  | 'first_reply'
  | 'birth_nudge'
  | 'diagnostics'
  | 'reengage'
  | 'offer'
  | 'offer_question'
  | 'price'
  | 'price_question'
  | 'discount'
  | 'reminder';

export type Gender = 'f' | 'm';
export type GenderSource = 'text' | 'name' | 'manual';

export type PhraseUsage = 'example' | 'block';

export const PHRASE_KINDS = [
  'greeting',
  'birth_nudge',
  'intro',
  'empathy',
  'ack_request',
  'links',
  'diag_closing',
  'reengage',
  'offer',
  'offer_question',
  'price',
  'price_question',
  'objection',
  'discount',
  'reminder',
  'quick_reply',
] as const;

export type PhraseKind = (typeof PHRASE_KINDS)[number];

/** Условия применимости примера или блока (фильтр до подмешивания в промпт). */
export interface PhraseConditions {
  requiresRequest?: boolean;
  avoidIfPriceAsked?: boolean;
}

export type FactGroup = 'service' | 'price' | 'link' | 'persona' | 'process' | 'faq';

export type TurnTrigger = 'inbound' | 'touch' | 'manual' | 'manager_draft';

export type TurnOutcome =
  | 'sent'
  | 'silent'
  | 'dry_run'
  | 'handoff'
  | 'cancelled'
  | 'error'
  | 'awaiting_approval';

export type TurnRating = 'good' | 'bad';

export type DraftKind = 'handoff' | 'supervised';

export type DraftStatus =
  | 'pending'
  | 'pending_classification'
  | 'sent_as_is'
  | 'edited'
  | 'replaced'
  | 'dismissed'
  | 'superseded';

export type DecisionSource = 'web' | 'telegram';

export type NoteSource = 'manual' | 'from_rating';

/** Почему чат передан менеджеру (раздел 8.1 ТЗ). */
export type HandoffReason =
  | 'ready_to_pay'
  | 'suspects_bot'
  | 'wants_human'
  | 'aggression'
  | 'crisis'
  | 'minor'
  | 'refusal'
  | 'out_of_scope'
  | 'unsure'
  | 'media'
  | 'guard_failed'
  | 'provider_error'
  | 'loop'
  | 'auto_limit'
  | 'language'
  | 'stale_lead'
  | 'manual';

export type AiEventKind =
  | 'mode_changed'
  | 'stage_changed'
  | 'touch_scheduled'
  | 'touch_cancelled'
  | 'read'
  | 'handoff'
  | 'manager_took_over'
  | 'settings_changed'
  | 'error';

// --- jsonb-настройки аккаунта ------------------------------------------------

export interface PersonaLink {
  title: string;
  url: string;
}

/** От чьего лица пишет бот. */
export interface PersonaConfig {
  name: string;
  gender: Gender;
  bio: string;
  tone: string;
  habits: string;
  city: string;
  language: string;
  links: PersonaLink[];
}

/** Таймеры воронки (раздел 5.4 ТЗ). Секунды, минуты и часы — как в названии. */
export interface TimingsConfig {
  debounceSec: number;
  debounceMaxSec: number;
  greetingDebounceMaxSec: number;
  firstReplyDelayMinSec: number;
  firstReplyDelayMaxSec: number;
  birthNudgeAfterMin: number;
  diagnosticsDelayMin: number;
  reengageAfterReadMin: number;
  reengageIfUnreadHours: number;
  touchIntervalMinHours: number;
  touchIntervalMaxHours: number;
  maxReminders: number;
  superviseTimeoutHours: number;
}

export interface LimitsConfig {
  llmCallsPerHour: number;
  llmCallsPerDay: number;
  botMessagesPerHour: number;
  botMessagesPerChatPerDay: number;
  autoMessagesWithoutReply: number;
}

export interface GuardConfig {
  /** Фразы-признания («я бот»), при которых ответ переписывается. */
  botAdmissionPhrases: string[];
  /** Обещания результата, которых быть не должно. */
  promisePhrases: string[];
  /** Порог похожести на уже отправленное (trigram, 0–1). */
  similarityThreshold: number;
  /** Ниже этой уверенности модели ход уходит менеджеру. */
  confidenceThreshold: number;
}

