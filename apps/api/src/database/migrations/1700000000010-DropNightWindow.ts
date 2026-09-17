import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ночное окно убрано: агент отвечает и делает касания в любое время суток.
 * От окна остаётся только таймзона аккаунта — она нужна дневным метрикам.
 */
export class DropNightWindow1700000000010 implements MigrationInterface {
  name = 'DropNightWindow1700000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_account_settings" ADD COLUMN "tz" varchar(64) NOT NULL DEFAULT 'Europe/Moscow'`);
    await queryRunner.query(
      `UPDATE "ai_account_settings" SET "tz" = "night_window" ->> 'tz' WHERE "night_window" ->> 'tz' IS NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "ai_account_settings" DROP COLUMN "night_window"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_account_settings" ADD COLUMN "night_window" jsonb NOT NULL DEFAULT '{}'::jsonb`);
    await queryRunner.query(
      `UPDATE "ai_account_settings" SET "night_window" = jsonb_build_object('enabled', false, 'from', '01:00', 'to', '08:00', 'tz', "tz")`,
    );
    await queryRunner.query(`ALTER TABLE "ai_account_settings" DROP COLUMN "tz"`);
  }
}
