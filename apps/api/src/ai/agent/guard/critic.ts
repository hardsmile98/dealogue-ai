/**
 * Смысловой разбор ответа перед отправкой. Guard рядом проверяет буквы —
 * цены не из фактов, чужие ссылки, повтор приветствия, — и смысловых
 * промахов не видит: ответил не на то, переспросил уже известное, полез
 * уточнять то, что уточнять не надо.
 *
 * Здесь — чистая часть: когда разбор вообще нужен, из чего собирается
 * промпт и что модель должна вернуть. Вызов — в `critic.service.ts`.
 *
 * Разбор стоит второго вызова модели, поэтому зовём его не на каждый ход, а
 * там, где ошибка дороже всего: первый ответ лиду, низкая уверенность и
 * этапы, на которых говорим о деньгах и предложении.
 */

import { z } from 'zod';
import type { ClientCard, FunnelStage } from '../../domain/types.js';
import type { HistoryMessage } from '../agent.types.js';

/** Ниже этой уверенности модель сама сомневается — разбираем ход. */
export const CRITIC_CONFIDENCE = 0.7;

/** Этапы, на которых неудачный ответ стоит дороже обычного. */
export const CRITIC_STAGES: FunnelStage[] = ['ack_request', 'offer', 'price', 'discount'];

/** Сколько последних реплик показываем критику: ему нужен контекст, а не вся переписка. */
const HISTORY_TAIL = 6;
const MAX_VIOLATIONS = 4;

export interface CriticInput {
  stage: FunnelStage;
  /** Цель этапа из плейбука. */
  goal: string;
  /** Задача хода словами — её сформулировал Planner. */
  task: string;
  card: ClientCard;
  age: number | null;
  history: HistoryMessage[];
  /** Новые сообщения клиента, на которые отвечает бот. */
  batch: HistoryMessage[];
  /** Уверенность модели в разборе клиента. */
  confidence: number;
  /** Как бот объяснил, что собирается сделать этим ходом. */
  replyPlan: string | null;
  /** Ответ целиком, уже с подставленными блоками. */
  reply: string;
  /** Первый ответ лиду: переписки до этого хода не было. */
  firstReply: boolean;
}

/**
 * Нужен ли разбор этому ходу. Держим правило чистым и рядом с промптом:
 * его читают, когда спрашивают «почему критик промолчал».
 */
export function shouldReview(input: { stage: FunnelStage; confidence: number; firstReply: boolean }): boolean {
  if (input.firstReply) return true;
  if (input.confidence < CRITIC_CONFIDENCE) return true;
  return CRITIC_STAGES.includes(input.stage);
}

export const CRITIC_SYSTEM = [
  'Ты — придирчивый старший менеджер. Тебе показывают переписку с клиентом и ответ, который твой сотрудник собирается отправить.',
  'Твоя работа — поймать смысловые промахи до отправки. Стиль и формулировки не правишь, орфографию не считаешь ошибкой.',
  '',
  'Отмечай только то, что клиент реально заметит:',
  '1. Ответ не отвечает на то, что спросил или сказал клиент.',
  '2. Бот спрашивает то, что уже знает из карточки или из переписки.',
  '3. Бот уточняет то, что уточнять не нужно: рекламный код или промокод в первом сообщении, служебные пометки, текст рекламного шаблона. Код — это метка объявления, клиент о ней ничего не знает.',
  '4. Ответ не ведёт к цели этапа или противоречит задаче хода.',
  '5. Бот повторяет то, что уже говорил в этой переписке.',
  '6. Ответ звучит как робот или анкета: несколько вопросов подряд, канцелярит, чужой тон.',
  '7. Ответ противоречит карточке клиента (путает пол, имя, возраст, запрос).',
  '',
  'Чего НЕ отмечай: что ответ короткий; что не назвал цену или ссылку (их даёт система); что хотелось бы теплее; всё, что ты не можешь показать на конкретном месте в тексте.',
  'Сомневаешься — значит нарушения нет. Пустой список violations — нормальный и самый частый ответ.',
  'Каждое нарушение — одна фраза в повелительном наклонении о том, что исправить. Без похвалы и без пересказа ответа.',
  'Верни один JSON-объект {ok, violations}.',
].join('\n');

export const CRITIC_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'violations'],
  properties: {
    ok: { type: 'boolean', description: 'true — ответ можно отправлять как есть' },
    violations: {
      type: 'array',
      items: { type: 'string' },
      description: 'Что исправить, по одной фразе на промах. Пустой список, если всё в порядке',
    },
  },
};

export const criticOutputSchema = z.object({
  ok: z.boolean().catch(false),
  violations: z
    .array(z.union([z.string(), z.null()]))
    .catch([])
    .transform((items) =>
      items
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim().slice(0, 300))
        .slice(0, MAX_VIOLATIONS),
    ),
});

export type CriticOutput = z.infer<typeof criticOutputSchema>;

/** Промпт разбора: контекст хода и ответ, который проверяем. */
export function buildCriticPrompt(input: CriticInput): string {
  const lines: string[] = [];

  lines.push(`ЭТАП: ${input.stage}. Цель этапа: ${input.goal || '—'}`);
  lines.push(`ЗАДАЧА ХОДА: ${input.task}`);

  lines.push('');
  lines.push('ЧТО БОТ ЗНАЕТ О КЛИЕНТЕ:');
  const card = input.card;
  lines.push(`- дата рождения: ${card.birthDate ?? card.birthDateText ?? 'нет'}${input.age !== null ? ` (${input.age})` : ''}`);
  lines.push(`- место рождения: ${card.birthPlace ?? 'нет'}`);
  lines.push(`- пол: ${card.gender === 'f' ? 'женский' : card.gender === 'm' ? 'мужской' : 'неизвестен'}`);
  lines.push(`- запрос: ${card.requestSummary ?? 'ещё не выяснен'}`);
  if (card.facts.length > 0) lines.push(`- рассказал о себе: ${card.facts.join('; ')}`);
  if (card.openThreads.length > 0) lines.push(`- открытые нитки: ${card.openThreads.join('; ')}`);

  const tail = input.history.slice(-HISTORY_TAIL);
  lines.push('');
  lines.push('ПЕРЕПИСКА ДО ЭТОГО ХОДА:');
  if (tail.length === 0) lines.push(input.firstReply ? '(это первый ответ клиенту)' : '(переписки нет)');
  for (const message of tail) lines.push(`${role(message)}: ${message.text}`);

  if (input.batch.length > 0) {
    lines.push('');
    lines.push('НА ЧТО ОТВЕЧАЕТ БОТ:');
    for (const message of input.batch) lines.push(`КЛИЕНТ: ${message.text}`);
  }

  if (input.replyPlan) {
    lines.push('');
    lines.push(`ЧТО БОТ СОБИРАЛСЯ СДЕЛАТЬ: ${input.replyPlan}`);
  }

  lines.push('');
  lines.push('ОТВЕТ НА ПРОВЕРКУ:');
  lines.push(input.reply);

  lines.push('');
  lines.push('Верни JSON.');
  return lines.join('\n');
}

function role(message: HistoryMessage): string {
  return message.role === 'client' ? 'КЛИЕНТ' : message.role === 'bot' ? 'БОТ' : 'МЕНЕДЖЕР';
}
