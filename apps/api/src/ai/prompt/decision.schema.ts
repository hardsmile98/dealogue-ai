import { z } from 'zod';

/** Что модель возвращает на каждый запуск по чату. */
export const DecisionSchema = z.object({
  /** 1–3 коротких сообщения подряд, как пишут в Telegram. Пусто — если silent. */
  messages: z.array(z.string().max(1500)).max(3).default([]),
  /** Ключ этапа воронки из скрипта. */
  stage: z.string().max(32).default(''),
  confidence: z.number().min(0).max(1).default(0.5),
  /** Клиент готов платить / просит реквизиты — передать менеджеру. */
  ready_to_pay: z.boolean().default(false),
  /** Вопрос вне фактов, конфликт, просьба позвать человека. */
  needs_human: z.boolean().default(false),
  /** Отвечать не нужно («ок», «спасибо», стикер). */
  silent: z.boolean().default(false),
  /** Короткое обоснование — в аудит, клиенту не отправляется. */
  reason: z.string().max(300).default(''),
});

export type Decision = z.infer<typeof DecisionSchema>;

export const DECISION_JSON_SCHEMA = z.toJSONSchema(DecisionSchema) as Record<string, unknown>;
