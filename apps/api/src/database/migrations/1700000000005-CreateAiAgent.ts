import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ИИ-агент: настройки, профиль стиля, индекс обменов, очередь заданий,
 * аудит запусков, алерты; служебные колонки в чатах/сообщениях/аккаунтах.
 * Все новые колонки — с дефолтами или NULL, существующие данные не трогаем.
 */
export class CreateAiAgent1700000000005 implements MigrationInterface {
  name = 'CreateAiAgent1700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Триграммы — для поиска похожих сообщений клиентов без внешних сервисов.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    await queryRunner.query(`
      ALTER TABLE "telegram_accounts"
        ADD COLUMN "deep_history_status" varchar(16) NOT NULL DEFAULT 'none'
    `);

    await queryRunner.query(`
      ALTER TABLE "telegram_chats"
        ADD COLUMN "deep_history_synced" boolean NOT NULL DEFAULT false,
        ADD COLUMN "peer_access_hash" varchar(32),
        ADD COLUMN "ai_enabled" boolean NOT NULL DEFAULT false,
        ADD COLUMN "ai_stage" varchar(32),
        ADD COLUMN "ai_paused_reason" varchar(32),
        ADD COLUMN "ai_paused_at" timestamptz,
        ADD COLUMN "ai_messages_count" integer NOT NULL DEFAULT 0,
        ADD COLUMN "ai_last_reply_at" timestamptz,
        ADD COLUMN "ai_silence_since" timestamptz,
        ADD COLUMN "ai_followup_step" integer NOT NULL DEFAULT 0,
        ADD COLUMN "needs_attention" boolean NOT NULL DEFAULT false,
        ADD COLUMN "attention_reason" varchar(32),
        ADD COLUMN "attention_at" timestamptz
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_telegram_chats_attention" ON "telegram_chats" ("account_id", "needs_attention")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_telegram_chats_ai_enabled" ON "telegram_chats" ("account_id") WHERE "ai_enabled"`,
    );

    await queryRunner.query(`
      CREATE TABLE "ai_runs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL REFERENCES "telegram_accounts" ("id") ON DELETE CASCADE,
        "chat_id" uuid NOT NULL REFERENCES "telegram_chats" ("id") ON DELETE CASCADE,
        "trigger" varchar(16) NOT NULL,
        "followup_step" integer,
        "trigger_message_id" integer,
        "provider" varchar(32) NOT NULL,
        "model" varchar(64) NOT NULL,
        "prompt_hash" varchar(64),
        "prompt_snapshot" jsonb,
        "raw_response" text,
        "decision" jsonb,
        "status" varchar(16) NOT NULL,
        "skip_reason" varchar(64),
        "sent_telegram_message_ids" integer[],
        "input_tokens" integer NOT NULL DEFAULT 0,
        "output_tokens" integer NOT NULL DEFAULT 0,
        "cache_hit_tokens" integer NOT NULL DEFAULT 0,
        "latency_ms" integer NOT NULL DEFAULT 0,
        "error" text,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_runs_chat_created" ON "ai_runs" ("chat_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_runs_account_created" ON "ai_runs" ("account_id", "created_at")`,
    );

    await queryRunner.query(`
      ALTER TABLE "telegram_messages"
        ADD COLUMN "ai_run_id" uuid REFERENCES "ai_runs" ("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "ai_agent_settings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL REFERENCES "telegram_accounts" ("id") ON DELETE CASCADE,
        "enabled" boolean NOT NULL DEFAULT false,
        "provider" varchar(32),
        "model" varchar(64),
        "script" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "working_hours" jsonb,
        "debounce_sec" integer NOT NULL DEFAULT 25,
        "reply_delay_cap_sec" integer NOT NULL DEFAULT 180,
        "max_ai_messages_per_chat" integer NOT NULL DEFAULT 30,
        "max_ai_messages_per_day" integer NOT NULL DEFAULT 200,
        "context_messages" integer NOT NULL DEFAULT 30,
        "pause_on_handoff" boolean NOT NULL DEFAULT true,
        "notify_telegram" boolean NOT NULL DEFAULT true,
        "handoff_peer" varchar(128),
        "mark_read" boolean NOT NULL DEFAULT true,
        "followups_enabled" boolean NOT NULL DEFAULT true,
        "followups" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "use_learned_style" boolean NOT NULL DEFAULT true,
        "retrieval_examples" integer NOT NULL DEFAULT 6,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_ai_agent_settings_account" UNIQUE ("account_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "ai_style_profile" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL REFERENCES "telegram_accounts" ("id") ON DELETE CASCADE,
        "version" integer NOT NULL DEFAULT 0,
        "status" varchar(16) NOT NULL DEFAULT 'empty',
        "progress" jsonb,
        "built_at" timestamptz,
        "source_stats" jsonb,
        "profile" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "overrides" jsonb,
        "error" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_ai_style_profile_account" UNIQUE ("account_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "ai_exchanges" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL REFERENCES "telegram_accounts" ("id") ON DELETE CASCADE,
        "chat_id" uuid NOT NULL REFERENCES "telegram_chats" ("id") ON DELETE CASCADE,
        "client_message_id" integer NOT NULL,
        "client_text" text NOT NULL,
        "manager_text" text NOT NULL,
        "manager_parts" smallint NOT NULL DEFAULT 1,
        "client_at" timestamptz NOT NULL,
        "manager_at" timestamptz NOT NULL,
        "delay_sec" integer NOT NULL,
        "intent" varchar(24),
        "quality" smallint NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_ai_exchanges_chat_message" UNIQUE ("chat_id", "client_message_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_exchanges_account_intent" ON "ai_exchanges" ("account_id", "intent")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_exchanges_client_trgm" ON "ai_exchanges" USING gin ("client_text" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_exchanges_client_fts" ON "ai_exchanges" USING gin (to_tsvector('russian', "client_text"))`,
    );

    await queryRunner.query(`
      CREATE TABLE "ai_jobs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL REFERENCES "telegram_accounts" ("id") ON DELETE CASCADE,
        "chat_id" uuid REFERENCES "telegram_chats" ("id") ON DELETE CASCADE,
        "type" varchar(16) NOT NULL,
        "dedupe_key" varchar(64) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'queued',
        "run_at" timestamptz NOT NULL,
        "lock_until" timestamptz,
        "attempts" integer NOT NULL DEFAULT 0,
        "max_attempts" integer NOT NULL DEFAULT 5,
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "last_error" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_jobs_status_run_at" ON "ai_jobs" ("status", "run_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_jobs_account_type" ON "ai_jobs" ("account_id", "type")`,
    );
    // Один активный job на ключ: повторный enqueue сдвигает run_at, а не плодит дубли.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_ai_jobs_active_key" ON "ai_jobs" ("dedupe_key") WHERE "status" IN ('queued', 'running')`,
    );

    await queryRunner.query(`
      CREATE TABLE "alerts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL REFERENCES "telegram_accounts" ("id") ON DELETE CASCADE,
        "chat_id" uuid REFERENCES "telegram_chats" ("id") ON DELETE CASCADE,
        "type" varchar(24) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'open',
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "acknowledged_at" timestamptz,
        "acknowledged_by" uuid,
        "resolved_at" timestamptz,
        "resolved_by" uuid
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_alerts_account_status_created" ON "alerts" ("account_id", "status", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_alerts_open_chat_type" ON "alerts" ("chat_id", "type") WHERE "status" = 'open' AND "chat_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "alerts"`);
    await queryRunner.query(`DROP TABLE "ai_jobs"`);
    await queryRunner.query(`DROP TABLE "ai_exchanges"`);
    await queryRunner.query(`DROP TABLE "ai_style_profile"`);
    await queryRunner.query(`DROP TABLE "ai_agent_settings"`);
    await queryRunner.query(`ALTER TABLE "telegram_messages" DROP COLUMN "ai_run_id"`);
    await queryRunner.query(`DROP TABLE "ai_runs"`);
    await queryRunner.query(`DROP INDEX "IDX_telegram_chats_ai_enabled"`);
    await queryRunner.query(`DROP INDEX "IDX_telegram_chats_attention"`);
    await queryRunner.query(`
      ALTER TABLE "telegram_chats"
        DROP COLUMN "deep_history_synced",
        DROP COLUMN "peer_access_hash",
        DROP COLUMN "ai_enabled",
        DROP COLUMN "ai_stage",
        DROP COLUMN "ai_paused_reason",
        DROP COLUMN "ai_paused_at",
        DROP COLUMN "ai_messages_count",
        DROP COLUMN "ai_last_reply_at",
        DROP COLUMN "ai_silence_since",
        DROP COLUMN "ai_followup_step",
        DROP COLUMN "needs_attention",
        DROP COLUMN "attention_reason",
        DROP COLUMN "attention_at"
    `);
    await queryRunner.query(`ALTER TABLE "telegram_accounts" DROP COLUMN "deep_history_status"`);
  }
}
