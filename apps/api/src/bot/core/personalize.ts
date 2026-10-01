import {
  containsMoney,
  countQuestions,
  extractUrls,
  plainDashes,
  wrongScript,
} from './hard-checks.js';

/**
 * Диагностика под клиента (решение владельца 01.10.2026): модель
 * подстраивает готовый текст из библиотеки — связывает начало с тем, с чем
 * клиент пришёл, и чуть иначе говорит ещё несколько абзацев. Остальной
 * текст уходит как в библиотеке. Модель возвращает только правки абзацев;
 * код решает, принять ли каждую: правка, которая переписала абзац слишком
 * сильно, добавила вопрос, сумму или ссылку, не проходит — абзац уходит как
 * в библиотеке. Проверки здесь только синтаксические (доля общих слов,
 * длина, знаки), смысл держит промпт.
 */

/** Сколько абзацев модель может поменять за раз: начало и ещё до четырёх. */
export const MAX_PERSONAL_EDITS = 5;

/** Абзац короче — короткая строка вроде «Я вернулся ☺️»: ей можно добавить больше своего. */
const SHORT_PARAGRAPH_WORDS = 12;
/** Доля общих слов с абзацем из библиотеки (Dice по словам), ниже которой правка — уже другой текст. */
const MIN_SIMILARITY_SHORT = 0.3;
const MIN_SIMILARITY = 0.5;
/** Насколько правка может отличаться по длине от абзаца из библиотеки. */
const MIN_LENGTH_SHARE = 0.6;
const MAX_LENGTH_SHARE = 1.6;
/** Короткому абзацу можно дописать одну фразу о клиенте. */
const MAX_ADDED_CHARS = 160;
/** Служебное, что не должно дойти до клиента. */
const MARKUP = ['{{', '}}', '"edits"', '"text"'];

export interface PersonalizationEdit {
  /** Номер абзаца с 1, как в промпте. */
  n: number;
  text: string;
}

export interface PersonalizeResult {
  /** Текст, который уйдёт клиенту. */
  text: string;
  /** Номера абзацев, которые поменялись. */
  applied: number[];
  /** Правки, которые не прошли проверки, — в журнал. */
  rejected: { n: number; reason: string }[];
}

/**
 * Текст по абзацам: чётные куски — абзацы, нечётные — переносы между ними
 * ровно как в библиотеке, чтобы нетронутое ушло побайтно. Абзац — строка
 * между переносами; пустые строки — часть переноса.
 */
export interface Paragraphs {
  pieces: string[];
  /** Номер абзаца для модели (с 1) → индекс в `pieces`. */
  numbered: number[];
}

export function splitParagraphs(text: string): Paragraphs {
  const pieces = text.split(/(\n\s*)/u);
  const numbered: number[] = [];
  pieces.forEach((piece, index) => {
    if (index % 2 === 0 && piece.trim()) numbered.push(index);
  });
  return { pieces, numbered };
}

/** Абзацы с номерами — как их видит модель. */
export function numberedParagraphs(text: string): string[] {
  const { pieces, numbered } = splitParagraphs(text);
  return numbered.map(
    (index, position) => `[${position + 1}] ${(pieces[index] ?? '').trim()}`,
  );
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Доля общих слов двух текстов (коэффициент Дайса по словам с повторами): 1 — те же слова. */
export function wordSimilarity(a: string, b: string): number {
  const left = words(a);
  const right = words(b);
  if (left.length + right.length === 0) return 1;
  const counts = new Map<string, number>();
  for (const word of left) counts.set(word, (counts.get(word) ?? 0) + 1);
  let common = 0;
  for (const word of right) {
    const count = counts.get(word) ?? 0;
    if (count > 0) {
      common += 1;
      counts.set(word, count - 1);
    }
  }
  return (2 * common) / (left.length + right.length);
}

/** Почему правку абзаца нельзя принять; null — можно. */
function editProblem(
  before: string,
  after: string,
  language: string,
): string | null {
  if (!after) return 'пустой абзац';
  if (MARKUP.some((mark) => after.includes(mark))) return 'служебная разметка';
  const urls = new Set(extractUrls(before));
  if (extractUrls(after).some((url) => !urls.has(url))) return 'новая ссылка';
  if (containsMoney(after) && !containsMoney(before)) return 'сумма';
  const questions = countQuestions([before]);
  const newQuestions = countQuestions([after]);
  if (newQuestions > questions) return 'новый вопрос';
  if (questions > 0 && newQuestions === 0) return 'пропал вопрос';
  if (wrongScript(after, language)) return 'не тот язык';
  if (after.length < before.length * MIN_LENGTH_SHARE) return 'сильно короче';
  if (
    after.length >
    Math.max(before.length * MAX_LENGTH_SHARE, before.length + MAX_ADDED_CHARS)
  )
    return 'сильно длиннее';
  const short = words(before).length < SHORT_PARAGRAPH_WORDS;
  const similarity = wordSimilarity(before, after);
  if (similarity < (short ? MIN_SIMILARITY_SHORT : MIN_SIMILARITY))
    return `переписан слишком сильно (${similarity.toFixed(2)})`;
  return null;
}

/**
 * Правки модели поверх текста из библиотеки. Каждая проверяется отдельно:
 * не прошла — этот абзац уходит как в библиотеке, остальные правки
 * остаются. Правок больше `MAX_PERSONAL_EDITS` — лишние не применяются.
 * Пробелы по краям абзаца и переносы между абзацами — как в библиотеке.
 */
export function applyPersonalization(
  original: string,
  edits: readonly PersonalizationEdit[],
  language: string,
): PersonalizeResult {
  const { pieces, numbered } = splitParagraphs(original);
  const applied: number[] = [];
  const rejected: PersonalizeResult['rejected'] = [];
  const seen = new Set<number>();
  const ordered = [...edits].sort((a, b) => a.n - b.n);
  for (const edit of ordered) {
    const index = numbered[edit.n - 1];
    if (index === undefined || seen.has(edit.n)) {
      rejected.push({ n: edit.n, reason: 'нет такого абзаца' });
      continue;
    }
    seen.add(edit.n);
    if (applied.length >= MAX_PERSONAL_EDITS) {
      rejected.push({
        n: edit.n,
        reason: `больше ${MAX_PERSONAL_EDITS} правок`,
      });
      continue;
    }
    const piece = pieces[index] ?? '';
    const before = piece.trim();
    // Модель могла повторить номер абзаца из промпта: «[3] …».
    const cleaned = edit.text.replace(/^\s*\[\d+\]\s*/u, '').trim();
    // Длинное тире — примета машинного текста: в библиотеке практик пишет дефис.
    const after = before.includes('—') ? cleaned : plainDashes(cleaned);
    if (after === before) continue;
    const problem = editProblem(before, after, language);
    if (problem) {
      rejected.push({ n: edit.n, reason: problem });
      continue;
    }
    const lead = piece.slice(0, piece.length - piece.trimStart().length);
    const tail = piece.slice(piece.trimEnd().length);
    pieces[index] = `${lead}${after}${tail}`;
    applied.push(edit.n);
  }
  return { text: pieces.join(''), applied, rejected };
}
