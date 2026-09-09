/**
 * Строковые утилиты, безопасные для эмодзи. Обрезка по индексу может
 * разрезать суррогатную пару UTF-16 пополам: JSON.stringify такой строки
 * даёт «\ud83d» без второй половины, и провайдер (DeepSeek/serde) отвечает
 * 400 «unexpected end of hex escape».
 */

const LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Убирает одинокие суррогаты (обрубки эмодзи). */
export function wellFormed(text: string): string {
  return text.replace(LONE_SURROGATE_RE, '');
}

/** Первые `max` символов без разрезания эмодзи. */
export function clipStart(text: string, max: number): string {
  if (text.length <= max) return wellFormed(text);
  return wellFormed(text.slice(0, max));
}

/** Последние `max` символов без разрезания эмодзи. */
export function clipEnd(text: string, max: number): string {
  if (text.length <= max) return wellFormed(text);
  return wellFormed(text.slice(-max));
}
