import type { FinalPart, ReviewViolation } from './types.js';

/** Лимит Telegram на одно сообщение. */
export const MESSAGE_MAX_LENGTH = 4096;

export interface HardCheckInput {
  /** Сообщения ответчика; тело вехи встаёт после них (или перед ними — `afterBlock`). */
  parts: readonly string[];
  /** Тело вехи, если она в плане: уходит побайтно, как в библиотеке. */
  block: string | null;
  /** Текст ответчика идёт после тела вехи (вопрос после диагностики). */
  afterBlock?: boolean;
  /** Адреса из образа и библиотеки. */
  allowedUrls: ReadonlySet<string>;
  language: string;
  maxParts: number;
}

export interface HardCheckResult {
  parts: FinalPart[];
  removed: { part: string; reason: string }[];
  /** Отправлять нечего (ни текста, ни вехи) — нужна запасная фраза. */
  blocked: boolean;
}

/*
 * Здесь только синтаксические проверки — то, что однозначно видно по
 * символам. Смысл (о чём вопрос, какая тема, что выдумано) определяют
 * анализатор и проверяющий, код текст по смыслу не разбирает.
 */

/** Число рядом с валютой: «250 €», «€250», «1 200 руб.», «99$». Слово валюты не может продолжаться буквой («европейский»). */
const MONEY_RE =
  /(?:\d[\d\s.,]*\s*(?:[€$₽₴₸£]|(?:руб(?:л[а-яё]*)?|р\.|евро|долл[а-яё]*|гривн[а-яё]*|грн|тенге|eur(?:os?)?|usd|rub|uah|kzt|dollars?)(?!\p{L})))|(?:[€$₽₴₸£]\s*\d)/iu;
const URL_RE = /(?:https?:\/\/|www\.|t\.me\/|instagram\.com\/)[^\s)»"']+/giu;
/** Служебная разметка промптов, которая не должна дойти до клиента. */
const MARKUP = ['{{', '}}', '"messages"', '"after_block"'];

/** Есть ли в тексте сумма с валютой. Ответчик не называет сумм никогда — цены уходят только телом вехи. */
export function containsMoney(text: string): boolean {
  return MONEY_RE.test(text);
}

/** Хвост после последней буквы или цифры, в котором есть «?»: «…подробнее? 🙏🏻». */
const QUESTION_END_RE = /\?[^\p{L}\p{N}]*$/u;

/** Текст заканчивается вопросом клиенту — после него агенту не нужен свой вопрос. */
export function endsWithQuestion(text: string): boolean {
  return QUESTION_END_RE.test(text.trim());
}

export function extractUrls(text: string): string[] {
  return [...text.matchAll(URL_RE)].map((match) => normalizeUrl(match[0]));
}

export function normalizeUrl(url: string): string {
  return url
    .trim()
    .replace(/[.,;:!?)]+$/u, '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/u, '')
    .toLowerCase();
}

/** Сколько вопросов клиенту в тексте: знаки «?», подряд идущие — один. */
export function countQuestions(parts: readonly string[]): number {
  return parts.reduce(
    (sum, part) => sum + (part.match(/\?+/gu)?.length ?? 0),
    0,
  );
}

/** Короче этого одинаковые сообщения — не повтор, а обычная реплика («Понял вас 🙏»). */
const REPEAT_MIN_LETTERS = 20;

