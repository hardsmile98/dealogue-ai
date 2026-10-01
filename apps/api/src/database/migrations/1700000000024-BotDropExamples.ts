import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Примеры диалогов (`bot_examples`) убраны (решение владельца 01.10.2026):
 * агент пишет сам по плану, образцам фраз и разделу «о себе и о работе»
 * библиотеки, а полезные реплики из реальной переписки перенесены в
 * библиотеку (фразы `real.*`). Откат возвращает пустую таблицу в виде
 * миграции 0017.
 */
export class BotDropExamples1700000000024 implements MigrationInterface {
  name = 'BotDropExamples1700000000024';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "bot_examples"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "bot_examples" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL REFERENCES "telegram_accounts" ("id") ON DELETE CASCADE,
        "stage" varchar(16) NOT NULL,
        "situation" varchar(500) NOT NULL,
        "client" text NOT NULL,
        "practitioner" text NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "sort" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_bot_examples_account_stage_sort" ON "bot_examples" ("account_id", "stage", "sort")`,
    );
  }
}
