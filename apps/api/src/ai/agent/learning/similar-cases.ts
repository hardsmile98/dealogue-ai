/**
 * Похожие прошлые случаи (раздел 9.3 ТЗ): что клиент писал раньше и что
 * ему на это ответили — решённые черновики менеджера и ходы с оценкой
 * «хорошо». База отдаёт кандидатов с сырой похожестью (FTS + триграммы),
 * здесь — ранжирование и текст для промпта.
 *
 * Ходы с оценкой «плохо» отбираются тем же запросом и идут в промпт
 * отдельным блоком «так отвечать не надо»: показать промах на похожем
 * случае работает лучше, чем ещё один удачный пример.
 */

import type { FunnelStage } from '../../domain/types.js';

export type SimilarCaseSource = 'draft' | 'turn';

/** Чем кончился случай: так отвечать стоит или так отвечать не надо. */
export type SimilarCaseOutcome = 'good' | 'bad';

export interface SimilarCaseRow {
  id: string;
  source: SimilarCaseSource;
  clientText: string;
  answerText: string;
  stage: FunnelStage | null;
  categoryKey: string | null;
  createdAt: Date;
  /** Похожесть текста клиента, 0–1 (максимум из FTS-ранга и триграмм). */
  score: number;
  /** Оценка менеджера: «хорошо» — образец, «плохо» — предостережение. */
  outcome: SimilarCaseOutcome;
  /** Чем менеджер объяснил оценку, если объяснил. */
  note: string | null;
}

export interface SimilarCase extends SimilarCaseRow {
  /** Итоговый вес с бонусами за этап и категорию. */
  rank: number;
}

export interface RankParams {
  stage: FunnelStage | null;
  categoryKey: string | null;
  limit?: number;
  now?: Date;
}

/** Ниже этого случай уже не похож, а просто содержит те же слова. */
export const MIN_SCORE = 0.12;
export const CASES_LIMIT = 5;
/** Отрицательных примеров нужно мало: это предостережение, а не образец. */
export const BAD_CASES_LIMIT = 2;
const STAGE_BONUS = 0.15;
const CATEGORY_BONUS = 0.15;
/** Свежесть решает только при равном ранге — в пределах этого зазора. */
const TIE_EPS = 0.001;
const CLIENT_PREVIEW = 400;
const ANSWER_PREVIEW = 600;

/**
 * Отбор и ранжирование: похожесть плюс бонусы за совпадение этапа и
 * категории, при равенстве — свежие. Дубли (один и тот же ответ на
 * похожий текст) не копим: одинаковый текст клиента берём один раз.
 */
export function rankCases(rows: SimilarCaseRow[], params: RankParams): SimilarCase[] {
  const seen = new Set<string>();
  const ranked: SimilarCase[] = [];
  for (const row of rows) {
    if (row.score < MIN_SCORE) continue;
    if (!row.clientText.trim() || !row.answerText.trim()) continue;
    const key = normalizeKey(row.clientText);
    if (seen.has(key)) continue;
    seen.add(key);
    let rank = row.score;
    if (params.stage && row.stage === params.stage) rank += STAGE_BONUS;
    if (params.categoryKey && row.categoryKey === params.categoryKey) rank += CATEGORY_BONUS;
    ranked.push({ ...row, rank });
  }
  ranked.sort((a, b) => {
    const diff = b.rank - a.rank;
    if (Math.abs(diff) > TIE_EPS) return diff;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
  return ranked.slice(0, params.limit ?? CASES_LIMIT);
}

/** Текст для поиска: вся пачка клиента одной строкой, без лишних пробелов. */
export function caseQuery(texts: string[]): string {
  return texts.join(' ').replace(/\s+/g, ' ').trim().slice(0, CLIENT_PREVIEW);
}

export function goodOf(cases: SimilarCase[]): SimilarCase[] {
  return cases.filter((item) => item.outcome === 'good');
}

export function badOf(cases: SimilarCase[]): SimilarCase[] {
  return cases.filter((item) => item.outcome === 'bad');
}

/** Строки для промпта: «клиент → как ответили». */
export function formatSimilarCases(cases: SimilarCase[]): string[] {
  return goodOf(cases).map((item) => {
    const who = item.source === 'draft' ? 'ответил менеджер' : 'удачный ответ';
    return `Клиент: «${cut(item.clientText, CLIENT_PREVIEW)}» → ${who}: «${cut(item.answerText, ANSWER_PREVIEW)}»`;
  });
}

/** То же для забракованных ходов: с пометкой менеджера, если он её оставил. */
export function formatBadCases(cases: SimilarCase[]): string[] {
  return badOf(cases).map((item) => {
    const why = item.note ? ` Менеджер отметил: «${cut(item.note, 200)}».` : '';
    return `Клиент: «${cut(item.clientText, CLIENT_PREVIEW)}» → так ответили, и это не сработало: «${cut(item.answerText, ANSWER_PREVIEW)}».${why}`;
  });
}

function cut(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function normalizeKey(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
