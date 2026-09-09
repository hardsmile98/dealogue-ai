import { z } from 'zod';

/**
 * Профиль стиля и знаний менеджера, выведенный из истории переписок.
 * Хранится в ai_style_profile.profile (jsonb); правки владельца — в overrides.
 */

export const PHRASE_INTENTS = [
  'greeting',
  'qualify',
  'price',
  'materials',
  'call_offer',
  'objection',
  'close',
  'payment',
  'followup',
  'other',
] as const;

export type PhraseIntent = (typeof PHRASE_INTENTS)[number];

export const PhrasebookEntrySchema = z.object({
  intent: z.enum(PHRASE_INTENTS),
  phrases: z.array(z.string().max(700)).max(40),
});

export const SeenQaSchema = z.object({
  q: z.string().max(500),
  a: z.string().max(1000),
  seen: z.number().int().nonnegative().default(1),
});

export const SeenObjectionSchema = z.object({
  objection: z.string().max(500),
  answer: z.string().max(1000),
  seen: z.number().int().nonnegative().default(1),
});

export const HabitsSchema = z.object({
  avgMessageLen: z.number().nonnegative().default(0),
  /** Доля ответов менеджера, состоящих из нескольких сообщений подряд. */
  multiMessageShare: z.number().min(0).max(1).default(0),
  emojiTop: z.array(z.string().max(8)).max(10).default([]),
  greetingPatterns: z.array(z.string().max(120)).max(10).default([]),
  signoffPatterns: z.array(z.string().max(120)).max(10).default([]),
  usesVoice: z.boolean().default(false),
  /** Доля сообщений, начинающихся со строчной буквы. */
  lowercaseStartShare: z.number().min(0).max(1).default(0),
  /** Доля сообщений без точки в конце. */
  noTrailingPeriodShare: z.number().min(0).max(1).default(0),
  /** p90 длины сообщения менеджера в символах — потолок для ответов ИИ. */
  messageLenP90: z.number().nonnegative().default(0),
});

export const TimingSchema = z.object({
  responseDelaySec: z.object({
    p25: z.number().nonnegative(),
    p50: z.number().nonnegative(),
    p75: z.number().nonnegative(),
    p90: z.number().nonnegative(),
  }),
  /** Часы, в которые менеджер реально отвечает (локальное время `tz`). */
  activeHours: z.object({
    from: z.number().int().min(0).max(23),
    to: z.number().int().min(0).max(23),
  }),
  activeDays: z.array(z.number().int().min(1).max(7)).default([1, 2, 3, 4, 5, 6, 7]),
  tz: z.string().default('Europe/Moscow'),
});

export const DialogExemplarSchema = z.object({
  chatId: z.string(),
  summary: z.string().max(600),
  outcome: z.enum(['won', 'lost', 'unknown']).default('unknown'),
});

export const StyleProfileSchema = z.object({
  styleGuide: z.string().max(3000).default(''),
  habits: HabitsSchema.default(() => HabitsSchema.parse({})),
  timing: TimingSchema.nullable().default(null),
  phrasebook: z.array(PhrasebookEntrySchema).default([]),
  faq: z.array(SeenQaSchema).max(200).default([]),
  objections: z.array(SeenObjectionSchema).max(100).default([]),
  facts: z.array(z.string().max(500)).max(200).default([]),
  dialogExemplars: z.array(DialogExemplarSchema).max(30).default([]),
});

export type StyleProfile = z.infer<typeof StyleProfileSchema>;
export type Habits = z.infer<typeof HabitsSchema>;
export type Timing = z.infer<typeof TimingSchema>;

/** Правки владельца поверх профиля: заданное поле заменяет выученное. */
export const StyleProfileOverridesSchema = StyleProfileSchema.partial();
export type StyleProfileOverrides = z.infer<typeof StyleProfileOverridesSchema>;

export const EMPTY_STYLE_PROFILE: StyleProfile = StyleProfileSchema.parse({});

/** Что модель извлекает из одной пачки диалогов на шаге map. */
export const DigestPartialSchema = z.object({
  styleObservations: z.array(z.string().max(300)).max(20).default([]),
  phrases: z
    .array(z.object({ intent: z.enum(PHRASE_INTENTS), text: z.string().max(700) }))
    .max(60)
    .default([]),
  faq: z.array(z.object({ q: z.string().max(500), a: z.string().max(1000) })).max(30).default([]),
  objections: z
    .array(z.object({ objection: z.string().max(500), answer: z.string().max(1000) }))
    .max(20)
    .default([]),
  facts: z.array(z.string().max(500)).max(30).default([]),
  exemplars: z
    .array(
      z.object({
        dialogIndex: z.number().int().nonnegative(),
        summary: z.string().max(600),
        outcome: z.enum(['won', 'lost', 'unknown']),
      }),
    )
    .max(5)
    .default([]),
});

export type DigestPartial = z.infer<typeof DigestPartialSchema>;

/**
 * Что модель выдаёт на шаге reduce. Только стиль и фразник: FAQ, возражения и
 * факты сводятся кодом — их сотни, и в один ответ модели они не помещаются.
 */
export const DigestReduceSchema = z.object({
  styleGuide: z.string().max(3000),
  phrasebook: z.array(PhrasebookEntrySchema).default([]),
});

export type DigestReduce = z.infer<typeof DigestReduceSchema>;

/** Профиль с наложенными правками владельца. */
export function applyOverrides(
  profile: StyleProfile,
  overrides: StyleProfileOverrides | null,
): StyleProfile {
  if (!overrides) return profile;
  const merged: StyleProfile = { ...profile };
  for (const key of Object.keys(overrides) as (keyof StyleProfileOverrides)[]) {
    const value = overrides[key];
    if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
}
