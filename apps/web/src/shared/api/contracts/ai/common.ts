/**
 * Общие для всего ИИ-раздела перечисления: режим чата, этап воронки, виды
 * текстов и касаний, исход хода. Зеркало apps/api/src/ai/ai.types.ts —
 * менять синхронно.
 */

export type ChatMode = 'off' | 'auto' | 'supervised' | 'manager'

export type FunnelStage =
  | 'greeting'
  | 'collect_birth'
  | 'collect_request'
  | 'ack_request'
  | 'diagnostics'
  | 'post_diagnostics'
  | 'offer'
  | 'price'
  | 'discount'
  | 'reminders'
  | 'closed_silent'

export const FUNNEL_STAGES: FunnelStage[] = [
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
]

export type Gender = 'f' | 'm'

export type PhraseUsage = 'example' | 'block'

export type PhraseKind =
  | 'greeting'
  | 'birth_nudge'
  | 'intro'
  | 'empathy'
  | 'ack_request'
  | 'links'
  | 'diag_closing'
  | 'reengage'
  | 'offer'
  | 'offer_question'
  | 'price'
  | 'price_question'
  | 'objection'
  | 'discount'
  | 'reminder'
  | 'quick_reply'

export const PHRASE_KINDS: PhraseKind[] = [
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
]

export type FactGroup = 'service' | 'price' | 'link' | 'persona' | 'process' | 'faq'

export const FACT_GROUPS: FactGroup[] = ['service', 'price', 'link', 'persona', 'process', 'faq']

export type LibrarySource = 'seed' | 'manual' | 'copied'

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
  | 'reminder'

export type TurnTrigger = 'inbound' | 'touch' | 'manual' | 'manager_draft'

export type TurnOutcome = 'sent' | 'silent' | 'dry_run' | 'handoff' | 'cancelled' | 'error' | 'awaiting_approval'

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
  | 'manual'

export interface TurnMessageDto {
  text: string
  blockId?: string | null
  telegramMessageId?: number | null
  sentAt?: string | null
}
