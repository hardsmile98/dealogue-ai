import { z } from 'zod';
import { CARD_FIELDS } from '../../domain/types.js';

/**
 * Выход Composer (раздел 4.2 ТЗ): понимание + ответ одним JSON-объектом.
 * Схема терпима к мелким отклонениям модели (лишний null, строка вместо
 * числа), но не к отсутствию reply.
 *
 * Понимание клиента приходит карточкой целиком: модель каждый ход
 * возвращает всё, что знает о человеке, и вправе исправлять записанное
 * раньше. `null` в поле значит «не знаю» — прежнее значение останется;
 * стереть поле можно только через `cleared`. Слияние — в agent/card.
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

const cardSchema = z
  .object({
    birthDate: nullableText(32),
    birthDateText: nullableText(64),
    birthPlace: nullableText(256),
    gender: z.enum(['f', 'm']).nullable().catch(null),
    language: nullableText(8),
    requestSummary: nullableText(1000),
    requestCategoryKey: nullableText(64),
    minorHint: z.boolean().nullable().catch(null),
    openThreads: z.array(z.unknown()).nullable().catch(null),
    cleared: z.array(z.string()).nullable().catch(null),
    evidence: z
      .array(z.object({ field: z.string(), quote: z.string() }))
      .nullable()
      .catch(null),
  })
  .partial()
  .catch({});

export const composerOutputSchema = z.object({
  analysis: z
    .object({
      clientIntent: nullableText(500),
      card: cardSchema,
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
      clientIntent: null,
      card: {},
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
      required: ['clientIntent', 'card', 'escalation', 'stageProgress', 'confidence'],
      properties: {
        clientIntent: { type: ['string', 'null'], description: 'Коротко: чего хочет клиент' },
        card: {
          type: 'object',
          additionalProperties: false,
          description: 'Карточка клиента целиком: всё, что ты о нём знаешь сейчас. null — не знаю, прежнее значение останется',
          required: [...CARD_FIELDS, 'openThreads', 'cleared', 'evidence'],
          properties: {
            birthDate: { type: ['string', 'null'], description: 'YYYY-MM-DD; год неизвестен — null' },
            birthDateText: { type: ['string', 'null'], description: 'Как написал клиент' },
            birthPlace: { type: ['string', 'null'] },
            gender: { type: ['string', 'null'], enum: ['f', 'm', null], description: 'Пол клиента по имени, самоописанию и грамматике' },
            language: { type: ['string', 'null'], description: 'Язык клиента кодом: ru, en, kk, uk…' },
            requestSummary: { type: ['string', 'null'], description: 'Суть запроса клиента своими словами, 1–2 фразы' },
            requestCategoryKey: { type: ['string', 'null'], description: 'Ключ категории из списка или null' },
            minorHint: { type: ['boolean', 'null'], description: 'Клиент сказал, что ему нет 18, а даты рождения не дал' },
            openThreads: {
              type: ['array', 'null'],
              items: { type: 'string' },
              description: 'Открытые нитки: неотвеченные вопросы клиента, возражения, что ты обещал. Пустой список — всё закрыто',
            },
            cleared: {
              type: ['array', 'null'],
              items: { type: 'string' },
              description: 'Поля, которые нужно стереть: клиент поправил себя или отказался отвечать',
            },
            evidence: {
              type: ['array', 'null'],
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['field', 'quote'],
                properties: {
                  field: { type: 'string' },
                  quote: { type: 'string', description: 'Слова клиента, из которых следует значение' },
                },
              },
              description: 'Основания для полей, которые ты изменил в этот ход',
            },
          },
        },
        escalation: {
          type: ['object', 'null'],
          additionalProperties: false,
          required: ['reason', 'note'],
          properties: {
            reason: { type: 'string', enum: [...ESCALATION_REASONS] },
            note: { type: ['string', 'null'] },
          },
        },
        stageProgress: { type: 'string', description: '"stay" | "advance" | "jump:<этап>"' },
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
