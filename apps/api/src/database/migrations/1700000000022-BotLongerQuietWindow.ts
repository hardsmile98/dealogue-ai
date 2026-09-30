import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Окно тишины длиннее: агент ждёт 2–3 мин от последнего сообщения клиента
 * (было 25–45 с), потолок — 10 мин от первого (было 3 мин). Форма таймингов
 * сохраняет их целиком, поэтому у аккаунтов, где тайминги уже сохраняли,
 * старые значения по умолчанию лежат в базе — их заменяем; заданные
 * руками не трогаем.
 */
export class BotLongerQuietWindow1700000000022 implements MigrationInterface {
  name = 'BotLongerQuietWindow1700000000022';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "bot_account_settings"
      SET "timings" = "timings" || '{"quietWindowSec": {"min": 120, "max": 180}}'::jsonb
      WHERE "timings" -> 'quietWindowSec' = '{"min": 25, "max": 45}'::jsonb
    `);
    await queryRunner.query(`
      UPDATE "bot_account_settings"
      SET "timings" = "timings" || '{"quietMaxSec": 600}'::jsonb
      WHERE "timings" -> 'quietMaxSec' = '180'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "bot_account_settings"
      SET "timings" = "timings" || '{"quietWindowSec": {"min": 25, "max": 45}}'::jsonb
      WHERE "timings" -> 'quietWindowSec' = '{"min": 120, "max": 180}'::jsonb
    `);
    await queryRunner.query(`
      UPDATE "bot_account_settings"
      SET "timings" = "timings" || '{"quietMaxSec": 180}'::jsonb
      WHERE "timings" -> 'quietMaxSec' = '600'::jsonb
    `);
  }
}
