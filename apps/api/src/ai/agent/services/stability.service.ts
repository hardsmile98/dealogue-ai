import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AiConfig } from '../../ai.config.js';
import { AiSettingsService } from '../../settings/ai-settings.service.js';
import { AlertsService } from '../../alerts/alerts.service.js';
import { detectAnomalies } from '../stability/anomaly.js';
import type { Anomaly, AnomalyCode } from '../stability/anomaly.js';

/** Как часто смотрим на статистику часа. */
const SWEEP_MS = 60 * 60_000;
/** Первый проход — вскоре после старта, чтобы не ждать час после перезапуска. */
const FIRST_SWEEP_MS = 2 * 60_000;
/** Повторный алерт с тем же кодом по аккаунту — не чаще этого. */
const REPEAT_MS = 6 * 60 * 60_000;
const RECENT_OUTCOMES = 8;

interface AccountStats {
  accountId: string;
  turns: number;
  handoffs: number;
  regenerations: number;
}

/**
 * Стабильность (раздел 15 ТЗ): раз в час смотрим на работу каждого активного
 * аккаунта и заводим алерт `anomaly`, если бот слишком часто передаёт чаты,
 * переписывает ответы, падает на провайдере или заваливает чат сообщениями.
 * Бот при этом не останавливается — решает менеджер.
 */
@Injectable()
export class StabilityService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StabilityService.name);
  private timer: NodeJS.Timeout | null = null;
  private firstTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly settings: AiSettingsService,
    private readonly alerts: AlertsService,
    private readonly config: AiConfig,
  ) {}

  onModuleInit(): void {
    if (!this.config.enabled) return;
    this.firstTimer = setTimeout(() => void this.sweep(), FIRST_SWEEP_MS);
    this.timer = setInterval(() => void this.sweep(), SWEEP_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.firstTimer) clearTimeout(this.firstTimer);
  }

  /** Один проход по аккаунтам с активностью за последний час или сутки. */
  async sweep(): Promise<Anomaly[]> {
    const all: Anomaly[] = [];
    try {
      const stats = await this.accountStats();
      const chatsByAccount = await this.chatsOverLimit();
      const accountIds = new Set<string>([...stats.map((s) => s.accountId), ...chatsByAccount.keys()]);
      for (const accountId of accountIds) {
        const found = await this.checkAccount(
          accountId,
          stats.find((s) => s.accountId === accountId),
          chatsByAccount.get(accountId) ?? [],
        );
        all.push(...found);
      }
    } catch (error) {
      this.logger.error(`Проверка аномалий не удалась: ${error instanceof Error ? error.message : String(error)}`);
    }
    return all;
  }

  // --- внутреннее -----------------------------------------------------------

  private async checkAccount(
    accountId: string,
    stats: AccountStats | undefined,
    chats: { chatId: string; count: number }[],
  ): Promise<Anomaly[]> {
    const settings = await this.settings.get(accountId);
    if (!settings.enabled) return [];
    const outcomes = await this.recentOutcomes(accountId);
    const overLimit = chats.filter((c) => c.count > settings.limits.botMessagesPerChatPerDay);
    const found = detectAnomalies({
      turnsLastHour: stats?.turns ?? 0,
      handoffsLastHour: stats?.handoffs ?? 0,
      regenerationsLastHour: stats?.regenerations ?? 0,
      recentOutcomes: outcomes,
      chatsOverDailyLimit: overLimit,
      dailyLimit: settings.limits.botMessagesPerChatPerDay,
    });
    for (const anomaly of found) {
      if (!anomaly.chatId && (await this.reportedRecently(accountId, anomaly.code))) continue;
      const { created } = await this.alerts.create({
        accountId,
        chatId: anomaly.chatId ?? null,
        type: 'anomaly',
        payload: { code: anomaly.code, detail: anomaly.detail },
      });
      if (created) this.logger.warn(`Аккаунт ${accountId}: аномалия ${anomaly.code} — ${anomaly.detail}`);
    }
    return found;
  }

  /** Алерт того же кода по аккаунту уже висит — второй не заводим. */
  private async reportedRecently(accountId: string, code: AnomalyCode): Promise<boolean> {
    const rows = await this.dataSource.query<{ id: string }[]>(
      `
      SELECT "id" FROM "alerts"
      WHERE "account_id" = $1 AND "type" = 'anomaly' AND "payload"->>'code' = $2
        AND ("status" <> 'resolved' OR "created_at" > now() - interval '${REPEAT_MS} milliseconds')
      LIMIT 1
      `,
      [accountId, code],
    );
    return rows.length > 0;
  }

  private async accountStats(): Promise<AccountStats[]> {
    const rows = await this.dataSource.query<{ account_id: string; turns: string; handoffs: string; regenerations: string }[]>(
      `
      SELECT "account_id",
             count(*)::text AS "turns",
             count(*) FILTER (WHERE "outcome" = 'handoff')::text AS "handoffs",
             count(*) FILTER (WHERE jsonb_array_length("guard_notes") > 1)::text AS "regenerations"
        FROM "ai_turns"
       WHERE "created_at" > now() - interval '1 hour'
       GROUP BY "account_id"
      `,
    );
    return rows.map((row) => ({
      accountId: row.account_id,
      turns: Number(row.turns),
      handoffs: Number(row.handoffs),
      regenerations: Number(row.regenerations),
    }));
  }

  /** Сколько сообщений бот отправил в каждый чат за сутки. */
  private async chatsOverLimit(): Promise<Map<string, { chatId: string; count: number }[]>> {
    const rows = await this.dataSource.query<{ account_id: string; chat_id: string; count: string }[]>(
      `
      SELECT c."account_id", m."chat_id", count(*)::text AS "count"
        FROM "telegram_messages" m
        JOIN "telegram_chats" c ON c."id" = m."chat_id"
       WHERE m."direction" = 'out' AND m."ai_turn_id" IS NOT NULL
         AND m."sent_at" > now() - interval '24 hours'
       GROUP BY c."account_id", m."chat_id"
      `,
    );
    const map = new Map<string, { chatId: string; count: number }[]>();
    for (const row of rows) {
      const list = map.get(row.account_id) ?? [];
      list.push({ chatId: row.chat_id, count: Number(row.count) });
      map.set(row.account_id, list);
    }
    return map;
  }

  private async recentOutcomes(accountId: string): Promise<string[]> {
    const rows = await this.dataSource.query<{ outcome: string }[]>(
      `SELECT "outcome" FROM "ai_turns" WHERE "account_id" = $1 ORDER BY "created_at" DESC LIMIT ${RECENT_OUTCOMES}`,
      [accountId],
    );
    return rows.map((row) => row.outcome);
  }
}
