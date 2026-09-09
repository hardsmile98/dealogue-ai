import type { DigestStyleInput } from './digest-prompts.js';
import { MEDIA_PLACEHOLDER_RE } from './exchange-builder.js';
import type { DigestPartial, StyleProfile } from './style-profile.schema.js';

/** Сколько уникальных наблюдений и фраз уходит в сводку модели. */
const REDUCE_LIMITS = { observations: 150, phrases: 400 };
/** Потолки знаний в профиле — совпадают с ограничениями StyleProfileSchema. */
const KNOWLEDGE_LIMITS = { faq: 200, objections: 100, facts: 200 };

/**
 * Вход сводки: 400 диалогов дают десятки пачек, а их сырая склейка не влезает
 * в контекст модели. Оставляем уникальные наблюдения и фразы, самые частые
 * первыми — при обрезке промпта отсекутся редкие, а не случайные.
 */
export function styleInput(partials: DigestPartial[]): DigestStyleInput {
  return {
    observations: tally(partials.flatMap((p) => p.styleObservations), normalize)
      .slice(0, REDUCE_LIMITS.observations)
      .map(({ item }) => item),
    phrases: tally(
      partials.flatMap((p) => p.phrases).filter((ph) => !MEDIA_PLACEHOLDER_RE.test(ph.text.trim())),
      (ph) => `${ph.intent}:${normalize(ph.text)}`,
    )
      .slice(0, REDUCE_LIMITS.phrases)
      .map(({ item }) => item),
  };
}

/**
 * FAQ, возражения и факты сводим сами: тут нужно объединить одинаковое и
 * посчитать, сколько раз встречалось, — модель добавила бы только риск
 * обрыва ответа, а seen придумала бы на глаз.
 */
export function mergeKnowledge(partials: DigestPartial[]): Pick<StyleProfile, 'faq' | 'objections' | 'facts'> {
  return {
    faq: tally(partials.flatMap((p) => p.faq), (f) => normalize(f.q))
      .slice(0, KNOWLEDGE_LIMITS.faq)
      .map(({ item, seen }) => ({ ...item, seen })),
    objections: tally(partials.flatMap((p) => p.objections), (o) => normalize(o.objection))
      .slice(0, KNOWLEDGE_LIMITS.objections)
      .map(({ item, seen }) => ({ ...item, seen })),
    facts: tally(partials.flatMap((p) => p.facts), normalize)
      .slice(0, KNOWLEDGE_LIMITS.facts)
      .map(({ item }) => item),
  };
}

/** Уникальные элементы со счётчиком повторов, частые первыми. */
function tally<T>(items: T[], key: (item: T) => string): { item: T; seen: number }[] {
  const counted = new Map<string, { item: T; seen: number }>();
  for (const item of items) {
    const hit = counted.get(key(item));
    if (hit) hit.seen += 1;
    else counted.set(key(item), { item, seen: 1 });
  }
  return [...counted.values()].sort((a, b) => b.seen - a.seen);
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 60);
}
