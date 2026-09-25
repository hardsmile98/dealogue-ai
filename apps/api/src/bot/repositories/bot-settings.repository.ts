import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { execute, hydrate } from '../../database/sql.js';
import { BotAccountSettingsEntity } from '../entities/bot-account-settings.entity.js';

/** Что меняет PUT настроек: jsonb образа и таймингов целиком, модель. */
export interface SettingsPatch {
  persona?: Record<string, unknown>;
  timings?: Record<string, unknown>;
  model?: string;
}

/**
 * Таблица bot_account_settings: одна строка на аккаунт. Строка заводится
 * при первом обращении, поэтому у любого аккаунта настройки «есть» — со
 * значениями по умолчанию. Правки — точечными UPDATE … RETURNING.
 */
@Injectable()
export class BotSettingsRepository {
  constructor(
    @InjectRepository(BotAccountSettingsEntity)
    private readonly settings: Repository<BotAccountSettingsEntity>,
  ) {}

  /** Строка настроек или null, если её ещё не заводили (значит, всё по умолчанию). */
  find(accountId: string): Promise<BotAccountSettingsEntity | null> {
    return this.settings.findOne({ where: { accountId } });
  }

  /**
   * Строка настроек; при первом обращении создаётся. Обычно это один
   * SELECT; гонка двух первых обращений безопасна (ON CONFLICT DO NOTHING).
   */
  async ensure(accountId: string): Promise<BotAccountSettingsEntity> {
    const existing = await this.find(accountId);
    if (existing) return existing;
    await execute(
      this.settings.manager,
      `INSERT INTO bot_account_settings (account_id) VALUES ($1::uuid) ON CONFLICT (account_id) DO NOTHING`,
      [accountId],
    );
    const row = await this.find(accountId);
    if (!row) {
      throw new Error(
        `Настройки агента для аккаунта ${accountId} не создались`,
      );
    }
    return row;
  }

  /** Меняет только переданные поля; null — строки нет. */
  async update(
    accountId: string,
    patch: SettingsPatch,
  ): Promise<BotAccountSettingsEntity | null> {
    const { rows } = await execute(
      this.settings.manager,
      `UPDATE bot_account_settings
       SET persona = COALESCE($2::jsonb, persona),
           timings = COALESCE($3::jsonb, timings),
           model = COALESCE($4::varchar, model),
           updated_at = now()
       WHERE account_id = $1::uuid
       RETURNING *`,
      [
        accountId,
        patch.persona === undefined ? null : JSON.stringify(patch.persona),
        patch.timings === undefined ? null : JSON.stringify(patch.timings),
        patch.model ?? null,
      ],
    );
    return rows[0] ? hydrate(this.settings, rows[0]) : null;
  }

  /**
   * Включает или выключает агент. Момент включения запоминается только при
   * переходе из выключенного состояния: повторное «включить» его не сдвигает.
   */
  async setEnabled(
    accountId: string,
    enabled: boolean,
  ): Promise<BotAccountSettingsEntity | null> {
    const { rows } = await execute(
      this.settings.manager,
      `UPDATE bot_account_settings
       SET enabled = $2::boolean,
           enabled_at = CASE WHEN $2::boolean AND NOT enabled THEN now() ELSE enabled_at END,
           updated_at = now()
       WHERE account_id = $1::uuid
       RETURNING *`,
      [accountId, enabled],
    );
    return rows[0] ? hydrate(this.settings, rows[0]) : null;
  }
}
