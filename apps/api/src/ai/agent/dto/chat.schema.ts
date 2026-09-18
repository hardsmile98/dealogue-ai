import { z } from 'zod';
import { FUNNEL_STAGES } from '../../domain/types.js';

/** Валидация запросов к состоянию чата, ходам и песочнице. */

const stage = z.enum(FUNNEL_STAGES);
const touchKind = z.enum([
  'birth_nudge',
  'diagnostics',
  'reengage',
  'offer',
  'offer_question',
  'price',
  'price_question',
  'discount',
  'reminder',
]);

export const patchChatAiSchema = z
  .object({
    mode: z.enum(['off', 'auto', 'supervised', 'manager']),
    slots: z
      .object({
        birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается YYYY-MM-DD').nullable(),
        birthPlace: z.string().max(256).nullable(),
        gender: z.enum(['f', 'm']).nullable(),
        language: z.string().min(2).max(8),
        requestSummary: z.string().max(2000).nullable(),
        requestCategoryKey: z.string().max(64).nullable(),
      })
      .partial()
      .strict(),
    manualNotes: z.string().max(4000).nullable(),
  })
  .partial()
  .strict();
export type PatchChatAiInput = z.infer<typeof patchChatAiSchema>;

export const resumeChatAiSchema = z
  .object({
    mode: z.enum(['auto', 'supervised']),
    stage: stage.optional(),
    when: z.enum(['now', 'interval']).default('interval'),
  })
  .strict();
export type ResumeChatAiInput = z.infer<typeof resumeChatAiSchema>;

export const manualTurnSchema = z
  .object({
    touchKind: touchKind.nullable().default(null),
  })
  .strict();
export type ManualTurnInput = z.infer<typeof manualTurnSchema>;

export const rateTurnSchema = z
  .object({
    rating: z.enum(['good', 'bad']).nullable(),
    note: z.string().max(2000).nullable().default(null),
    createNote: z.boolean().default(false),
  })
  .strict();
export type RateTurnInput = z.infer<typeof rateTurnSchema>;

export const turnsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.string().datetime().optional(),
});
export type TurnsQueryInput = z.infer<typeof turnsQuerySchema>;

// --- песочница ---------------------------------------------------------------

/**
 * Состояние диалога песочницы хранит браузер и присылает его обратно каждым
 * шагом, поэтому оно проверяется как обычный ввод. Карточка клиента —
 * свободный объект: её всё равно чистит `normalizeCard`.
 */
const isoDate = z.string().datetime();

const simMessage = z.object({
  role: z.enum(['client', 'bot', 'manager']),
  text: z.string().max(4000),
  at: isoDate,
  readAt: isoDate.nullable(),
  blockKind: z.string().max(64).nullable(),
});

const simState = z.object({
  now: isoDate,
  startedAt: isoDate,
  stage,
  stageEnteredAt: isoDate,
  card: z.record(z.string(), z.unknown()),
  messages: z.array(simMessage).max(200),
  sentBlockIds: z.array(z.string().uuid()).max(200),
  usedExampleIds: z.array(z.string().uuid()).max(200),
  autoMessagesSinceClient: z.number().int().min(0).max(1000),
  remindersSent: z.number().int().min(0).max(1000),
  touchPostponedCount: z.number().int().min(0).max(1000),
  lastIntervalHours: z.number().min(0).max(1000).nullable(),
  diagnosticsSentAt: isoDate.nullable(),
  diagnosticsReadAt: isoDate.nullable(),
  lastGreetingAt: isoDate.nullable(),
  lastClientMessageAt: isoDate.nullable(),
  lastBotMessageAt: isoDate.nullable(),
  nextTouchKind: touchKind.nullable(),
  nextTouchAt: isoDate.nullable(),
  handoff: z.object({ reason: z.string().max(32), detail: z.string().max(2000), at: isoDate }).nullable(),
  closedAt: isoDate.nullable(),
  turns: z
    .array(
      z.object({
        stageBefore: stage,
        stageAfter: stage,
        clientIntent: z.string().max(2000).nullable(),
        trigger: z.enum(['inbound', 'touch', 'manual', 'manager_draft']),
      }),
    )
    .max(20),
  turnCount: z.number().int().min(0).max(1000),
});

const startSlots = z
  .object({
    birthDate: z.string().max(10).nullable(),
    birthPlace: z.string().max(256).nullable(),
    gender: z.enum(['f', 'm']).nullable(),
    language: z.string().max(8).nullable(),
    requestSummary: z.string().max(2000).nullable(),
    requestCategoryKey: z.string().max(64).nullable(),
  })
  .partial();

/** Один шаг песочницы: что сделал «клиент» или менеджер и на каком состоянии. */
export const sandboxSchema = z
  .object({
    action: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('start'), stage: stage.nullable().optional(), slots: startSlots.nullable().optional() }),
      z.object({ kind: z.literal('client'), text: z.string().min(1).max(4000) }),
      // До четырнадцати суток: дальше воронка всё равно закрыта.
      z.object({ kind: z.literal('wait'), minutes: z.number().int().min(1).max(20_160), read: z.boolean().optional() }),
      z.object({ kind: z.literal('touch'), touchKind: touchKind.nullable().optional() }),
      z.object({ kind: z.literal('resume') }),
    ]),
    state: simState.nullable().optional(),
  })
  .strict();
export type SandboxInput = z.infer<typeof sandboxSchema>;
