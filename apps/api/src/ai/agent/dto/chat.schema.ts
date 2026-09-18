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

export const sandboxSchema = z
  .object({
    chatId: z.string().uuid().nullable().optional(),
    history: z
      .array(z.object({ role: z.enum(['client', 'bot', 'manager']), text: z.string().min(1).max(4000) }))
      .max(60)
      .optional(),
    message: z.string().max(4000).nullable().optional(),
    touchKind: touchKind.nullable().optional(),
    stage: stage.nullable().optional(),
    slots: z
      .object({
        birthDate: z.string().nullable(),
        birthPlace: z.string().nullable(),
        gender: z.enum(['f', 'm']).nullable(),
        language: z.string(),
        requestSummary: z.string().nullable(),
        requestCategoryKey: z.string().nullable(),
      })
      .partial()
      .nullable()
      .optional(),
  })
  .strict();
export type SandboxInput = z.infer<typeof sandboxSchema>;
