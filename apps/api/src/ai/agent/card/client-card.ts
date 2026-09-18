/**
 * Карточка клиента: слияние, проекция в колонки, санитайзинг.
 *
 * Карточку ведёт модель — каждый ход она возвращает её целиком, включая
 * исправления уже записанного. Здесь только то, что нельзя отдать модели:
 * значения приводятся к допустимым (длины, формат даты, набор полов),
 * поля менеджера не трогаются, возраст считается арифметикой.
 *
 * Правило слияния одно: `null` от модели значит «не знаю» — прежнее
 * значение остаётся. Стереть поле можно только явно, через `cleared`.
 * Так карточка переживает выпадение старых сообщений из окна истории.
 */

import { CARD_FIELDS } from '../../domain/types.js';
import type { CardField, CardFieldMeta, ClientCard, Gender } from '../../domain/types.js';
import type { AiChatStateEntity } from '../../entities/ai-chat-state.entity.js';

/** Что модель предлагает записать в карточку. Пропущенное и `null` — «не знаю». */
export interface CardProposal {
  birthDate?: string | null;
  birthDateText?: string | null;
  birthPlace?: string | null;
  gender?: Gender | null;
  language?: string | null;
  requestSummary?: string | null;
  requestCategoryKey?: string | null;
  minorHint?: boolean | null;
  /** Элементы чистит `threads()` — от модели прилетает что угодно. */
  openThreads?: unknown[] | null;
  /** Поля, которые нужно именно стереть: клиент поправил себя или отказался. */
  cleared?: string[] | null;
  /** Слова клиента, из которых следует новое значение поля. */
  evidence?: Partial<Record<CardField, string | null>> | null;
}

/** Изменение поля карточки — для события `slot_changed` и журнала хода. */
export interface CardChange {
  field: CardField;
  from: string | null;
  to: string | null;
  evidence: string | null;
}

export interface MergeContext {
  now: Date;
  /** Ход, на котором пришло предложение. */
  turnId?: string | null;
  /** `manual_slots` состояния: поля, которые правил менеджер. */
  manualSlots?: string[];
  /** Язык аккаунта — к нему возвращаемся, если язык стёрли. */
  defaultLanguage?: string;
}

export interface MergeResult {
  card: ClientCard;
  changes: CardChange[];
}

/** Колонки состояния, которые карточка задаёт целиком. */
export type CardColumns = Pick<
  AiChatStateEntity,
  'birthDate' | 'birthDateText' | 'birthPlace' | 'age' | 'isMinor' | 'gender' | 'language' | 'requestCategoryKey' | 'requestSummary'
>;

const MAX = {
  birthDateText: 64,
  birthPlace: 256,
  requestSummary: 1000,
  requestCategoryKey: 64,
  language: 8,
  thread: 200,
  threads: 10,
  evidence: 300,
} as const;

const DEFAULT_LANGUAGE = 'ru';
const ADULT_AGE = 18;

type CardValue = string | boolean | null;

interface FieldRule {
  sanitize(raw: unknown, now: Date): CardValue;
  /** Значение после явного стирания. */
  empty: CardValue;
}

const RULES: Record<CardField, FieldRule> = {
  birthDate: { sanitize: (raw, now) => isoDate(raw, now), empty: null },
  birthDateText: { sanitize: (raw) => text(raw, MAX.birthDateText), empty: null },
  birthPlace: { sanitize: (raw) => text(raw, MAX.birthPlace), empty: null },
  gender: { sanitize: (raw) => (raw === 'f' || raw === 'm' ? raw : null), empty: null },
  language: { sanitize: (raw) => languageCode(raw), empty: null },
  requestSummary: { sanitize: (raw) => text(raw, MAX.requestSummary), empty: null },
  requestCategoryKey: { sanitize: (raw) => text(raw, MAX.requestCategoryKey), empty: null },
  minorHint: { sanitize: (raw) => (typeof raw === 'boolean' ? raw : null), empty: false },
};

/** Какие поля карточки закрывает правка менеджера. */
const LOCKS: Record<string, CardField[]> = {
  birthDate: ['birthDate', 'birthDateText', 'minorHint'],
  birthPlace: ['birthPlace'],
  gender: ['gender'],
  language: ['language'],
  request: ['requestSummary', 'requestCategoryKey'],
};

export function emptyCard(defaultLanguage = DEFAULT_LANGUAGE): ClientCard {
  return {
    birthDate: null,
    birthDateText: null,
    birthPlace: null,
    gender: null,
    language: languageCode(defaultLanguage) ?? DEFAULT_LANGUAGE,
    requestSummary: null,
    requestCategoryKey: null,
    minorHint: false,
    openThreads: [],
    meta: {},
  };
}

/**
 * Карточка из того, что лежит в jsonb: добивает недостающие поля и чистит
 * значения. Пустой объект `{}` (состояние старше карточки) даёт пустую карточку.
 */
export function normalizeCard(raw: unknown, defaultLanguage = DEFAULT_LANGUAGE, now = new Date()): ClientCard {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const card = emptyCard(defaultLanguage);
  for (const field of CARD_FIELDS) {
    const value = RULES[field].sanitize(source[field], now);
    if (value !== null) assign(card, field, value);
  }
  card.openThreads = threads(source.openThreads);
  card.meta = readMeta(source.meta);
  return card;
}

/** Карточка из колонок состояния — для чатов, заведённых до карточки. */
export function cardFromColumns(
  state: Partial<CardColumns>,
  defaultLanguage = DEFAULT_LANGUAGE,
  now = new Date(),
): ClientCard {
  return normalizeCard(
    {
      birthDate: state.birthDate,
      birthDateText: state.birthDateText,
      birthPlace: state.birthPlace,
      gender: state.gender,
      language: state.language,
      requestSummary: state.requestSummary,
      requestCategoryKey: state.requestCategoryKey,
      minorHint: state.isMinor === true && !state.birthDate,
    },
    defaultLanguage,
    now,
  );
}

