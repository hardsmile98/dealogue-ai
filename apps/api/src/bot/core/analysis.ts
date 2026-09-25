import type { ClientFactKind } from '../entities/bot-client-fact.entity.js';
import {
  GENDERS,
  LANGUAGES,
  OBJECTION_CATEGORIES,
  isRequestCategory,
} from '../library/kinds.js';
import type { Gender } from '../library/kinds.js';
import { parseJsonObject, stringList } from './json.js';
import { ANSWER_TOPICS, INTENTS, MOODS, RISK_FLAGS } from './types.js';
import type {
  Analysis,
  AnswerPoint,
  AnswerTopic,
  CardField,
  ClientCard,
  ClientFact,
  Intent,
  Mood,
  RiskFlag,
} from './types.js';

const FACT_KINDS: readonly ClientFactKind[] = [
  'situation',
  'emotion',
  'objection',
  'biography',
  'preference',
  'expectation',
];

export class AnalysisParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalysisParseError';
  }
}

/** Как модель может назвать язык вместо кода — сводится к коду из LANGUAGES. */
const LANGUAGE_NAMES: Record<string, string> = {
  russian: 'ru',
  русский: 'ru',
  rus: 'ru',
  english: 'en',
  английский: 'en',
  eng: 'en',
};

/**
 * Разбор JSON анализатора в нормальную форму. Каждое поле, по которому код
 * принимает решения, — значение из закрытого списка: незнакомое
 * отбрасывается, а не угадывается. Ошибка только если это вообще не объект.
 */
export function parseAnalysis(
  raw: string,
  sourceMessageId: number | null,
): Analysis {
  const data = parseJsonObject(raw);
  if (!data) throw new AnalysisParseError('Анализатор вернул не JSON-объект');
  const summary = typeof data.summary === 'string' ? data.summary.trim() : '';

  return {
    card: parseCard(data.card, sourceMessageId),
    facts: parseFacts(data.facts, sourceMessageId),
    supersedes: stringList(data.supersedes),
    summary,
    language: parseLanguage(data.language),
    risk: pickKnown(data.risk, RISK_FLAGS) as RiskFlag[],
    intents: pickKnown(data.intents, INTENTS) as Intent[],
    objection: (OBJECTION_CATEGORIES as readonly string[]).includes(
      String(data.objection),
    )
      ? (data.objection as string)
      : null,
    interest: clampInt(data.interest, 0, 3),
    mood: (MOODS as readonly string[]).includes(String(data.mood))
      ? (data.mood as Mood)
      : 'calm',
    answerPoints: parseAnswerPoints(data.answerPoints ?? data.answer_points),
  };
}

function parseCard(raw: unknown, sourceMessageId: number | null): ClientCard {
  if (typeof raw !== 'object' || raw === null) return {};
  const source = raw as Record<string, unknown>;
  const card: ClientCard = {};
  const text = (key: string): CardField<string> | undefined =>
    field(source[key], sourceMessageId, (v) =>
      typeof v === 'string' && v.trim() ? v.trim() : null,
    );
  card.name = text('name');
  card.birthDate = text('birthDate') ?? text('birth_date');
  card.birthPlace = text('birthPlace') ?? text('birth_place');
  card.gender = field(source.gender, sourceMessageId, (v) =>
    (GENDERS as readonly string[]).includes(String(v)) ? (v as Gender) : null,
  );
  card.category = field(source.category, sourceMessageId, (v) =>
    typeof v === 'string' && isRequestCategory(v) ? v : null,
  );
  for (const key of Object.keys(card) as (keyof ClientCard)[]) {
    if (card[key] === undefined) delete card[key];
  }
  return card;
}

/** Поле карточки: `{ value, confidence }` или голое значение (уверенность 1). */
function field<T>(
  raw: unknown,
  sourceMessageId: number | null,
  coerce: (value: unknown) => T | null,
): CardField<T> | undefined {
  if (raw === null || raw === undefined) return undefined;
  let value: unknown = raw;
  let confidence = 1;
  if (typeof raw === 'object') {
    const object = raw as Record<string, unknown>;
    value = object.value;
    confidence = clamp01(object.confidence);
  }
  const coerced = coerce(value);
  if (coerced === null) return undefined;
  // Совсем неуверенное значение — это «не знаю», а не поле карточки.
  if (confidence < 0.3) return undefined;
  const result: CardField<T> = { value: coerced, confidence };
  if (sourceMessageId !== null) result.sourceMessageId = sourceMessageId;
  return result;
}

function parseFacts(
  raw: unknown,
  sourceMessageId: number | null,
): ClientFact[] {
  if (!Array.isArray(raw)) return [];
  const facts: ClientFact[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const object = item as Record<string, unknown>;
    const text = typeof object.text === 'string' ? object.text.trim() : '';
    if (!text) continue;
    const kind = FACT_KINDS.includes(object.kind as ClientFactKind)
      ? (object.kind as ClientFactKind)
      : 'situation';
    facts.push({
      kind,
      text,
      confidence: clamp01(object.confidence ?? 1),
      sourceMessageId,
    });
  }
  return facts;
}

function parseAnswerPoints(raw: unknown): AnswerPoint[] {
  if (!Array.isArray(raw)) return [];
  const points: AnswerPoint[] = [];
  raw.forEach((item, index) => {
    if (typeof item === 'string') {
      if (item.trim())
        points.push({
          id: `p${index + 1}`,
          text: item.trim(),
          kind: 'other',
          topic: 'other',
          skip: false,
        });
      return;
    }
    if (typeof item !== 'object' || item === null) return;
    const object = item as Record<string, unknown>;
    const text = typeof object.text === 'string' ? object.text.trim() : '';
    if (!text) return;
    const kind = ['question', 'fact', 'request', 'emotion'].includes(
      String(object.kind),
    )
      ? (object.kind as AnswerPoint['kind'])
      : 'other';
    const topic = (ANSWER_TOPICS as readonly string[]).includes(
      String(object.topic),
    )
      ? (object.topic as AnswerTopic)
      : 'other';
    points.push({
      id: `p${index + 1}`,
      text,
      kind,
      topic,
      skip: object.skip === true,
    });
  });
  return points;
}

/** Код из LANGUAGES, 'other' для любого другого языка, null — «не понять». */
export function parseLanguage(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  if (!value || value === 'null' || value === 'unknown') return null;
  const code = LANGUAGE_NAMES[value] ?? value.split(/[-_]/)[0] ?? value;
  return (LANGUAGES as readonly string[]).includes(code) ? code : 'other';
}

function pickKnown(raw: unknown, known: readonly string[]): string[] {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw.filter(
        (item): item is string =>
          typeof item === 'string' && known.includes(item),
      ),
    ),
  ];
}

function clamp01(raw: unknown): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

function clampInt(raw: unknown, min: number, max: number): number {
  const value = Math.round(Number(raw));
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
