/**
 * Разбор JSON из ответа модели: снимаем code fences, обрезаем всё до
 * первой «{» и после последней «}». Возвращает null, если не JSON.
 */
export function extractJson(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const candidates = [trimmed, stripFences(trimmed), sliceBraces(trimmed)];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // пробуем следующий вариант
    }
  }
  return null;
}

function stripFences(text: string): string {
  const match = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  return match ? match[1].trim() : text;
}

function sliceBraces(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}
