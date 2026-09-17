/**
 * Разбор слотов клиента без LLM: дата рождения и возраст, пол по имени,
 * язык по алфавиту. Всё детерминированно и покрыто тестами — на эти
 * решения (несовершеннолетний, язык) модели не доверяем.
 */

import type { Gender } from '../../domain/types.js';

export interface ParsedBirthDate {
  /** `YYYY-MM-DD`, если год известен. */
  iso: string | null;
  /** Год мог отсутствовать («12 марта») — тогда null. */
  year: number | null;
  month: number;
  day: number;
  /** Как написал клиент. */
  text: string;
}

const MONTHS: [string, number][] = [
  ['январ', 1], ['феврал', 2], ['март', 3], ['апрел', 4], ['мая', 5], ['май', 5], ['июн', 6], ['июл', 7],
  ['август', 8], ['сентябр', 9], ['октябр', 10], ['ноябр', 11], ['декабр', 12],
  ['jan', 1], ['feb', 2], ['mar', 3], ['apr', 4], ['may', 5], ['jun', 6], ['jul', 7], ['aug', 8],
  ['sep', 9], ['oct', 10], ['nov', 11], ['dec', 12],
];

const ISO_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const NUMERIC_RE = /\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{4}|\d{2}))?\b/;
const WORDY_RE = /\b(\d{1,2})\s*(?:-?го)?\s+([а-яёa-z]{3,9})\.?(?:\s+(\d{4}|\d{2})\b(?:\s*г)?)?/i;

/** Ищет дату рождения в свободном тексте. Год из двух цифр — ближайший в прошлом. */
export function parseBirthDate(text: string, now = new Date()): ParsedBirthDate | null {
  const source = text.trim();
  if (!source) return null;

  const iso = ISO_RE.exec(source);
  if (iso) return build(Number(iso[3]), Number(iso[2]), Number(iso[1]), iso[0], now);

  const numeric = NUMERIC_RE.exec(source);
  if (numeric) {
    return build(Number(numeric[1]), Number(numeric[2]), numeric[3] ? Number(numeric[3]) : null, numeric[0], now);
  }

  const wordy = WORDY_RE.exec(source);
  if (wordy) {
    const month = monthByWord(wordy[2]);
    if (month) return build(Number(wordy[1]), month, wordy[3] ? Number(wordy[3]) : null, wordy[0].trim(), now);
  }
  return null;
}

function monthByWord(word: string): number | null {
  const lower = word.toLowerCase();
  for (const [prefix, month] of MONTHS) if (lower.startsWith(prefix)) return month;
  return null;
}

