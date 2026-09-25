import type { Gender } from '../library/kinds.js';
import type {
  Analysis,
  CardField,
  ClientCard,
  ClientFact,
  Memory,
  SaidEntry,
} from './types.js';

/** Ниже этих порогов пол и категория считаются неизвестными (раздел 4). */
export const GENDER_CONFIDENCE = 0.8;
export const CATEGORY_CONFIDENCE = 0.7;
/** Сколько активных фактов идёт в промпт. */
export const FACTS_LIMIT = 30;
/**
 * Сменить уже известный язык может только ход, где клиент написал хотя бы
 * столько букв: «ok», «👍» или имя на латинице диалог не переключают.
 */
export const LANGUAGE_SWITCH_MIN_LETTERS = 20;

/** Карточка из jsonb: поля без value отбрасываются. */
export function readCard(raw: unknown): ClientCard {
  if (typeof raw !== 'object' || raw === null) return {};
  const source = raw as Record<string, unknown>;
  const card: ClientCard = {};
  for (const key of [
    'name',
    'gender',
    'birthDate',
    'birthPlace',
    'category',
    'language',
  ] as const) {
    const field = source[key];
    if (typeof field !== 'object' || field === null) continue;
    const { value, confidence, sourceMessageId } = field as Partial<
      CardField<unknown>
    >;
    if (value === undefined || value === null || value === '') continue;
    const normalized: CardField<string> = {
      value: String(value),
      confidence: typeof confidence === 'number' ? confidence : 1,
    };
    if (typeof sourceMessageId === 'number')
      normalized.sourceMessageId = sourceMessageId;
    (card as Record<string, CardField<string>>)[key] = normalized;
  }
  return card;
}

/**
 * Новое значение поля берётся, если оно увереннее старого или старого нет.
 * Так одно неуверенное «кажется, женщина» не затрёт уверенный ответ клиента.
 */
export function mergeCard(current: ClientCard, update: ClientCard): ClientCard {
  const merged: ClientCard = { ...current };
  for (const key of Object.keys(update) as (keyof ClientCard)[]) {
    const next = update[key] as CardField<string> | undefined;
    if (!next) continue;
    const previous = merged[key] as CardField<string> | undefined;
    if (!previous || next.confidence >= previous.confidence) {
      (merged as Record<string, CardField<string>>)[key] = next;
    }
  }
  return merged;
}

/** Пол для выбора диагностики: только при достаточной уверенности. */
export function knownGender(card: ClientCard): Gender | null {
  const field = card.gender;
  return field && field.confidence >= GENDER_CONFIDENCE ? field.value : null;
}

export function knownCategory(card: ClientCard): string | null {
  const field = card.category;
  return field && field.confidence >= CATEGORY_CONFIDENCE ? field.value : null;
}

export function hasBirthData(card: ClientCard): boolean {
  return Boolean(card.birthDate?.value && card.birthPlace?.value);
}

export function clientLanguage(card: ClientCard, fallback = 'ru'): string {
  return card.language?.value ?? fallback;
}

export interface FactsUpdate {
  /** Что добавить. */
  added: ClientFact[];
  /** Тексты активных фактов, которые нужно пометить superseded. */
  superseded: string[];
}

/**
 * Новые факты из анализа: дубликаты (тот же текст без учёта регистра)
 * не добавляются, противоречия помечают старые факты. Результат — что
 * записать в базу и новый список активных фактов для промпта.
 */
export function applyFacts(
  active: readonly ClientFact[],
  analysis: Analysis,
): { facts: ClientFact[]; update: FactsUpdate } {
  const normalize = (text: string) => text.trim().toLowerCase();
  const superseded = new Set(analysis.supersedes.map(normalize));
  const kept = active.filter((fact) => !superseded.has(normalize(fact.text)));
  const known = new Set(kept.map((fact) => normalize(fact.text)));
  const added: ClientFact[] = [];
  for (const fact of analysis.facts) {
    const key = normalize(fact.text);
    if (known.has(key)) continue;
    known.add(key);
    added.push(fact);
  }
  const facts = [...added, ...kept].slice(0, FACTS_LIMIT);
  return {
    facts,
    update: {
      added,
      superseded: active
        .filter((fact) => superseded.has(normalize(fact.text)))
        .map((fact) => fact.text),
    },
  };
}

/** Сколько букв в тексте (любой письменности); цифры, эмодзи и знаки не считаются. */
export function letterCount(text: string): number {
  let count = 0;
  for (const char of text)
    if (char.toLowerCase() !== char.toUpperCase()) count += 1;
  return count;
}

/**
 * Язык карточки «липкий»: первый определённый язык записывается сразу,
 * смена — только по ходу с настоящим текстом. Так план и ответчик не
 * прыгают между языками от реплики к реплике.
 */
export function nextLanguage(
  card: ClientCard,
  detected: string | null,
  newText: string,
): ClientCard['language'] {
  const current = card.language;
  if (!detected || detected === current?.value) return current;
  if (!current || letterCount(newText) >= LANGUAGE_SWITCH_MIN_LETTERS)
    return { value: detected, confidence: 1 };
  return current;
}

/** Память после анализа — то, что видят план и ответчик в этом ходе. */
export function applyAnalysis(
  memory: Memory,
  analysis: Analysis,
  newText = '',
): { memory: Memory; factsUpdate: FactsUpdate } {
  const { facts, update } = applyFacts(memory.facts, analysis);
  const card = mergeCard(memory.card, analysis.card);
  const language = nextLanguage(memory.card, analysis.language, newText);
  if (language) card.language = language;
  return {
    memory: {
      card,
      facts,
      summary: analysis.summary || memory.summary,
      said: memory.said,
    },
    factsUpdate: update,
  };
}

/** Сколько раз подход по категории возражения уже использован. */
export function argumentsUsed(
  said: readonly SaidEntry[],
  category: string,
): number {
  return said.filter(
    (entry) =>
      entry.kind === 'argument' && entry.key.startsWith(`${category}:`),
  ).length;
}

export function nudgesSaid(said: readonly SaidEntry[], nudge: string): number {
  return said.filter((entry) => entry.kind === 'nudge' && entry.key === nudge)
    .length;
}