/** Текст для сравнения: только буквы и цифры в нижнем регистре. */
function comparable(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

export interface DraftCheckInput {
  parts: readonly string[];
  /** Сколько вопросов разрешает план (`plan.constraints.maxQuestions`). */
  maxQuestions: number;
  /** Наши прошлые сообщения в чате. */
  previous: readonly string[];
}

/**
 * Нарушения черновика, видные по символам: вопросов больше, чем просит
 * план, или сообщение слово в слово повторяет наше прошлое. Идут вместе с
 * замечаниями проверяющего, и ответчик переписывает текст; отправку они не
 * блокируют.
 */
export function draftViolations(input: DraftCheckInput): ReviewViolation[] {
  const violations: ReviewViolation[] = [];
  const questions = countQuestions(input.parts);
  if (questions > input.maxQuestions) {
    violations.push({
      code: 'extra_question',
      severity: 'hard',
      detail:
        input.maxQuestions === 0
          ? `вопросов в тексте: ${questions}, а план вопросов не просит — убери их`
          : `вопросов в тексте: ${questions}, а план разрешает ${input.maxQuestions} — оставь только вопрос из плана`,
    });
  }
  const seen = new Set(input.previous.map(comparable));
  for (const part of input.parts) {
    const text = comparable(part);
    if (text.length >= REPEAT_MIN_LETTERS && seen.has(text)) {
      violations.push({
        code: 'self_repeat',
        severity: 'hard',
        detail: `сообщение слово в слово повторяет твоё прошлое: «${part.trim()}» — скажи иначе`,
      });
    }
  }
  return violations;
}

/** Письменность языка; для языков без записи проверка не делается. */
const LANGUAGE_SCRIPTS: Record<string, RegExp> = {
  ru: /\p{Script=Cyrillic}/u,
  en: /\p{Script=Latin}/u,
};
/** Проверяем только достаточно длинный текст и только явный промах: своей письменности меньше трети букв. */
const SCRIPT_MIN_LETTERS = 30;
const SCRIPT_MIN_SHARE = 1 / 3;

/**
 * Часть явно написана не той письменностью: русский ответ латиницей или
 * английский кириллицей. Адреса и @-ники не считаются. Это страховка от
 * грубого сбоя модели, а не определение языка — язык задаёт анализатор.
 */
export function wrongScript(text: string, language: string): boolean {
  const script = LANGUAGE_SCRIPTS[language];
  if (!script) return false;
  const cleaned = text.replace(URL_RE, ' ').replace(/@\w+/gu, ' ');
  let letters = 0;
  let own = 0;
  for (const char of cleaned) {
    if (char.toLowerCase() === char.toUpperCase()) continue;
    letters += 1;
    if (script.test(char)) own += 1;
  }
  return letters >= SCRIPT_MIN_LETTERS && own / letters < SCRIPT_MIN_SHARE;
}

/** Длинный текст режется по абзацам, чтобы каждая часть влезла в лимит Telegram. */
export function splitLong(text: string, limit = MESSAGE_MAX_LENGTH): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let current = '';
  for (const paragraph of text.split(/\n\n+/)) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= limit) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    if (paragraph.length <= limit) {
      current = paragraph;
    } else {
      // Абзац длиннее лимита — режем по предложениям, в крайнем случае по символам.
      let rest = paragraph;
      while (rest.length > limit) {
        const cut = Math.max(
          rest.lastIndexOf('. ', limit),
          rest.lastIndexOf('\n', limit),
          limit - 1,
        );
        chunks.push(rest.slice(0, cut + 1).trim());
        rest = rest.slice(cut + 1).trim();
      }
      current = rest;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Жёсткие проверки кодом, последняя линия перед отправкой (раздел 3.7):
 * тело вехи только из библиотеки и на своём месте, сумм в тексте
 * нет, адреса только разрешённые, нет служебной разметки, письменность та,
 * сообщений не больше лимита, каждое влезает в Telegram.
 */
export function hardChecks(input: HardCheckInput): HardCheckResult {
  const removed: HardCheckResult['removed'] = [];
  const text = input.parts
    .map((part) => part.trim())
    .filter((part) => checkedText(part, input, removed));
  const block: FinalPart[] = input.block
    ? splitLong(input.block).map((chunk) => ({ text: chunk, block: true }))
    : [];
  // Лимит на сообщения относится к тексту ответчика; тело вехи не считается.
  // Лишние сообщения не выбрасываются, а дописываются в последнее: в конце
  // обычно шаг воронки с его вопросом, терять его нельзя.
  const limit = Math.max(1, input.maxParts);
  const merged =
    text.length > limit
      ? [...text.slice(0, limit - 1), text.slice(limit - 1).join('\n\n')]
      : text;
  const own: FinalPart[] = merged.flatMap((part) =>
    splitLong(part).map((chunk) => ({ text: chunk, block: false })),
  );
  const parts = input.afterBlock ? [...block, ...own] : [...own, ...block];
  return { parts, removed, blocked: parts.length === 0 };
}

/** Часть ответчика проходит проверки; не прошедшая записывается в `removed`. */
function checkedText(
  text: string,
  input: HardCheckInput,
  removed: HardCheckResult['removed'],
): boolean {
  if (!text) return false;
  if (MARKUP.some((token) => text.includes(token))) {
    removed.push({ part: text, reason: 'служебная разметка в тексте' });
    return false;
  }
  if (containsMoney(text)) {
    removed.push({ part: text, reason: 'сумма в тексте ответчика' });
    return false;
  }
  const badUrl = extractUrls(text).find((url) => !input.allowedUrls.has(url));
  if (badUrl) {
    removed.push({ part: text, reason: `адрес не из библиотеки: ${badUrl}` });
    return false;
  }
  if (wrongScript(text, input.language)) {
    removed.push({
      part: text,
      reason: `не та письменность (ожидался ${input.language})`,
    });
    return false;
  }
  return true;
}