function build(day: number, month: number, yearRaw: number | null, text: string, now: Date): ParsedBirthDate | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let year: number | null = yearRaw;
  if (year !== null && year < 100) {
    const century = Math.floor(now.getFullYear() / 100) * 100;
    year = century + year;
    if (year > now.getFullYear()) year -= 100;
  }
  if (year !== null && (year < 1900 || year > now.getFullYear())) return null;
  const iso = year !== null ? `${year}-${pad(month)}-${pad(day)}` : null;
  if (iso && Number.isNaN(Date.parse(iso))) return null;
  return { iso, year, month, day, text };
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** Полных лет на дату `now`. */
export function ageFrom(iso: string, now = new Date()): number | null {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  let age = now.getUTCFullYear() - y;
  const beforeBirthday = now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

// --- пол по имени -----------------------------------------------------------

const MALE_NAMES = new Set([
  'никита', 'илья', 'данила', 'данил', 'данияр', 'кузьма', 'фома', 'лука', 'савва', 'миша', 'дима',
  'паша', 'ваня', 'лёша', 'леша', 'серёжа', 'сережа', 'коля', 'петя', 'вася', 'толя', 'юра', 'гоша',
  'костя', 'слава', 'витя', 'лёва', 'лева', 'тима', 'муса', 'иса', 'мустафа', 'ильяс', 'nikita',
  'ilya', 'misha', 'dima', 'andrea', 'игорь', 'олег', 'денис', 'марсель',
]);
const FEMALE_NAMES = new Set([
  'любовь', 'нинель', 'айгуль', 'гузель', 'асель', 'жанель', 'аделина', 'элен', 'элина', 'кэтрин',
  'мадина', 'дарья', 'мария', 'анна', 'ольга', 'елена', 'наталья', 'татьяна', 'ирина', 'светлана', 'юлия',
  'екатерина', 'анастасия', 'виктория', 'ксения', 'алина', 'марина', 'оксана', 'полина', 'вера', 'надежда',
  'кристина', 'диана', 'карина', 'регина', 'алёна', 'алена', 'яна', 'инна', 'галина', 'лариса', 'нина',
  'зоя', 'лидия', 'раиса', 'валентина', 'жанна', 'элеонора', 'маргарита', 'вероника', 'ангелина', 'арина',
  'софия', 'софья', 'милана', 'варвара', 'ева', 'лилия', 'римма', 'эльвира', 'альбина', 'гульнара', 'зарина',
  'камила', 'лейла', 'рита', 'катя', 'маша', 'даша', 'настя', 'лена', 'оля', 'таня', 'ира', 'света', 'юля',
  'наташа', 'вика', 'ксюша', 'nadia', 'maria', 'anna', 'olga', 'elena', 'kate', 'anastasia', 'daria', 'julia',
  'ruth', 'beth', 'jane', 'mary', 'sarah', 'emily', 'sophie', 'chloe',
]);
const UNISEX_NAMES = new Set(['саша', 'женя', 'валя', 'шура', 'alex', 'sam', 'andy', 'jamie', 'robin']);

/**
 * Пол по имени: словарь, затем окончание («-а/-я» — женское, кроме
 * известных мужских). Не уверены — null (универсальный текст).
 */
export function guessGenderByName(rawName: string): Gender | null {
  const first = rawName.trim().split(/[\s,._-]+/)[0]?.toLowerCase().replace(/[^a-zа-яё]/g, '') ?? '';
  if (!first || first.length < 2) return null;
  if (UNISEX_NAMES.has(first)) return null;
  if (FEMALE_NAMES.has(first)) return 'f';
  if (MALE_NAMES.has(first)) return 'm';
  if (/[а-яё]/.test(first)) {
    if (/(а|я)$/.test(first)) return 'f';
    if (first.endsWith('ь')) return null;
    return 'm';
  }
  return null;
}

// --- язык -----------------------------------------------------------------

export type DetectedLanguage = 'ru' | 'en' | 'other';

/** Язык текста по алфавиту: кириллица → ru, латиница → en, иначе other; пусто → null. */
export function detectLanguage(text: string): DetectedLanguage | null {
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (!letters) return null;
  let cyrillic = 0;
  let latin = 0;
  for (const ch of letters) {
    if (/[Ѐ-ӿ]/.test(ch)) cyrillic += 1;
    else if (/[A-Za-z]/.test(ch)) latin += 1;
  }
  const total = letters.length;
  if (cyrillic / total >= 0.5) return 'ru';
  if (latin / total >= 0.7) return 'en';
  if (cyrillic > latin) return 'ru';
  return 'other';
}

/** Содержит ли текст вопрос (для проверки «без вопросов на этом шаге»). */
export function hasQuestion(text: string): boolean {
  return text.includes('?');
}

const GREETING_RE =
  /^\s*(привет(ствую)?|здравствуй(те)?|добр(ый|ое|ого)\s+(день|утро|вечер|времени)|доброй\s+ночи|hi|hello|hey|good\s+(morning|afternoon|evening))(?!\p{L})/iu;

export function startsWithGreeting(text: string): boolean {
  return GREETING_RE.test(text);
}

/** Убирает первое предложение-приветствие; если больше ничего нет — пустая строка. */
export function stripLeadingGreeting(text: string): string {
  if (!startsWithGreeting(text)) return text;
  const match = /^[^.!?\n]*[.!?]+\s*|^[^\n]*\n+/.exec(text);
  if (!match) return '';
  return text.slice(match[0].length).trimStart();
}
