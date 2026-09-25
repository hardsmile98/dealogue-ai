/**
 * JSON-объект из ответа модели. Все три промпта работают в режиме
 * `response_format: json_object`, так что ограждения ```json — единственная
 * допустимая вольность; всё остальное — не объект.
 */
export function parseJsonObject(raw: string): Record<string, unknown> | null {
  let text = raw.trim();
  if (text.startsWith('```')) {
    text = text.slice(text.indexOf('\n') + 1);
    if (text.trimEnd().endsWith('```')) text = text.trimEnd().slice(0, -3);
  }
  try {
    const value: unknown = JSON.parse(text.trim());
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Непустые строки из массива; всё остальное отбрасывается. */
export function stringList(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim())
    : [];
}
