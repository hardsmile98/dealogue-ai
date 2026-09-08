/**
 * Распознавание кода в первом сообщении диалога.
 *
 * Шаблоны, которые встречаются в рекламе: «#1», «# 1», «№1», «Код 6»,
 * «код - 6», «код: 6», «код #6», «code 6», «промокод 6». Всё остальное —
 * «без кода». Перед разбором текст нормализуется: убираются невидимые
 * символы (word joiner, zero-width joiner, мягкий перенос — их вставляют
 * в шаблоны, чтобы обойти спам-фильтры), схлопываются пробелы, буквы
 * приводятся к NFKC (полноширинные цифры → обычные).
 *
 * При изменении шаблонов повышайте LEAD_CODE_PARSER_VERSION: строки
 * telegram_dialog_starts со старой версией будут пересчитаны при старте
 * (см. TelegramDialogStartsService.reclassifyOutdated) или командой
 * `npm run telegram:reclassify`.
 *
 * Правило продублировано в описании на фронтенде — обновлять текст там же.
 */

export const LEAD_CODE_PARSER_VERSION = 1;

export type LeadCodeMarker = 'word' | 'hash';

export interface LeadCodeMatch {
  /** Код без ведущих нулей: «#007» → "7". */
  code: string;
  /** Чем помечен код: словом («код 6») или знаком («#6»). */
  marker: LeadCodeMarker;
}

/** Cf — управляющие форматирующие символы (ZWJ, word joiner и т. п.), U+00AD — мягкий перенос. */
const FORMAT_CHARS = /[\p{Cf}­]/gu;

const PATTERNS: { marker: LeadCodeMarker; regex: RegExp }[] = [
  {
    marker: 'word',
    // «код 6», «код - 6», «код: 6», «код №6», «код #6», «код6», «code 6», «промокод 6»
    regex: /(?:^|[^\p{L}\p{N}])(?:промокод|код|code)\s*[:=\-–—]?\s*[#№]?\s*(\d{1,6})(?![\p{L}\p{N}])/iu,
  },
  {
    marker: 'hash',
    // «#1», «# 1», «№1» — знак не должен быть частью хэштега или другого числа
    regex: /(?:^|[^\p{L}\p{N}#№])[#№]\s*(\d{1,6})(?![\p{L}\p{N}])/u,
  },
];

export function normalizeMessageText(text: string): string {
  return (
    text
      // «№» под NFKC разворачивается в «No» — приводим к «#» заранее.
      .replace(/№/g, '#')
      .normalize('NFKC')
      .replace(FORMAT_CHARS, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** Если в тексте несколько кодов, берём тот, что встретился раньше. */
export function parseLeadCode(text: string): LeadCodeMatch | null {
  const normalized = normalizeMessageText(text);
  if (!normalized) return null;

  let best: (LeadCodeMatch & { index: number }) | null = null;
  for (const { marker, regex } of PATTERNS) {
    const match = regex.exec(normalized);
    if (!match) continue;
    const index = match.index + match[0].indexOf(match[1]);
    if (!best || index < best.index) {
      best = { code: String(Number.parseInt(match[1], 10)), marker, index };
    }
  }
  return best ? { code: best.code, marker: best.marker } : null;
}

export function extractLeadCode(text: string): string | null {
  return parseLeadCode(text)?.code ?? null;
}