/**
 * Слияние предложения модели с текущей карточкой. Возвращает новую карточку
 * и список изменений — чем поле стало и на каких словах клиента это основано.
 */
export function mergeCard(current: ClientCard, proposal: CardProposal, ctx: MergeContext): MergeResult {
  const defaultLanguage = ctx.defaultLanguage ?? DEFAULT_LANGUAGE;
  const base = normalizeCard(current, defaultLanguage, ctx.now);
  const locked = lockedFields(ctx.manualSlots ?? []);
  const cleared = new Set(
    (proposal.cleared ?? []).filter((field): field is CardField => (CARD_FIELDS as readonly string[]).includes(field)),
  );
  const at = ctx.now.toISOString();
  const turnId = ctx.turnId ?? null;

  const changes: CardChange[] = [];
  const card = emptyCard(defaultLanguage);
  card.meta = { ...base.meta };

  for (const field of CARD_FIELDS) {
    const before = base[field] as CardValue;
    if (locked.has(field)) {
      assign(card, field, before);
      continue;
    }

    let after: CardValue;
    if (cleared.has(field)) {
      after = field === 'language' ? defaultLanguage : RULES[field].empty;
    } else {
      const proposed = proposal[field];
      const sanitized = proposed === undefined || proposed === null ? null : RULES[field].sanitize(proposed, ctx.now);
      // null от модели значит «не знаю», а не «забудь».
      after = sanitized === null ? before : sanitized;
    }

    assign(card, field, after);
    if (after === before) continue;
    const evidence = text(proposal.evidence?.[field], MAX.evidence);
    changes.push({ field, from: render(before), to: render(after), evidence });
    card.meta[field] = { source: 'llm', evidence, turnId, at };
  }

  card.openThreads =
    proposal.openThreads === undefined || proposal.openThreads === null
      ? base.openThreads
      : threads(proposal.openThreads);
  return { card, changes };
}

/** Отметка правки менеджера: поле фиксируется за ним, модель его больше не трогает. */
export function markManual(card: ClientCard, fields: CardField[], ctx: MergeContext): ClientCard {
  const at = ctx.now.toISOString();
  const next: ClientCard = { ...card, meta: { ...card.meta } };
  for (const field of fields) {
    next.meta[field] = { source: 'manager', evidence: null, turnId: ctx.turnId ?? null, at };
  }
  return next;
}

/** Колонки-слоты из карточки. Возраст и «несовершеннолетний» считает код. */
export function cardToColumns(card: ClientCard, now = new Date()): CardColumns {
  const age = card.birthDate ? ageFrom(card.birthDate, now) : null;
  return {
    birthDate: card.birthDate,
    birthDateText: card.birthDateText,
    birthPlace: card.birthPlace,
    age,
    isMinor: (age !== null && age < ADULT_AGE) || card.minorHint,
    gender: card.gender,
    language: card.language,
    requestCategoryKey: card.requestCategoryKey,
    requestSummary: card.requestSummary,
  };
}

/** Полных лет на дату `now`. */
export function ageFrom(iso: string, now = new Date()): number | null {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return null;
  let age = now.getUTCFullYear() - year;
  const beforeBirthday = now.getUTCMonth() + 1 < month || (now.getUTCMonth() + 1 === month && now.getUTCDate() < day);
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/** Поля карточки, закрытые правками менеджера (`manual_slots`). */
export function lockedFields(manualSlots: string[]): Set<CardField> {
  const locked = new Set<CardField>();
  for (const slot of manualSlots) for (const field of LOCKS[slot] ?? []) locked.add(field);
  return locked;
}

// --- внутреннее -------------------------------------------------------------

function assign(card: ClientCard, field: CardField, value: CardValue): void {
  (card as unknown as Record<CardField, CardValue>)[field] = value;
}

function text(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return value ? value.slice(0, max) : null;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Дата рождения принимается только как YYYY-MM-DD, существующая и не в будущем. */
function isoDate(raw: unknown, now: Date): string | null {
  const value = text(raw, 10);
  if (!value || !ISO_DATE_RE.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  // 31 февраля Date переносит в март — так несуществующие даты и отсеиваются.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  if (year < 1900 || date.getTime() > now.getTime()) return null;
  return value;
}

const LANGUAGE_RE = /^[a-z]{2,3}(-[a-z0-9]{2,4})?$/;

function languageCode(raw: unknown): string | null {
  const value = text(raw, MAX.language);
  if (!value) return null;
  const code = value.toLowerCase();
  return LANGUAGE_RE.test(code) ? code : null;
}

function threads(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const list: string[] = [];
  for (const item of raw) {
    const value = text(item, MAX.thread);
    if (value && !list.includes(value)) list.push(value);
    if (list.length >= MAX.threads) break;
  }
  return list;
}

function readMeta(raw: unknown): Partial<Record<CardField, CardFieldMeta>> {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const result: Partial<Record<CardField, CardFieldMeta>> = {};
  for (const field of CARD_FIELDS) {
    const item = source[field];
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const from = row.source;
    if (from !== 'llm' && from !== 'manager' && from !== 'derived') continue;
    result[field] = {
      source: from,
      evidence: text(row.evidence, MAX.evidence),
      turnId: text(row.turnId, 64),
      at: text(row.at, 32) ?? '',
    };
  }
  return result;
}

function render(value: CardValue): string | null {
  if (value === null) return null;
  if (typeof value === 'boolean') return value ? 'да' : 'нет';
  return value;
}
