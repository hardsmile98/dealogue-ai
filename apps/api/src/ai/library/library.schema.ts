import { z } from 'zod';
import { FUNNEL_STAGES, PHRASE_KINDS } from '../domain/types.js';

/** Валидация тел запросов библиотеки. Схемы `update*` — частичные. */

const key = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_.-]*$/, 'Ключ: латиница, цифры, точки, подчёркивания');
const gender = z.enum(['f', 'm']).nullable();
const language = z.string().min(2).max(8);
const phraseKind = z.enum(PHRASE_KINDS);
const text = z.string().min(1).max(20_000);

export const categorySchema = z
  .object({
    key,
    groupKey: z.string().min(2).max(32),
    title: z.string().min(1).max(128),
    description: z.string().max(2000).default(''),
    clarifyingFactKey: z.string().max(32).nullable().default(null),
    clarifyingQuestion: z.string().max(500).nullable().default(null),
    enabled: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(10_000).default(0),
  })
  .strict();
export const updateCategorySchema = categorySchema.partial();

export const phraseSchema = z
  .object({
    usage: z.enum(['example', 'block']).default('example'),
    kind: phraseKind,
    categoryKey: z.string().max(64).nullable().default(null),
    gender: gender.default(null),
    language: language.default('ru'),
    title: z.string().max(128).default(''),
    text,
    conditions: z
      .object({ requiresRequest: z.boolean().optional(), avoidIfPriceAsked: z.boolean().optional() })
      .strict()
      .default({}),
    enabled: z.boolean().default(true),
    weight: z.number().int().min(1).max(100).default(1),
    sortOrder: z.number().int().min(0).max(10_000).default(0),
  })
  .strict();
export const updatePhraseSchema = phraseSchema.partial();

export const phrasesQuerySchema = z
  .object({
    usage: z.enum(['example', 'block']).optional(),
    kind: phraseKind.optional(),
    categoryKey: z.string().max(64).optional(),
    gender: z.enum(['f', 'm']).optional(),
    language: language.optional(),
    enabled: z.enum(['true', 'false']).optional(),
  })
  .partial();

export const factSchema = z
  .object({
    group: z.enum(['service', 'price', 'link', 'persona', 'process', 'faq']),
    key,
    title: z.string().min(1).max(128),
    value: z.string().min(1).max(4000),
    enabled: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(10_000).default(0),
  })
  .strict();
export const updateFactSchema = factSchema.partial();

export const diagnosticSchema = z
  .object({
    key,
    title: z.string().min(1).max(128),
    categoryKey: z.string().max(64).nullable().default(null),
    gender: gender.default(null),
    language: language.default('ru'),
    text,
    enabled: z.boolean().default(true),
    weight: z.number().int().min(1).max(100).default(1),
    sortOrder: z.number().int().min(0).max(10_000).default(0),
  })
  .strict();
export const updateDiagnosticSchema = diagnosticSchema.partial();

export const diagnosticsQuerySchema = z
  .object({
    categoryKey: z.string().max(64).optional(),
    gender: z.enum(['f', 'm']).optional(),
    language: language.optional(),
    enabled: z.enum(['true', 'false']).optional(),
  })
  .partial();

export const updatePlaybookSchema = z
  .object({
    goal: z.string().max(1000),
    instructions: z.string().max(8000),
    requiredBlockKinds: z.array(phraseKind).max(10),
    allowedBlockKinds: z.array(phraseKind).max(20),
    exampleKinds: z.array(phraseKind).max(20),
    noQuestions: z.boolean(),
    enabled: z.boolean(),
  })
  .partial()
  .strict();

export const noteSchema = z
  .object({
    text: z.string().min(1).max(2000),
    scope: z
      .string()
      .max(96)
      .regex(/^(global|stage:[a-z_]+|category:[a-z0-9_.-]+)$/, 'scope: global, stage:<этап> или category:<ключ>')
      .default('global'),
    enabled: z.boolean().default(true),
  })
  .strict();
export const updateNoteSchema = noteSchema.partial();

export const copyLibrarySchema = z
  .object({
    categories: z.boolean().default(true),
    phrases: z.boolean().default(true),
    facts: z.boolean().default(true),
    diagnostics: z.boolean().default(true),
    playbooks: z.boolean().default(true),
    notes: z.boolean().default(false),
    mode: z.enum(['skip', 'replace']).default('skip'),
  })
  .strict();

export const seedLibrarySchema = z
  .object({
    mode: z.enum(['skip', 'replace']).default('skip'),
  })
  .strict();

export const previewSplitSchema = z.object({ text: z.string().max(60_000) }).strict();

/** Этап из пути (`/playbooks/:stage`) или из тела сброса плейбуков. */
export const stageParamSchema = z.enum(FUNNEL_STAGES, { error: 'Неизвестный этап воронки' });

export const resetPlaybooksSchema = z.object({ stage: stageParamSchema.optional() }).strict();

export type CategoryInput = z.infer<typeof categorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type PhraseInput = z.infer<typeof phraseSchema>;
export type UpdatePhraseInput = z.infer<typeof updatePhraseSchema>;
export type PhrasesQuery = z.infer<typeof phrasesQuerySchema>;
export type FactInput = z.infer<typeof factSchema>;
export type UpdateFactInput = z.infer<typeof updateFactSchema>;
export type DiagnosticInput = z.infer<typeof diagnosticSchema>;
export type UpdateDiagnosticInput = z.infer<typeof updateDiagnosticSchema>;
export type DiagnosticsQuery = z.infer<typeof diagnosticsQuerySchema>;
export type UpdatePlaybookInput = z.infer<typeof updatePlaybookSchema>;
export type NoteInput = z.infer<typeof noteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
export type CopyLibraryInput = z.infer<typeof copyLibrarySchema>;
export type SeedLibraryInput = z.infer<typeof seedLibrarySchema>;
export type PreviewSplitInput = z.infer<typeof previewSplitSchema>;
export type ResetPlaybooksInput = z.infer<typeof resetPlaybooksSchema>;
