import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ИИ-агент v2 (docs/ai-agent-spec.md): сносим данные старого агента
 * (стиль из истории, дожимы) и создаём таблицы воронки, библиотеки,
 * ходов и черновиков. Прочтение и вид медиа — у сообщений.
 *
 * Данные старого агента не переносятся — владелец подтвердил.
 */
export class CreateAiFunnel1700000000007 implements MigrationInterface {
  name = 'CreateAiFunnel1700000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    // --- снос старого ----------------------------------------------------------
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_exchanges"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_style_profile"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_agent_settings"`);
    await queryRunner.query(`ALTER TABLE "telegram_messages" DROP COLUMN IF EXISTS "ai_run_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_runs"`);
    await queryRunner.query(`DELETE FROM "ai_jobs"`);
    await queryRunner.query(`DELETE FROM "alerts"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_telegram_chats_ai_enabled"`);
    await queryRunner.query(`
      ALTER TABLE "telegram_chats"
        DROP COLUMN IF EXISTS "deep_history_synced",
        DROP COLUMN IF EXISTS "ai_enabled",
        DROP COLUMN IF EXISTS "ai_stage",
        DROP COLUMN IF EXISTS "ai_paused_reason",
        DROP COLUMN IF EXISTS "ai_paused_at",
        DROP COLUMN IF EXISTS "ai_messages_count",
        DROP COLUMN IF EXISTS "ai_last_reply_at",
        DROP COLUMN IF EXISTS "ai_silence_since",
        DROP COLUMN IF EXISTS "ai_followup_step",
        DROP COLUMN IF EXISTS "ai_followup_next_at"
    `);
    await queryRunner.query(`ALTER TABLE "telegram_accounts" DROP COLUMN IF EXISTS "deep_history_status"`);
    // Пометка «требует внимания» остаётся, но причина теперь — тип алерта.
    await queryRunner.query(
      `UPDATE "telegram_chats" SET "needs_attention" = false, "attention_reason" = NULL, "attention_at" = NULL`,
    );

    // --- прочтение, медиа, ход-отправитель --------------------------------------
    await queryRunner.query(`
      ALTER TABLE "telegram_messages"
        ADD COLUMN "read_at" timestamptz,
        ADD COLUMN "ai_turn_id" uuid,
        ADD COLUMN "media_kind" varchar(16)
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_telegram_messages_unread_out" ON "telegram_messages" ("chat_id", "telegram_message_id") WHERE "direction" = 'out' AND "read_at" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "telegram_chats" ADD COLUMN "read_outbox_max_id" integer NOT NULL DEFAULT 0`,
    );

