/**
 * Похожесть текстов по триграммам (коэффициент Дайса, 0–1). Используется
 * guard'ом, чтобы бот не повторял уже сказанное; порог — в настройках.
 */

export function normalizeForSimilarity(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function trigrams(text: string): Set<string> {
  const normalized = ` ${normalizeForSimilarity(text)} `;
  const result = new Set<string>();
  if (normalized.length < 3) return result;
  for (let i = 0; i <= normalized.length - 3; i += 1) result.add(normalized.slice(i, i + 3));
  return result;
}

export function similarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const gram of ta) if (tb.has(gram)) shared += 1;
  return (2 * shared) / (ta.size + tb.size);
}

/** Максимальная похожесть текста на любой из прошлых. */
export function maxSimilarity(text: string, past: string[]): { score: number; index: number } {
  let best = { score: 0, index: -1 };
  past.forEach((item, index) => {
    const score = similarity(text, item);
    if (score > best.score) best = { score, index };
  });
  return best;
}
