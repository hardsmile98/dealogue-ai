import type { Gender, Language } from './kinds.js';
import { UNIVERSAL_CATEGORY } from './kinds.js';

/** Минимум, что нужно знать об элементе библиотеки, чтобы выбрать диагностику. */
export interface DiagnosticCandidate {
  id: string;
  category: string | null;
  /** null — подходит любому полу. */
  gender: Gender | null;
  language: string;
  enabled: boolean;
  sort: number;
}

export interface DiagnosticQuery {
  /** Категория запроса или null, если анализ не уверен. */
  category: string | null;
  /** Пол клиента или null при сомнении. */
  gender: Gender | null;
  language: Language | string;
}

/**
 * Выбор диагностики: категория × пол × язык; нет — универсальная для пола и
 * языка; нет и её — null (передача менеджеру). Среди подходящих вариантов
 * берётся случайный, чтобы у клиентов одной категории тексты чередовались.
 * `pick` вынесен наружу ради детерминированных тестов.
 */
export function selectDiagnostic<T extends DiagnosticCandidate>(
  items: readonly T[],
  query: DiagnosticQuery,
  pick: (candidates: readonly T[]) => T = randomOf,
): T | null {
  const enabled = items.filter((item) => item.enabled && item.language === query.language);
  const attempts: Array<{ category: string; gender: Gender | null }> = [];
  if (query.category && query.category !== UNIVERSAL_CATEGORY) {
    attempts.push({ category: query.category, gender: query.gender });
    if (query.gender) attempts.push({ category: query.category, gender: null });
  }
  attempts.push({ category: UNIVERSAL_CATEGORY, gender: query.gender });
  if (query.gender) attempts.push({ category: UNIVERSAL_CATEGORY, gender: null });

  for (const attempt of attempts) {
    const candidates = enabled.filter(
      (item) =>
        item.category === attempt.category &&
        (attempt.gender === null ? item.gender === null : item.gender === attempt.gender || item.gender === null),
    );
    // Точное совпадение по полу важнее «подходит любому».
    const exact = attempt.gender === null ? candidates : candidates.filter((item) => item.gender === attempt.gender);
    const pool = exact.length > 0 ? exact : candidates;
    if (pool.length > 0) return pick(pool);
  }
  return null;
}

function randomOf<T>(candidates: readonly T[]): T {
  return candidates[Math.floor(Math.random() * candidates.length)] as T;
}
