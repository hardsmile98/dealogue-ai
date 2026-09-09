import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { clipStart } from '../lib/text.js';

export interface RetrievedExchange {
  id: string;
  chatId: string;
  clientText: string;
  managerText: string;
  managerParts: number;
  delaySec: number;
  intent: string | null;
  similarity: number;
}

/**
 * Подбор похожих прошлых обменов «клиент → менеджер» без внешних сервисов:
 * триграммы (pg_trgm) + русский полнотекстовый поиск. Для коротких сообщений
 * клиентов этого достаточно, а работает локально и предсказуемо.
 */
@Injectable()
export class ExchangeRetrieverService {
  constructor(private readonly dataSource: DataSource) {}

  async similar(accountId: string, query: string, limit: number, excludeChatId?: string): Promise<RetrievedExchange[]> {
    const text = clipStart(query.trim(), 1000);
    if (!text || limit <= 0) return [];
    const rows = await this.dataSource.query<RawRow[]>(
      `
      SELECT e."id", e."chat_id", e."client_text", e."manager_text", e."manager_parts", e."delay_sec", e."intent",
             GREATEST(
               similarity(e."client_text", $2),
               COALESCE(ts_rank(to_tsvector('russian', e."client_text"), plainto_tsquery('russian', $2)), 0)
             ) AS sim
      FROM "ai_exchanges" e
      WHERE e."account_id" = $1
        AND e."quality" > 0
        AND ($4::uuid IS NULL OR e."chat_id" <> $4::uuid)
        AND (
          e."client_text" % $2
          OR to_tsvector('russian', e."client_text") @@ plainto_tsquery('russian', $2)
        )
      ORDER BY sim DESC, e."quality" DESC, e."manager_at" DESC
      LIMIT $3
      `,
      [accountId, text, limit, excludeChatId ?? null],
    );
    return rows.map(mapRow);
  }

  /** Показательные обмены по намерению (для дожимов и когда похожих нет). */
  async byIntent(accountId: string, intent: string, limit: number): Promise<RetrievedExchange[]> {
    if (limit <= 0) return [];
    const rows = await this.dataSource.query<RawRow[]>(
      `
      SELECT e."id", e."chat_id", e."client_text", e."manager_text", e."manager_parts", e."delay_sec", e."intent", 0 AS sim
      FROM "ai_exchanges" e
      WHERE e."account_id" = $1 AND e."intent" = $2 AND e."quality" > 0
      ORDER BY e."quality" DESC, e."manager_at" DESC
      LIMIT $3
      `,
      [accountId, intent, limit],
    );
    return rows.map(mapRow);
  }

  /** Свежие показательные обмены — когда ничего похожего не нашлось. */
  async exemplary(accountId: string, limit: number): Promise<RetrievedExchange[]> {
    if (limit <= 0) return [];
    const rows = await this.dataSource.query<RawRow[]>(
      `
      SELECT e."id", e."chat_id", e."client_text", e."manager_text", e."manager_parts", e."delay_sec", e."intent", 0 AS sim
      FROM "ai_exchanges" e
      WHERE e."account_id" = $1 AND e."quality" = 2
      ORDER BY e."manager_at" DESC
      LIMIT $2
      `,
      [accountId, limit],
    );
    return rows.map(mapRow);
  }
}

interface RawRow {
  id: string;
  chat_id: string;
  client_text: string;
  manager_text: string;
  manager_parts: number;
  delay_sec: number;
  intent: string | null;
  sim: number | string;
}

function mapRow(row: RawRow): RetrievedExchange {
  return {
    id: row.id,
    chatId: row.chat_id,
    clientText: row.client_text,
    managerText: row.manager_text,
    managerParts: Number(row.manager_parts),
    delaySec: Number(row.delay_sec),
    intent: row.intent,
    similarity: Number(row.sim),
  };
}
