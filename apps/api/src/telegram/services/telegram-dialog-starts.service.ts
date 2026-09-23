import { Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import type { Api } from 'teleproto';
import { runDetached } from '../../common/async.js';
import { execute } from '../../database/sql.js';
import type { TelegramChatEntity } from '../entities/telegram-chat.entity.js';
import { TelegramDialogStartEntity } from '../entities/telegram-dialog-start.entity.js';
import type { DayCodeRow } from '../lib/account-stats.js';
import { LEAD_CODE_PARSER_VERSION, parseLeadCode } from '../lib/lead-code.js';
import { messageSentAt } from '../lib/telegram-objects.js';

const RECLASSIFY_BATCH = 500;

/**
 * Начала диалогов: запись при синхронизации, переклассификация при смене
 * парсера и все агрегаты для статистики. Чаты и сообщения сюда не смотрят —
 * это единственный источник правды для вкладки «Статистика».
 */
@Injectable()
export class TelegramDialogStartsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TelegramDialogStartsService.name);

  constructor(
    @InjectRepository(TelegramDialogStartEntity)
    private readonly starts: Repository<TelegramDialogStartEntity>,
  ) {}

  /** Если парсер кодов обновился — пересчитать старые начала диалогов, не мешая старту. */
  onApplicationBootstrap(): void {
    runDetached(this.reclassifyOutdated(), this.logger, 'Переклассификация не удалась');
  }

  /**
   * Фиксирует начало диалога по первому сообщению собеседника.
   * Идемпотентно: повторный вызов для того же чата обновляет строку.
   * Возвращает распознанный код, чтобы чат мог хранить его для списка.
   */
  async record(chat: TelegramChatEntity, first: Api.Message): Promise<string | null> {
    const text = (first.message ?? '').trim();
    const match = parseLeadCode(text);
    await this.starts
      .createQueryBuilder()
      .insert()
      .into(TelegramDialogStartEntity)
      .values({
        accountId: chat.accountId,
        chatId: chat.id,
        telegramMessageId: first.id,
        startedAt: messageSentAt(first),
        text,
        leadCode: match?.code ?? null,
        leadMarker: match?.marker ?? null,
        parserVersion: LEAD_CODE_PARSER_VERSION,
      })
      .orUpdate(
        ['telegram_message_id', 'started_at', 'text', 'lead_code', 'lead_marker', 'parser_version', 'updated_at'],
        ['chat_id'],
      )
      .updateEntity(false)
      .execute();
    return match?.code ?? null;
  }

  /** Диалог начал сам аккаунт — начала со стороны собеседника у него нет. */
  async clear(chatId: string): Promise<void> {
    await this.starts.delete({ chatId });
  }

  /**
   * Пересчитывает коды строк, размеченных старым парсером. Пачка — одна
   * транзакция из двух UPDATE: начала диалогов и код в списке чатов не
   * расходятся, даже если процесс упадёт посреди пересчёта.
   */
  async reclassifyOutdated(): Promise<number> {
    let updated = 0;
    for (;;) {
      const batch = await this.starts.find({
        select: { id: true, chatId: true, text: true },
        where: { parserVersion: LessThan(LEAD_CODE_PARSER_VERSION) },
        take: RECLASSIFY_BATCH,
        order: { startedAt: 'ASC' },
      });
      if (batch.length === 0) break;

      const parsed = batch.map((row) => parseLeadCode(row.text));
      await this.starts.manager.transaction(async (manager) => {
        await execute(
          manager,
          `UPDATE telegram_dialog_starts s
           SET lead_code = p.lead_code, lead_marker = p.lead_marker, parser_version = $4::int, updated_at = now()
           FROM unnest($1::uuid[], $2::varchar[], $3::varchar[]) AS p(id, lead_code, lead_marker)
           WHERE s.id = p.id`,
          [
            batch.map((row) => row.id),
            parsed.map((match) => match?.code ?? null),
            parsed.map((match) => match?.marker ?? null),
            LEAD_CODE_PARSER_VERSION,
          ],
        );
        // Список чатов показывает код из своей колонки — держим в согласии.
        await execute(
          manager,
          `UPDATE telegram_chats c SET lead_code = s.lead_code, updated_at = now()
           FROM telegram_dialog_starts s
           WHERE s.chat_id = c.id AND s.id = ANY($1::uuid[])`,
          [batch.map((row) => row.id)],
        );
      });
      updated += batch.length;
    }
    if (updated > 0) {
      this.logger.log(`Переклассифицировано начал диалогов: ${updated} (парсер v${LEAD_CODE_PARSER_VERSION})`);
    }
    return updated;
  }

  /**
   * Начала диалогов по дням и кодам. «День» — в зоне `timezone`; границы
   * периода — локальные полуночи, переведённые в timestamptz, так что
   * индекс (account_id, started_at) работает как диапазон.
   */
  groupByDayAndCode(
    accountId: string,
    from: string,
    to: string,
    timezone: string,
  ): Promise<DayCodeRow[]> {
    return this.starts.query(
      `
        SELECT to_char(s.started_at AT TIME ZONE $4, 'YYYY-MM-DD') AS day,
               s.lead_code AS code,
               COUNT(*)::int AS count
        FROM telegram_dialog_starts s
        WHERE s.account_id = $1
          AND s.started_at >= ($2::timestamp AT TIME ZONE $4)
          AND s.started_at < (($3::timestamp + interval '1 day') AT TIME ZONE $4)
        GROUP BY day, code
      `,
      [accountId, from, to, timezone],
    );
  }

  /** Сколько диалогов начато сегодня (в зоне `timezone`) по каждому аккаунту. */
  async countToday(accountIds: string[], timezone: string): Promise<Map<string, number>> {
    if (accountIds.length === 0) return new Map();
    const rows: { account_id: string; count: number | string }[] = await this.starts.query(
      `
        SELECT s.account_id, COUNT(*)::int AS count
        FROM telegram_dialog_starts s
        WHERE s.account_id = ANY($1::uuid[])
          AND s.started_at >= ((now() AT TIME ZONE $2)::date::timestamp AT TIME ZONE $2)
        GROUP BY s.account_id
      `,
      [accountIds, timezone],
    );
    return new Map(rows.map((row) => [row.account_id, Number(row.count)]));
  }
}
