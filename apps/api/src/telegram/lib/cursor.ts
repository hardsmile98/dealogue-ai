/**
 * Курсоры постраничных списков. Для клиента курсор непрозрачен: base64url от
 * JSON с ключом сортировки последней строки страницы. Здесь — только обёртка;
 * поля проверяет модуль конкретного курсора, потому что они уходят в SQL.
 */

export function encodeCursor(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** Поля курсора из запроса; null — это не base64url от JSON-объекта. */
export function decodeCursor(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    );
    return typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}
