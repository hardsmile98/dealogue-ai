/**
 * Похожие прошлые случаи (раздел 9.3 ТЗ): что клиент писал раньше и что
 * ему на это ответили — решённые черновики менеджера и ходы с оценкой
 * «хорошо». База отдаёт кандидатов с сырой похожестью (FTS + триграммы),
 * здесь — ранжирование и текст для промпта.
 */

import type { FunnelStage } from '../../domain/types.js';

export type SimilarCaseSource = 'draft' | 'turn';

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

/** Строки для промпта: «клиент → как ответили». */
export function formatSimilarCases(cases: SimilarCase[]): string[] {
  return cases.map((item) => {
    const who = item.source === 'draft' ? 'ответил менеджер' : 'удачный ответ';
    return `Клиент: «${cut(item.clientText, CLIENT_PREVIEW)}» → ${who}: «${cut(item.answerText, ANSWER_PREVIEW)}»`;
  });
}

function cut(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function normalizeKey(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
