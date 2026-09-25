import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Таблицы нового агента (docs/agent-architecture.md, раздел 9):
 * настройки и библиотека аккаунта, примеры, состояние чата и его память,
 * отложенные ходы, журнал. Все таблицы новые — старый агент снесён
 * миграцией DropAiAgent. `bot_chat_state.chat_id` без внешнего ключа:
 * в песочнице чат виртуальный; чистка при удалении аккаунта — каскадом
 * по account_id, память и журнал — каскадом от состояния чата.
 */
export class CreateBotTables1700000000017 implements MigrationInterface {
  name = 'CreateBotTables1700000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "bot_account_settings" (
        "account_id" uuid PRIMARY KEY REFERENCES "telegram_accounts" ("id") ON DELETE CASCADE,
        "enabled" boolean NOT NULL DEFAULT false,
        "enabled_at" timestamptz,
        "persona" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "timings" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "model" varchar(64) NOT NULL DEFAULT 'deepseek-chat',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "bot_library_items" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL REFERENCES "telegram_accounts" ("id") ON DELETE CASCADE,
        "kind" varchar(32) NOT NULL,
        "language" varchar(8) NOT NULL DEFAULT 'ru',
        "gender" varchar(1),
        "category" varchar(64),
        "title" varchar(200) NOT NULL,
        "text" text NOT NULL,
        "sort" integer NOT NULL DEFAULT 0,
        "enabled" boolean NOT NULL DEFAULT true,
        "seed_key" varchar(64),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_bot_library_items_account_kind_sort" ON "bot_library_items" ("account_id", "kind", "sort")`,
    );
    // Частичный: у элементов, созданных руками, seed_key пустой.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_bot_library_items_account_seed" ON "bot_library_items" ("account_id", "seed_key") WHERE "seed_key" IS NOT NULL`,
    );

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

    await queryRunner.query(`
      CREATE TABLE "bot_chat_state" (
        "chat_id" uuid PRIMARY KEY,
        "account_id" uuid NOT NULL REFERENCES "telegram_accounts" ("id") ON DELETE CASCADE,
        "mode" varchar(8) NOT NULL DEFAULT 'auto',
        "card" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "summary" text NOT NULL DEFAULT '',
        "turns_without_nudge" integer NOT NULL DEFAULT 0,
        "reminders_sent" integer NOT NULL DEFAULT 0,
        "last_handled_message_id" integer NOT NULL DEFAULT 0,
        "generation_seq" integer NOT NULL DEFAULT 0,
        "handoff_reason" varchar(32),
        "handoff_at" timestamptz,
        "label" varchar(32),
        "sandbox" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_bot_chat_state_account_mode" ON "bot_chat_state" ("account_id", "mode")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bot_chat_state_account_label" ON "bot_chat_state" ("account_id", "label") WHERE "label" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "bot_client_facts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "chat_id" uuid NOT NULL REFERENCES "bot_chat_state" ("chat_id") ON DELETE CASCADE,
        "kind" varchar(16) NOT NULL,
        "text" text NOT NULL,
        "source_message_id" integer,
        "confidence" real NOT NULL DEFAULT 1,
        "status" varchar(12) NOT NULL DEFAULT 'active',
        "superseded_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_bot_client_facts_chat_status_created" ON "bot_client_facts" ("chat_id", "status", "created_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "bot_chat_said" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "chat_id" uuid NOT NULL REFERENCES "bot_chat_state" ("chat_id") ON DELETE CASCADE,
        "kind" varchar(16) NOT NULL,
        "key" varchar(64) NOT NULL,
        "message_id" integer,
        "at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_bot_chat_said_chat_kind_at" ON "bot_chat_said" ("chat_id", "kind", "at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "bot_jobs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "chat_id" uuid NOT NULL REFERENCES "bot_chat_state" ("chat_id") ON DELETE CASCADE,
        "kind" varchar(32) NOT NULL,
        "run_at" timestamptz NOT NULL,
        "status" varchar(12) NOT NULL DEFAULT 'pending',
        "attempts" integer NOT NULL DEFAULT 0,
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "last_error" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_bot_jobs_status_run_at" ON "bot_jobs" ("status", "run_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bot_jobs_chat_status" ON "bot_jobs" ("chat_id", "status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "bot_turns" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "chat_id" uuid NOT NULL REFERENCES "bot_chat_state" ("chat_id") ON DELETE CASCADE,
        "account_id" uuid NOT NULL REFERENCES "telegram_accounts" ("id") ON DELETE CASCADE,
        "trigger" varchar(16) NOT NULL,
        "idempotency_key" varchar(80) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'running',
        "input" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "analysis" jsonb,
        "plan" jsonb,
        "draft" text,
        "review" jsonb,
        "final" jsonb,
        "sent" jsonb,
        "error" text,
        "started_at" timestamptz NOT NULL DEFAULT now(),
        "finished_at" timestamptz,
        CONSTRAINT "UQ_bot_turns_idempotency_key" UNIQUE ("idempotency_key")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_bot_turns_chat_started_at" ON "bot_turns" ("chat_id", "started_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "bot_prompt_snapshots" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "turn_id" uuid NOT NULL REFERENCES "bot_turns" ("id") ON DELETE CASCADE,
        "kind" varchar(16) NOT NULL,
        "request" text NOT NULL,
        "response" text,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_bot_prompt_snapshots_created_at" ON "bot_prompt_snapshots" ("created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS
        "bot_prompt_snapshots",
        "bot_turns",
        "bot_jobs",
        "bot_chat_said",
        "bot_client_facts",
        "bot_chat_state",
        "bot_examples",
        "bot_library_items",
        "bot_account_settings"
    `);
  }
}
