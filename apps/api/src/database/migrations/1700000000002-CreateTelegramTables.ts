import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTelegramTables1700000000002 implements MigrationInterface {
  name = 'CreateTelegramTables1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "telegram_accounts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
        "phone" varchar(32) NOT NULL,
        "telegram_user_id" bigint,
        "username" varchar(64),
        "display_name" varchar(128) NOT NULL,
        "status" varchar(16) NOT NULL,
        "status_message" text,
        "session_encrypted" text,
        "history_synced" boolean NOT NULL DEFAULT false,
        "connected_at" timestamptz NOT NULL DEFAULT now(),
        "last_sync_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_telegram_accounts_user_phone" UNIQUE ("user_id", "phone")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "telegram_login_attempts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
        "phone" varchar(32) NOT NULL,
        "phone_code_hash" varchar(128) NOT NULL,
        "session_encrypted" text NOT NULL,
        "code_verified" boolean NOT NULL DEFAULT false,
        "expires_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "telegram_chats" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL REFERENCES "telegram_accounts" ("id") ON DELETE CASCADE,
        "peer_id" bigint NOT NULL,
        "peer_name" varchar(256) NOT NULL,
        "peer_username" varchar(64),
        "peer_phone" varchar(32),
        "first_message_at" timestamptz,
        "first_message_direction" varchar(3),
        "lead_code" varchar(16),
        "last_message_text" text NOT NULL DEFAULT '',
        "last_message_at" timestamptz,
        "last_message_direction" varchar(3),
        "last_telegram_message_id" integer NOT NULL DEFAULT 0,
        "messages_count" integer NOT NULL DEFAULT 0,
        "history_synced" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_telegram_chats_account_peer" UNIQUE ("account_id", "peer_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_telegram_chats_account_first" ON "telegram_chats" ("account_id", "first_message_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_telegram_chats_account_last" ON "telegram_chats" ("account_id", "last_message_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "telegram_messages" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "chat_id" uuid NOT NULL REFERENCES "telegram_chats" ("id") ON DELETE CASCADE,
        "telegram_message_id" integer NOT NULL,
        "direction" varchar(3) NOT NULL,
        "text" text NOT NULL,
        "sent_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_telegram_messages_chat_tg_id" UNIQUE ("chat_id", "telegram_message_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_telegram_messages_chat_sent" ON "telegram_messages" ("chat_id", "sent_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "telegram_messages"`);
    await queryRunner.query(`DROP TABLE "telegram_chats"`);
    await queryRunner.query(`DROP TABLE "telegram_login_attempts"`);
    await queryRunner.query(`DROP TABLE "telegram_accounts"`);
  }
}
