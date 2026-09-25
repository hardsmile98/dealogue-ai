/**
 * Фоны аватаров-инициалов. Тёмные насыщенные тона, чтобы белые буквы
 * читались (контраст не ниже 4.5:1). Цвет выбирается по имени — см.
 * `avatarColor`, — поэтому у одного человека он не меняется между экранами.
 */
const AVATAR_COLORS = [
  '#4f46e5',
  '#0e7490',
  '#b45309',
  '#be185d',
  '#047857',
  '#6d28d9',
] as const;

/** Детерминированный цвет по строке: одинаковое имя — одинаковый цвет. */
export function avatarColor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  // Остаток от деления всегда попадает в границы непустого массива.
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}
