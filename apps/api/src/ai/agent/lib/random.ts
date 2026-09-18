/** Источник случайности, подменяемый в тестах: возвращает [0, 1). */
export type Rng = () => number;

export const defaultRng: Rng = () => Math.random();

export function uniform(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng();
}

export function uniformInt(rng: Rng, min: number, max: number): number {
  return Math.floor(uniform(rng, min, max + 1));
}

export function pick<T>(rng: Rng, items: T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

/**
 * Взвешенная перестановка: тот же выбор, что у `pickWeighted`, но сразу для
 * всего списка. Нужна, чтобы случайность хода была разыграна один раз: дальше
 * выбор варианта — детерминированный проход по готовому порядку.
 */
export function shuffleWeighted<T extends { weight: number }>(rng: Rng, items: T[]): T[] {
  const rest = [...items];
  const result: T[] = [];
  while (rest.length > 0) {
    const picked = pickWeighted(rng, rest) ?? rest[0];
    result.push(picked);
    rest.splice(rest.indexOf(picked), 1);
  }
  return result;
}

/** Взвешенный выбор: элементы с большим weight выпадают чаще. */
export function pickWeighted<T extends { weight: number }>(rng: Rng, items: T[]): T | undefined {
  if (items.length === 0) return undefined;
  const total = items.reduce((sum, item) => sum + Math.max(1, item.weight), 0);
  let cursor = rng() * total;
  for (const item of items) {
    cursor -= Math.max(1, item.weight);
    if (cursor <= 0) return item;
  }
  return items[items.length - 1];
}
