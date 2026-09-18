/**
 * Подбор текстов библиотеки под клиента: образцы, блоки, диагностики.
 *
 * Правило одно на всех — цепочка уступок, а не точное совпадение. Сначала
 * ищем самое конкретное (категория + пол на языке клиента), потом отпускаем
 * пол, потом категорию, потом язык. Точный фильтр возвращал пустой список,
 * и ход отменялся как `library_incomplete`, хотя тексты в библиотеке были.
 *
 * Случайность разыграна заранее: пул приходит уже перемешанным по весам, а
 * этот модуль только упорядочивает его по близости к клиенту. Поэтому выбор
 * повторяем: пока карточка не изменилась, ход получит тот же вариант.
 */

import type { BlockPool, LibraryBlock } from '../agent.types.js';

/** Кому адресован текст: `null` — подходит всем. */
export interface Targeted {
  categoryKey: string | null;
  gender: string | null;
  language: string;
}

/** Кому подбираем. Языки — по убыванию предпочтения. */
export interface Target {
  categoryKey: string | null;
  gender: string | null;
  languages: string[];
}

const MAX_SPECIFICITY = 3;

/**
 * Насколько вариант подходит клиенту: меньше — лучше, `null` — не подходит.
 * Язык весит больше конкретности: русский универсальный текст лучше
 * английского про ровно её категорию.
 */
function rankOf(item: Targeted, target: Target): number | null {
  const byLanguage = target.languages.indexOf(item.language);
  if (byLanguage < 0) return null;
  // Текст, помеченный категорией или полом, чужому клиенту не отдаём.
  if (item.categoryKey !== null && item.categoryKey !== target.categoryKey) return null;
  if (item.gender !== null && item.gender !== target.gender) return null;
  const specificity = (item.categoryKey ? 2 : 0) + (item.gender ? 1 : 0);
  return byLanguage * 10 + (MAX_SPECIFICITY - specificity);
}

/** Подходящие варианты, самые точные — первыми. Порядок внутри яруса — из пула. */
export function orderFor<T extends Targeted>(pool: T[], target: Target): T[] {
  const scored: { item: T; rank: number; index: number }[] = [];
  pool.forEach((item, index) => {
    const rank = rankOf(item, target);
    if (rank !== null) scored.push({ item, rank, index });
  });
  scored.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return scored.map((entry) => entry.item);
}

/** Самый подходящий вариант или `null`, если подходящих нет вовсе. */
export function chooseFor<T extends Targeted>(pool: T[], target: Target): T | null {
  return orderFor(pool, target)[0] ?? null;
}

/** Кому подбираем тексты: карточка клиента плюс отступление на язык аккаунта. */
export function targetOf(
  slots: { requestCategoryKey: string | null; gender: string | null; language: string },
  accountLanguage: string,
): Target {
  return {
    categoryKey: slots.requestCategoryKey,
    gender: slots.gender,
    languages: languageChain(slots.language || accountLanguage, accountLanguage),
  };
}

/** Конкретные блоки под клиента — по одному на вид. */
export function chooseBlocks(pools: BlockPool[], target: Target): LibraryBlock[] {
  const blocks: LibraryBlock[] = [];
  for (const pool of pools) {
    const picked = chooseFor(pool.items, target);
    if (picked) blocks.push({ kind: pool.kind, id: picked.id, title: picked.title || pool.kind, text: picked.text, source: pool.source });
  }
  return blocks;
}

/**
 * Языки по убыванию предпочтения: язык клиента, затем язык аккаунта.
 * Дальше цепочка не идёт: писать клиенту на языке, которого он не знает,
 * хуже, чем отдать чат менеджеру.
 */
export function languageChain(clientLanguage: string, accountLanguage: string): string[] {
  return clientLanguage === accountLanguage ? [clientLanguage] : [clientLanguage, accountLanguage];
}
