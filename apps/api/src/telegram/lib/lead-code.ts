/**
 * Вычленяет код из первого сообщения клиента: «Код: 5», «код 12», «Code #7»,
 * «код — 3». Регистр не важен, между словом и числом допустимы `:`, `#`, `№`,
 * дефис/тире и пробелы. Возвращает код без ведущих нулей или null.
 *
 * Правило продублировано во фронтенде (shared/lib/extractLeadCode.ts) —
 * менять синхронно.
 */
const LEAD_CODE_PATTERN =
  /(?:^|[^\p{L}])(?:код|code)\s*[:#№\-–—]?\s*(\d{1,6})(?!\d)/iu;

export function extractLeadCode(text: string): string | null {
  const match = LEAD_CODE_PATTERN.exec(text);
  if (!match) return null;
  return String(Number.parseInt(match[1], 10));
}
