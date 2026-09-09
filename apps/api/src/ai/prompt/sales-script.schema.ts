import { z } from 'zod';

/**
 * Ручной скрипт продаж, который владелец заполняет в настройках аккаунта.
 * Хранится в ai_agent_settings.script (jsonb). Имеет приоритет над тем,
 * что ИИ вывел из истории переписок.
 */

export const StageSchema = z.object({
  /** Технический ключ этапа: латиница, цифры, подчёркивание. */
  key: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[a-z0-9_]+$/, 'Ключ этапа: латиница, цифры и подчёркивание'),
  name: z.string().min(1).max(64),
  goal: z.string().max(500).default(''),
  /** Опорные фразы менеджера на этом этапе. */
  templates: z.array(z.string().max(700)).max(20).default([]),
  /** Когда переходить к следующему этапу (текстом для модели). */
  advanceWhen: z.string().max(300).optional(),
});

export const QaPairSchema = z.object({
  q: z.string().min(1).max(500),
  a: z.string().min(1).max(1000),
});

export const ObjectionSchema = z.object({
  objection: z.string().min(1).max(500),
  answer: z.string().min(1).max(1000),
});

export const SalesScriptSchema = z.object({
  /** От чьего лица пишем: «Менеджер Анна, курсы английского». */
  persona: z.string().max(500).default(''),
  /** Тон, если хочется уточнить выученный стиль. */
  tone: z.string().max(500).default(''),
  stages: z.array(StageSchema).max(15).default([]),
  /** Этап, на котором ИИ должен передать клиента менеджеру. */
  handoffStageKey: z.string().max(32).default('payment'),
  facts: z.array(z.string().max(500)).max(100).default([]),
  faq: z.array(QaPairSchema).max(100).default([]),
  objections: z.array(ObjectionSchema).max(50).default([]),
  /** Темы и формулировки, которые запрещены. */
  forbidden: z.array(z.string().max(300)).max(50).default([]),
  /** Что писать клиенту, когда он готов платить (менеджер подключится сам). */
  handoffTemplate: z.string().max(700).default(''),
  /** Ручные примеры стиля — идут первыми среди примеров. */
  pinnedStyleExamples: z.array(z.string().max(700)).max(30).default([]),
});

export type Stage = z.infer<typeof StageSchema>;
export type SalesScript = z.infer<typeof SalesScriptSchema>;

export const FollowupStepSchema = z.object({
  /** Через сколько дней молчания клиента слать это касание (дробные — для тестов). */
  afterDays: z.number().positive().max(90),
  goal: z.string().max(300).default(''),
  template: z.string().max(700).optional(),
});

export const FollowupsSchema = z
  .array(FollowupStepSchema)
  .max(10)
  .superRefine((steps, ctx) => {
    for (let i = 1; i < steps.length; i += 1) {
      if (steps[i].afterDays <= steps[i - 1].afterDays) {
        ctx.addIssue({
          code: 'custom',
          message: 'Шаги дожима должны идти по возрастанию дней',
          path: [i, 'afterDays'],
        });
      }
    }
  });

export type FollowupStep = z.infer<typeof FollowupStepSchema>;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const WorkingHoursSchema = z.object({
  tz: z.string().min(1).max(64),
  /** 1 = понедельник … 7 = воскресенье. */
  days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  from: z.string().regex(TIME_RE, 'HH:MM'),
  to: z.string().regex(TIME_RE, 'HH:MM'),
});

export type WorkingHours = z.infer<typeof WorkingHoursSchema>;

export const DEFAULT_SALES_SCRIPT: SalesScript = SalesScriptSchema.parse({
  stages: [
    {
      key: 'greeting',
      name: 'Приветствие',
      goal: 'Поздороваться, уточнить, что интересует клиента.',
    },
    {
      key: 'qualify',
      name: 'Выяснение потребности',
      goal: 'Понять задачу клиента и его ситуацию, задать 1–2 уточняющих вопроса.',
    },
    {
      key: 'offer',
      name: 'Предложение',
      goal: 'Рассказать о подходящем варианте и условиях, предложить материалы или созвон.',
    },
    {
      key: 'objections',
      name: 'Работа с возражениями',
      goal: 'Ответить на сомнения, не давить, предложить следующий шаг.',
    },
    {
      key: 'payment',
      name: 'Оплата',
      goal: 'Клиент готов оформлять — передать менеджеру.',
    },
  ],
  handoffStageKey: 'payment',
  handoffTemplate: 'Отлично! Сейчас передам всё коллеге, он пришлёт реквизиты и всё оформит.',
});

export const DEFAULT_FOLLOWUPS: FollowupStep[] = [
  { afterDays: 1, goal: 'Мягко напомнить о себе, уточнить, остались ли вопросы.' },
  { afterDays: 3, goal: 'Напомнить о выгоде и условиях, предложить созвон или оформление.' },
  { afterDays: 7, goal: 'Последнее касание: спросить об актуальности, оставить дверь открытой.' },
];
