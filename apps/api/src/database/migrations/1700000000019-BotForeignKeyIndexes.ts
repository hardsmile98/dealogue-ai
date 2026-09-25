import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Индексы под внешние ключи агента, у которых их не было. Удаление хода
 * (каскадом от сессии песочницы или состояния чата) ищет его снимки
 * промптов и сообщения песочницы по `turn_id`, удаление чата Telegram
 * (каскадом от аккаунта) — сессии песочницы по `source_chat_id`. Без
 * индекса каждое такое удаление читало таблицу целиком, а
 * bot_prompt_snapshots — самая тяжёлая таблица агента. Только новые
 * индексы, схема не меняется.
 */
export class BotForeignKeyIndexes1700000000019 implements MigrationInterface {
  name = 'BotForeignKeyIndexes1700000000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_bot_prompt_snapshots_turn" ON "bot_prompt_snapshots" ("turn_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_bot_sandbox_messages_turn" ON "bot_sandbox_messages" ("turn_id") WHERE "turn_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_bot_sandbox_sessions_source_chat" ON "bot_sandbox_sessions" ("source_chat_id") WHERE "source_chat_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_bot_sandbox_sessions_source_chat"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_bot_sandbox_messages_turn"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_bot_prompt_snapshots_turn"`,
    );
  }
}
