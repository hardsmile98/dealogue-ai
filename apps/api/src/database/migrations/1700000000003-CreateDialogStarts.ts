import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Выносит «начало диалога» в отдельную таблицу и переносит туда уже
 * собранные данные. parser_version = 0 у перенесённых строк заставит
 * приложение пересчитать коды актуальным парсером при старте.
 */
export class CreateDialogStarts1700000000003 implements MigrationInterface {
  name = 'CreateDialogStarts1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "telegram_dialog_starts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL REFERENCES "telegram_accounts" ("id") ON DELETE CASCADE,
        "chat_id" uuid NOT NULL REFERENCES "telegram_chats" ("id") ON DELETE CASCADE,
        "telegram_message_id" integer NOT NULL,
        "started_at" timestamptz NOT NULL,
        "text" text NOT NULL,
        "lead_code" varchar(16),
        "lead_marker" varchar(8),
        "parser_version" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_telegram_dialog_starts_chat" UNIQUE ("chat_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_telegram_dialog_starts_account_started" ON "telegram_dialog_starts" ("account_id", "started_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_telegram_dialog_starts_account_code" ON "telegram_dialog_starts" ("account_id", "lead_code", "started_at")`,
    );

    await queryRunner.query(
      `ALTER TABLE "telegram_chats" ADD COLUMN "first_message_id" integer`,
    );
    await queryRunner.query(`
      UPDATE "telegram_chats" c
      SET "first_message_id" = m.min_id
      FROM (
        SELECT "chat_id", MIN("telegram_message_id") AS min_id
        FROM "telegram_messages"
        GROUP BY "chat_id"
      ) m
      WHERE m."chat_id" = c."id" AND c."history_synced"
    `);

    // Перенос уже известных начал диалогов: первое сохранённое сообщение чата.
    await queryRunner.query(`
      INSERT INTO "telegram_dialog_starts"
        ("account_id", "chat_id", "telegram_message_id", "started_at", "text", "lead_code", "parser_version")
      SELECT c."account_id", c."id", m."telegram_message_id", m."sent_at", m."text", c."lead_code", 0
      FROM "telegram_chats" c
      JOIN LATERAL (
        SELECT "telegram_message_id", "sent_at", "text"
        FROM "telegram_messages"
        WHERE "chat_id" = c."id"
        ORDER BY "telegram_message_id" ASC
        LIMIT 1
      ) m ON true
      WHERE c."history_synced" AND c."first_message_direction" = 'in'
      ON CONFLICT ("chat_id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "telegram_chats" DROP COLUMN "first_message_id"`);
    await queryRunner.query(`DROP TABLE "telegram_dialog_starts"`);
  }
}
