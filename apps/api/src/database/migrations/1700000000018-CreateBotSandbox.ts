import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Песочница агента (docs/agent-architecture.md, раздел 8): сессия — это
 * виртуальный чат со своими часами поверх bot_chat_state (`sandbox = true`),
 * сообщения живут в bot_sandbox_messages и в Telegram не уходят. Удаление
 * состояния чата уносит сессию и переписку каскадом.
 */
export class CreateBotSandbox1700000000018 implements MigrationInterface {
  name = 'CreateBotSandbox1700000000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "bot_sandbox_sessions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL REFERENCES "telegram_accounts" ("id") ON DELETE CASCADE,
        "chat_id" uuid NOT NULL UNIQUE REFERENCES "bot_chat_state" ("chat_id") ON DELETE CASCADE,
        "title" varchar(200) NOT NULL,
        "source_chat_id" uuid REFERENCES "telegram_chats" ("id") ON DELETE SET NULL,
        "virtual_now" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_bot_sandbox_sessions_account_created" ON "bot_sandbox_sessions" ("account_id", "created_at")`,
    );

    // id — число: ядро адресует сообщения как telegram_message_id.
    await queryRunner.query(`
      CREATE TABLE "bot_sandbox_messages" (
        "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "session_id" uuid NOT NULL REFERENCES "bot_sandbox_sessions" ("id") ON DELETE CASCADE,
        "direction" varchar(3) NOT NULL,
        "text" text NOT NULL,
        "media_kind" varchar(16),
        "sent_at" timestamptz NOT NULL,
        "read_at" timestamptz,
        "block" boolean NOT NULL DEFAULT false,
        "delay_ms" integer,
        "typing_ms" integer,
        "turn_id" uuid REFERENCES "bot_turns" ("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_bot_sandbox_messages_session_id" ON "bot_sandbox_messages" ("session_id", "id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "bot_sandbox_messages", "bot_sandbox_sessions"`,
    );
  }
}
