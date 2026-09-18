import { z } from 'zod';
import { PHRASE_KINDS } from '../../domain/types.js';

/** Валидация запросов очереди черновиков (раздел 11 ТЗ). */

export const draftsQuerySchema = z
  .object({
    status: z.string().max(128).optional(),
    kind: z.enum(['handoff', 'supervised']).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
    /** Курсор — `created_at` последнего показанного черновика. */
    cursor: z.string().datetime().optional(),
  })
  .partial()
  .strict();
export type DraftsQueryInput = z.infer<typeof draftsQuerySchema>;

export const sendDraftSchema = z
  .object({
    /** Что уходит клиенту: правки менеджера или текст черновика как есть. */
    messages: z.array(z.string().min(1).max(4000)).min(1).max(10),
    /** Менеджер написал свой ответ, а не правил предложенный. */
    own: z.boolean().default(false),
  })
  .strict();
export type SendDraftInput = z.infer<typeof sendDraftSchema>;

export const draftToExampleSchema = z
  .object({
    kind: z.enum(PHRASE_KINDS),
    title: z.string().max(128).default(''),
    text: z.string().min(1).max(20_000),
  })
  .strict();
export type DraftToExampleInput = z.infer<typeof draftToExampleSchema>;

export const draftToNoteSchema = z
  .object({
    text: z.string().min(1).max(2000),
    scope: z
      .string()
      .max(96)
      .regex(/^(global|stage:[a-z_]+|category:[a-z0-9_.-]+)$/, 'scope: global, stage:<этап> или category:<ключ>')
      .default('global'),
  })
  .strict();
export type DraftToNoteInput = z.infer<typeof draftToNoteSchema>;
