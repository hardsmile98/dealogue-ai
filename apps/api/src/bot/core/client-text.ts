/*
 * Текст клиента, каким его видят промпты. Реклама добавляет в первое
 * сообщение служебную метку источника («код 12», «#12») и невидимые символы
 * — клиенту они ничего не значат, и отвечать на них нельзя. Убираются
 * синтаксически, как адреса: по форме «слово-метка + число», смысл текста
 * код не разбирает. В базе и журнале остаётся исходный текст.
 */

/** «код 12», «код: 12», «код12», «код №12», «code 12» — не часть слова («штрихкод 12» не метка). */
const AD_CODE_RE =
  /(?<![\p{L}\d])(?:код|kod|code)\s*[:№#.-]?\s*\d{1,6}(?!\d)/giu;
/** «#12» — не часть слова и не HTML-сущность. */
const HASH_CODE_RE = /(?<![\p{L}\d&#])#\s?\d{1,6}(?!\d)/gu;
/** Невидимые символы: нулевой ширины, соединители, BOM. */
const INVISIBLE_RE = /[\u200B-\u200D\u2060\uFEFF]/gu;

/** Что видят промпты вместо сообщения, в котором кроме рекламной метки ничего не было. */
export const AD_CODE_ONLY = '[пришёл по рекламе, без текста]';

/** Текст клиента для промптов: без рекламной метки; сообщение из одной метки — пометкой. */
export function clientTextForPrompt(text: string): string {
  const cleaned = cleanClientText(text);
  return cleaned || !text.trim() ? cleaned : AD_CODE_ONLY;
}

/** Текст сообщения клиента без рекламной метки и невидимых символов; может стать пустым. */
export function cleanClientText(text: string): string {
  const stripped = text
    .replace(INVISIBLE_RE, '')
    .replace(AD_CODE_RE, ' ')
    .replace(HASH_CODE_RE, ' ');
  if (stripped === text) return text;
  return stripped
    .replace(/[ \t]+/g, ' ')
    .replace(/ +([,.;:!?)])/g, '$1')
    .replace(/([,;:])(?:\s*[,;:])+/g, '$1')
    .replace(/^[\s,;:.–-]+|[\s,;:–-]+$/gu, '')
    .replace(/\n{3,}/g, '\n\n');
}