    // --- настройки аккаунта ------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "ai_account_settings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL UNIQUE REFERENCES "telegram_accounts" ("id") ON DELETE CASCADE,
        "enabled" boolean NOT NULL DEFAULT false,
        "dry_run" boolean NOT NULL DEFAULT true,
        "default_chat_mode" varchar(16) NOT NULL DEFAULT 'auto',
        "assistant_for_existing_chats" boolean NOT NULL DEFAULT true,
        "persona" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "timings" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "limits" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "guard" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "night_window" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "mark_read" boolean NOT NULL DEFAULT true,
        "notify_telegram" boolean NOT NULL DEFAULT true,
        "handoff_peer" varchar(128),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // --- состояние чата ------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "ai_chat_state" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "chat_id" uuid NOT NULL UNIQUE REFERENCES "telegram_chats" ("id") ON DELETE CASCADE,
        "account_id" uuid NOT NULL REFERENCES "telegram_accounts" ("id") ON DELETE CASCADE,
        "mode" varchar(16) NOT NULL DEFAULT 'off',
        "stage" varchar(32) NOT NULL DEFAULT 'greeting',
        "stage_entered_at" timestamptz,
        "next_touch_kind" varchar(32),
        "next_touch_at" timestamptz,
        "last_interval_hours" numeric(6,2),
        "reminders_sent" integer NOT NULL DEFAULT 0,
        "touch_postponed_count" integer NOT NULL DEFAULT 0,
        "birth_date" date,
        "birth_date_text" varchar(64),
        "birth_place" varchar(256),
        "age" integer,
        "is_minor" boolean NOT NULL DEFAULT false,
        "gender" varchar(1),
        "gender_source" varchar(16),
        "language" varchar(8) NOT NULL DEFAULT 'ru',
        "request_category_key" varchar(64),
        "request_summary" text,
        "request_text" text,
        "manual_slots" varchar[] NOT NULL DEFAULT '{}'::varchar[],
        "sent_block_ids" uuid[] NOT NULL DEFAULT '{}'::uuid[],
        "used_example_ids" uuid[] NOT NULL DEFAULT '{}'::uuid[],
        "diagnostics_template_id" uuid,
        "diagnostics_sent_at" timestamptz,
        "diagnostics_read_at" timestamptz,
        "last_greeting_at" timestamptz,
        "auto_messages_since_client" integer NOT NULL DEFAULT 0,
        "handoff_reason" varchar(32),
        "handoff_at" timestamptz,
        "funnel_started_at" timestamptz,
        "closed_at" timestamptz,
        "last_client_message_at" timestamptz,
        "last_bot_message_at" timestamptz,
        "manual_notes" text,
        "version" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_chat_state_account_mode_stage" ON "ai_chat_state" ("account_id", "mode", "stage")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_ai_chat_state_next_touch" ON "ai_chat_state" ("next_touch_at")`);

    // --- ходы и события ---------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "ai_turns" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL REFERENCES "telegram_accounts" ("id") ON DELETE CASCADE,
        "chat_id" uuid NOT NULL REFERENCES "telegram_chats" ("id") ON DELETE CASCADE,
        "trigger" varchar(16) NOT NULL,
        "touch_kind" varchar(32),
        "stage_before" varchar(32),
        "stage_after" varchar(32),
        "input_message_ids" uuid[] NOT NULL DEFAULT '{}'::uuid[],
        "prompt_version" varchar(16),
        "model" varchar(64),
        "analysis" jsonb,
        "messages_planned" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "messages_sent" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "guard_notes" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "outcome" varchar(24) NOT NULL,
        "error" text,
        "tokens_in" integer NOT NULL DEFAULT 0,
        "tokens_out" integer NOT NULL DEFAULT 0,
        "duration_ms" integer NOT NULL DEFAULT 0,
        "rating" varchar(8),
        "rating_note" text,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_ai_turns_chat_created" ON "ai_turns" ("chat_id", "created_at" DESC)`);
    await queryRunner.query(`CREATE INDEX "IDX_ai_turns_account_created" ON "ai_turns" ("account_id", "created_at" DESC)`);

    await queryRunner.query(`
      CREATE TABLE "ai_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL REFERENCES "telegram_accounts" ("id") ON DELETE CASCADE,
        "chat_id" uuid REFERENCES "telegram_chats" ("id") ON DELETE CASCADE,
        "kind" varchar(32) NOT NULL,
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_ai_events_chat_created" ON "ai_events" ("chat_id", "created_at" DESC)`);

    // --- библиотека ---------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "ai_playbooks" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL REFERENCES "telegram_accounts" ("id") ON DELETE CASCADE,
        "stage" varchar(32) NOT NULL,
        "goal" text NOT NULL DEFAULT '',
        "instructions" text NOT NULL DEFAULT '',
        "required_block_kinds" varchar[] NOT NULL DEFAULT '{}'::varchar[],
        "allowed_block_kinds" varchar[] NOT NULL DEFAULT '{}'::varchar[],
        "example_kinds" varchar[] NOT NULL DEFAULT '{}'::varchar[],
        "no_questions" boolean NOT NULL DEFAULT false,
        "enabled" boolean NOT NULL DEFAULT true,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("account_id", "stage")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "ai_phrases" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL REFERENCES "telegram_accounts" ("id") ON DELETE CASCADE,
        "usage" varchar(8) NOT NULL DEFAULT 'example',
        "kind" varchar(32) NOT NULL,
        "category_key" varchar(64),
        "gender" varchar(1),
        "language" varchar(8) NOT NULL DEFAULT 'ru',
        "title" varchar(128) NOT NULL DEFAULT '',
        "text" text NOT NULL,
        "conditions" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "enabled" boolean NOT NULL DEFAULT true,
        "weight" integer NOT NULL DEFAULT 1,
        "sort_order" integer NOT NULL DEFAULT 0,
        "sent_count" integer NOT NULL DEFAULT 0,
        "replied_count" integer NOT NULL DEFAULT 0,
        "source" varchar(16) NOT NULL DEFAULT 'manual',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_phrases_account_kind_enabled" ON "ai_phrases" ("account_id", "kind", "enabled")`,
    );

    await queryRunner.query(`
      CREATE TABLE "ai_facts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL REFERENCES "telegram_accounts" ("id") ON DELETE CASCADE,
        "group" varchar(16) NOT NULL,
        "key" varchar(64) NOT NULL,
        "title" varchar(128) NOT NULL,
        "value" text NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("account_id", "key")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "ai_diagnostics" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL REFERENCES "telegram_accounts" ("id") ON DELETE CASCADE,
        "key" varchar(64) NOT NULL,
        "title" varchar(128) NOT NULL,
        "category_key" varchar(64),
        "gender" varchar(1),
        "language" varchar(8) NOT NULL DEFAULT 'ru',
        "text" text NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "weight" integer NOT NULL DEFAULT 1,
        "sort_order" integer NOT NULL DEFAULT 0,
        "sent_count" integer NOT NULL DEFAULT 0,
        "replied_count" integer NOT NULL DEFAULT 0,
        "source" varchar(16) NOT NULL DEFAULT 'manual',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("account_id", "key")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_diagnostics_lookup" ON "ai_diagnostics" ("account_id", "category_key", "gender", "language")`,
    );

    await queryRunner.query(`
      CREATE TABLE "ai_categories" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL REFERENCES "telegram_accounts" ("id") ON DELETE CASCADE,
        "key" varchar(64) NOT NULL,
        "group_key" varchar(32) NOT NULL,
        "title" varchar(128) NOT NULL,
        "description" text NOT NULL DEFAULT '',
        "clarifying_fact_key" varchar(32),
        "clarifying_question" text,
        "enabled" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("account_id", "key")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "ai_notes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL REFERENCES "telegram_accounts" ("id") ON DELETE CASCADE,
        "text" text NOT NULL,
        "scope" varchar(96) NOT NULL DEFAULT 'global',
        "source" varchar(16) NOT NULL DEFAULT 'manual',
        "enabled" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_ai_notes_account_enabled" ON "ai_notes" ("account_id", "enabled")`);

    // --- черновики -------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "ai_drafts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL REFERENCES "telegram_accounts" ("id") ON DELETE CASCADE,
        "chat_id" uuid NOT NULL REFERENCES "telegram_chats" ("id") ON DELETE CASCADE,
        "turn_id" uuid REFERENCES "ai_turns" ("id") ON DELETE SET NULL,
        "kind" varchar(16) NOT NULL DEFAULT 'handoff',
        "status" varchar(24) NOT NULL DEFAULT 'pending',
        "client_message_ids" uuid[] NOT NULL DEFAULT '{}'::uuid[],
        "client_text" text NOT NULL DEFAULT '',
        "handoff_reason" varchar(32),
        "draft_messages" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "draft_rationale" text,
        "similar_case_ids" uuid[] NOT NULL DEFAULT '{}'::uuid[],
        "final_text" text,
        "sent_message_ids" uuid[] NOT NULL DEFAULT '{}'::uuid[],
        "decided_by" uuid,
        "decided_at" timestamptz,
        "decision_source" varchar(8),
        "prompt_version" varchar(16),
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_drafts_account_status_created" ON "ai_drafts" ("account_id", "status", "created_at" DESC)`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_ai_drafts_chat_created" ON "ai_drafts" ("chat_id", "created_at" DESC)`);
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_drafts_client_trgm" ON "ai_drafts" USING gin ("client_text" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_drafts_client_fts" ON "ai_drafts" USING gin (to_tsvector('russian', "client_text"))`,
    );

    // --- статистика --------------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "ai_stats_daily" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL REFERENCES "telegram_accounts" ("id") ON DELETE CASCADE,
        "date" date NOT NULL,
        "metrics" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("account_id", "date")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_stats_daily"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_drafts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_notes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_categories"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_diagnostics"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_facts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_phrases"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_playbooks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_turns"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_chat_state"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_account_settings"`);
    await queryRunner.query(`ALTER TABLE "telegram_chats" DROP COLUMN IF EXISTS "read_outbox_max_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_telegram_messages_unread_out"`);
    await queryRunner.query(`
      ALTER TABLE "telegram_messages"
        DROP COLUMN IF EXISTS "read_at",
        DROP COLUMN IF EXISTS "ai_turn_id",
        DROP COLUMN IF EXISTS "media_kind"
    `);
    // Колонки и таблицы старого агента не восстанавливаются: их данные удалены.
  }
}
