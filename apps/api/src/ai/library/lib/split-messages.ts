/**
 * Разбиение длинного текста на сообщения Telegram (раздел 6.9 ТЗ).
 *
 * 1. Если в тексте есть строки `---` — режем по ним; каждая часть дополнительно
 *    проверяется на лимит.
 * 2. Иначе группируем абзацы (разделитель — пустая строка) в сообщения до
 *    `softLimit` символов, не разрывая абзац. Абзац длиннее `hardLimit`
 *    режется по предложениям.
 */

export interface SplitOptions {
  /** Целевая длина одного сообщения. */
  softLimit?: number;
  /** Абзац длиннее этого режется по предложениям. */
  hardLimit?: number;
}

export const TELEGRAM_MESSAGE_LIMIT = 4096;
const DEFAULT_SOFT = 1800;
const DEFAULT_HARD = 3500;

export const MESSAGE_SEPARATOR_RE = /^\s*-{3,}\s*$/m;

export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function splitIntoMessages(raw: string, options: SplitOptions = {}): string[] {
  const softLimit = Math.max(200, options.softLimit ?? DEFAULT_SOFT);
  const hardLimit = Math.min(TELEGRAM_MESSAGE_LIMIT, Math.max(softLimit, options.hardLimit ?? DEFAULT_HARD));
  const text = normalizeText(raw);
  if (!text) return [];

  const explicit = MESSAGE_SEPARATOR_RE.test(text)
    ? text.split(/^\s*-{3,}\s*$/m).map(normalizeText).filter(Boolean)
    : [text];

  const result: string[] = [];
  for (const part of explicit) {
    // Явно разделённая часть уходит целиком, если влезает в Telegram; иначе — по абзацам.
    if (part.length <= (explicit.length > 1 ? hardLimit : softLimit)) {
      result.push(part);
      continue;
    }
    result.push(...packParagraphs(part, softLimit, hardLimit));
  }
  return result;
}

/** Абзацы → сообщения до softLimit; слишком длинный абзац — по предложениям. */
function packParagraphs(text: string, softLimit: number, hardLimit: number): string[] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    if (current) chunks.push(current);
    current = '';
  };

  for (const paragraph of paragraphs) {
    const pieces = paragraph.length > hardLimit ? splitBySentences(paragraph, softLimit) : [paragraph];
    for (const piece of pieces) {
      if (!current) {
        current = piece;
      } else if (current.length + 2 + piece.length <= softLimit) {
        current = `${current}\n\n${piece}`;
      } else {
        flush();
        current = piece;
      }
    }
  }
  flush();
  return chunks;
}

function splitBySentences(paragraph: string, softLimit: number): string[] {
  const sentences = paragraph.split(/(?<=[.!?…])\s+/);
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (!current) {
      current = sentence;
    } else if (current.length + 1 + sentence.length <= softLimit) {
      current = `${current} ${sentence}`;
    } else {
      chunks.push(current);
      current = sentence;
    }
  }
  if (current) chunks.push(current);
  // Предложение само по себе длиннее лимита Telegram — режем жёстко.
  return chunks.flatMap((chunk) => hardCut(chunk, TELEGRAM_MESSAGE_LIMIT));
}

function hardCut(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];
  const out: string[] = [];
  for (let i = 0; i < text.length; i += limit) out.push(text.slice(i, i + limit));
  return out;
}
