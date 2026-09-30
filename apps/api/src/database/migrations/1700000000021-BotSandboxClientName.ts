import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Имя клиента в профиле Telegram у сессии песочницы. Анализатор определяет
 * по нему пол, как в живом чате: у копии реального чата это имя
 * собеседника, у новой сессии — то, что владелец ввёл при создании (пусто —
 * клиент без имени). Копиям, созданным раньше, имя переносится из чата.
 */
export class BotSandboxClientName1700000000021 implements MigrationInterface {
  name = 'BotSandboxClientName1700000000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bot_sandbox_sessions" ADD COLUMN IF NOT EXISTS "client_name" varchar(200)`,
    );
    await queryRunner.query(`
      UPDATE "bot_sandbox_sessions" session
      SET "client_name" = NULLIF(btrim(chat."peer_name"), '')
      FROM "telegram_chats" chat
      WHERE chat."id" = session."source_chat_id" AND session."client_name" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bot_sandbox_sessions" DROP COLUMN IF EXISTS "client_name"`,
    );
  }
}
