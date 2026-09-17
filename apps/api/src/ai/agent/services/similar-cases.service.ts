import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { FunnelStage } from '../../domain/types.js';
import { CASES_LIMIT, caseQuery, rankCases } from '../learning/similar-cases.js';
import type { SimilarCase, SimilarCaseRow } from '../learning/similar-cases.js';

export interface FindSimilarParams {
  accountId: string;
  /** Текущий чат — свои же реплики не подмешиваем, они и так в истории. */
  chatId: string;
  texts: string[];
  stage: FunnelStage | null;
  categoryKey: string | null;
  limit?: number;
}

/** Сколько кандидатов тянем из базы до ранжирования в коде. */
const CANDIDATES = 20;
/** Порог отбора кандидата: триграммы по лучшему совпадающему куску. */
const WORD_THRESHOLD = 0.3;

/**
 * Поиск похожих прошлых случаев (раздел 9.3 ТЗ): решённые черновики
 * менеджера и ходы с оценкой «хорошо». Кандидатов отбирает Postgres
 * (FTS `russian` + `pg_trgm`), ранжирует чистый модуль.
 */
@Injectable()
export class SimilarCasesService {
  private readonly logger = new Logger(SimilarCasesService.name);

  constructor(private readonly dataSource: DataSource) {}

  async find(params: FindSimilarParams): Promise<SimilarCase[]> {
    const query = caseQuery(params.texts);
    if (query.length < 8) return [];
    try {
      const rows = await this.dataSource.query<RawRow[]>(SQL, [params.accountId, query, params.chatId, CANDIDATES, WORD_THRESHOLD]);
      return rankCases(rows.map(toRow), {
        stage: params.stage,
        categoryKey: params.categoryKey,
        limit: params.limit ?? CASES_LIMIT,
      });
    } catch (error) {
      // Похожие случаи — подсказка, а не условие хода: молча идём без них.
      this.logger.warn(`Поиск похожих случаев не удался: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /** Тексты случаев по id — для карточки черновика и журнала ходов. */
  async byIds(ids: string[]): Promise<SimilarCase[]> {
    if (ids.length === 0) return [];
    try {
      const rows = await this.dataSource.query<RawRow[]>(BY_IDS_SQL, [ids]);
      return rows.map((row) => ({ ...toRow(row), rank: 1 }));
    } catch (error) {
      this.logger.warn(`Чтение похожих случаев не удалось: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }
}

interface RawRow {
  id: string;
  source: 'draft' | 'turn';
  client_text: string;
  answer_text: string | null;
  stage: FunnelStage | null;
  category_key: string | null;
  created_at: string | Date;
  score: string | number | null;
}

function toRow(row: RawRow): SimilarCaseRow {
  return {
    id: row.id,
    source: row.source,
    clientText: row.client_text ?? '',
    answerText: row.answer_text ?? '',
    stage: row.stage,
    categoryKey: row.category_key,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    score: Number(row.score ?? 0),
  };
}

/** Текст ответа хода: что ушло, а в сухом прогоне — что планировалось. */
const TURN_ANSWER = `
  (SELECT string_agg(m->>'text', E'\\n')
     FROM jsonb_array_elements(
       CASE WHEN jsonb_array_length(t."messages_sent") > 0 THEN t."messages_sent" ELSE t."messages_planned" END
     ) m)
`;

const SCORE = (column: string): string =>
  `GREATEST(similarity(${column}, $2), word_similarity($2, ${column}))`;

/**
 * Кандидат: либо кусок текста похож по триграммам, либо совпали слова.
 * `word_similarity` индекс не использует (порог свой, а не из `pg_trgm`),
 * но выборка — один аккаунт, это десятки тысяч строк в худшем случае.
 */
const MATCHES = (column: string): string =>
  `(word_similarity($2, ${column}) > $5 OR to_tsvector('russian', ${column}) @@ plainto_tsquery('russian', $2))`;

const SQL = `
WITH drafts AS (
  SELECT d."id",
         'draft'::text AS "source",
         d."client_text",
         d."final_text" AS "answer_text",
         COALESCE(t."stage_before", cs."stage") AS "stage",
         cs."request_category_key" AS "category_key",
         d."created_at",
         ${SCORE('d."client_text"')} AS "score"
    FROM "ai_drafts" d
    LEFT JOIN "ai_turns" t ON t."id" = d."turn_id"
    LEFT JOIN "ai_chat_state" cs ON cs."chat_id" = d."chat_id"
   WHERE d."account_id" = $1
     AND d."chat_id" <> $3
     AND d."final_text" IS NOT NULL
     AND d."final_text" <> ''
     AND d."client_text" <> ''
     AND ${MATCHES('d."client_text"')}
   ORDER BY "score" DESC
   LIMIT $4
),
turns AS (
  SELECT t."id",
         'turn'::text AS "source",
         t."client_text",
         ${TURN_ANSWER} AS "answer_text",
         t."stage_before" AS "stage",
         cs."request_category_key" AS "category_key",
         t."created_at",
         ${SCORE('t."client_text"')} AS "score"
    FROM "ai_turns" t
    LEFT JOIN "ai_chat_state" cs ON cs."chat_id" = t."chat_id"
   WHERE t."account_id" = $1
     AND t."chat_id" <> $3
     AND t."rating" = 'good'
     AND t."client_text" <> ''
     AND ${MATCHES('t."client_text"')}
   ORDER BY "score" DESC
   LIMIT $4
)
SELECT * FROM drafts
UNION ALL
SELECT * FROM turns
`;

const BY_IDS_SQL = `
SELECT d."id", 'draft'::text AS "source", d."client_text", d."final_text" AS "answer_text",
       NULL::varchar AS "stage", NULL::varchar AS "category_key", d."created_at", 1 AS "score"
  FROM "ai_drafts" d WHERE d."id" = ANY($1::uuid[])
UNION ALL
SELECT t."id", 'turn'::text AS "source", t."client_text", ${TURN_ANSWER} AS "answer_text",
       t."stage_before" AS "stage", NULL::varchar AS "category_key", t."created_at", 1 AS "score"
  FROM "ai_turns" t WHERE t."id" = ANY($1::uuid[])
`;
