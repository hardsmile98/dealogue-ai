import type { FinalPart } from './types.js';

/** Лимит Telegram на одно сообщение. */
export const MESSAGE_MAX_LENGTH = 4096;

export interface HardCheckInput {
  /** Сообщения ответчика до вехи (или все, если вехи нет). */
  parts: readonly string[];
  /** Продолжение после вехи. */
  after: readonly string[];
  /** Тело вехи, если она в плане: уходит побайтно, как в библиотеке. */
  block: string | null;
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
 * тело вехи только из библиотеки и на своём месте, сумм в тексте нет,
 * адреса только разрешённые, нет служебной разметки, письменность та,
 * частей не больше лимита, каждая влезает в сообщение.
 */
export function hardChecks(input: HardCheckInput): HardCheckResult {
  const removed: HardCheckResult['removed'] = [];
  const text = (parts: readonly string[]) =>
    parts.flatMap((part) => textParts(part.trim(), input, removed));

  const before = text(input.parts);
  const after = text(input.after);
  const block: FinalPart[] = input.block
    ? splitLong(input.block).map((chunk) => ({ text: chunk, block: true }))
    : [];

  // Лимит на части относится к тексту ответчика; тело вехи не считается.
  // Одно место держим под продолжение после вехи — это вопрос-отклик, он
  // важнее третьего сообщения вступления; остальное режется с конца.
  const reserved = block.length > 0 && after.length > 0 ? 1 : 0;
  const limit = (parts: FinalPart[], budget: number) =>
    parts.filter((part, index) => {
      if (index < budget) return true;
      removed.push({
        part: part.text,
        reason: `больше ${input.maxParts} частей`,
      });
      return false;
    });
  const keptBefore = limit(before, input.maxParts - reserved);
  const keptAfter = limit(after, input.maxParts - keptBefore.length);
  const parts = [...keptBefore, ...block, ...keptAfter];
  return { parts, removed, blocked: parts.length === 0 };
}

function textParts(
  text: string,
  input: HardCheckInput,
  removed: HardCheckResult['removed'],
): FinalPart[] {
  if (!text) return [];
  if (MARKUP.some((token) => text.includes(token))) {
    removed.push({ part: text, reason: 'служебная разметка в тексте' });
    return [];
  }
  if (containsMoney(text)) {
    removed.push({ part: text, reason: 'сумма в тексте ответчика' });
    return [];
  }
  const badUrl = extractUrls(text).find((url) => !input.allowedUrls.has(url));
  if (badUrl) {
    removed.push({ part: text, reason: `адрес не из библиотеки: ${badUrl}` });
    return [];
  }
  if (wrongScript(text, input.language)) {
    removed.push({
      part: text,
      reason: `не та письменность (ожидался ${input.language})`,
    });
    return [];
  }
  return splitLong(text).map((chunk) => ({ text: chunk, block: false }));
}
