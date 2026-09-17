import { z } from 'zod';

/**
 * Выход Composer (раздел 4.2 ТЗ): понимание + ответ одним JSON-объектом.
 * Схема терпима к мелким отклонениям модели (лишний null, строка вместо
 * числа), но не к отсутствию reply.
 */

export const ESCALATION_REASONS = [
  'ready_to_pay',
  'suspects_bot',
  'wants_human',
  'aggression',
  'crisis',
  'minor',
  'refusal',
  'out_of_scope',
  'unsure',
] as const;

export type EscalationReason = (typeof ESCALATION_REASONS)[number];

const nullableText = (max: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null));

export const composerOutputSchema = z.object({
  analysis: z
    .object({
      language: z.enum(['ru', 'en', 'other']).catch('ru'),
      clientIntent: nullableText(500),
      slots: z
        .object({
          birthDate: nullableText(32),
          birthDateText: nullableText(64),
          birthPlace: nullableText(256),
          requestSummary: nullableText(1000),
          requestCategoryKey: nullableText(64),
          genderHint: z.enum(['f', 'm']).nullable().catch(null),
          isMinorHint: z.boolean().catch(false),
        })
        .partial()
        .catch({}),
      unansweredQuestion: nullableText(500),
      escalation: z
        .object({
          reason: z.enum(ESCALATION_REASONS),
          note: nullableText(500),
        })
        .nullable()
        .catch(null),
      stageProgress: z.string().max(64).catch('stay'),
      confidence: z.coerce.number().min(0).max(1).catch(0.7),
    })
    .catch({
      language: 'ru',
      clientIntent: null,
      slots: {},
      unansweredQuestion: null,
      escalation: null,
      stageProgress: 'stay',
      confidence: 0.7,
    }),
  reply: z.object({
    send: z.boolean().catch(true),
    messages: z.array(z.union([z.string(), z.null()])).transform((items) =>
      items.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()),
    ),
    silentReason: nullableText(300),
  }),
});

export type ComposerOutput = z.infer<typeof composerOutputSchema>;
export type ComposerAnalysis = ComposerOutput['analysis'];

/** Схема для провайдера (в промпте или response_format). */
export const COMPOSER_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['analysis', 'reply'],
  properties: {
    analysis: {
      type: 'object',
      additionalProperties: false,
      required: ['language', 'clientIntent', 'slots', 'unansweredQuestion', 'escalation', 'stageProgress', 'confidence'],
      properties: {
        language: { type: 'string', enum: ['ru', 'en', 'other'] },
        clientIntent: { type: ['string', 'null'], description: 'Коротко: чего хочет клиент' },
        slots: {
          type: 'object',
          additionalProperties: false,
          required: ['birthDate', 'birthDateText', 'birthPlace', 'requestSummary', 'requestCategoryKey', 'genderHint', 'isMinorHint'],
          properties: {
            birthDate: { type: ['string', 'null'], description: 'YYYY-MM-DD, если год известен' },
            birthDateText: { type: ['string', 'null'], description: 'Как написал клиент' },
            birthPlace: { type: ['string', 'null'] },
            requestSummary: { type: ['string', 'null'], description: 'Суть запроса клиента своими словами, 1–2 фразы' },
            requestCategoryKey: { type: ['string', 'null'], description: 'Ключ категории из списка или null' },
            genderHint: { type: ['string', 'null'], enum: ['f', 'm', null] },
            isMinorHint: { type: 'boolean' },
          },
        },
        unansweredQuestion: { type: ['string', 'null'] },
        escalation: {
          type: ['object', 'null'],
          additionalProperties: false,
          required: ['reason', 'note'],
          properties: {
            reason: { type: 'string', enum: [...ESCALATION_REASONS] },
            note: { type: ['string', 'null'] },
          },
        },
        stageProgress: { type: 'string', description: '"stay" | "advance" | "jump:<stage>"' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
    },
    reply: {
      type: 'object',
      additionalProperties: false,
      required: ['send', 'messages', 'silentReason'],
      properties: {
        send: { type: 'boolean' },
        messages: { type: 'array', items: { type: 'string' }, description: 'Сообщения по порядку; блок — отдельным элементом-маркером' },
        silentReason: { type: ['string', 'null'] },
      },
    },
  },
};
