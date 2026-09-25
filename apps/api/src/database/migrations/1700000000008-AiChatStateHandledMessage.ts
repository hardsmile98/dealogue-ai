import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Этап 3 ИИ-агента: граница обработанных входящих. Ход берёт в работу
 * все входящие с telegram_message_id больше этой границы, поэтому пачка
 * после дебаунса собирается точно, а «клиент написал во время отправки»
 * определяется без гонок.
 */
export class AiChatStateHandledMessage1700000000008 implements MigrationInterface {
  name = 'AiChatStateHandledMessage1700000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_chat_state" ADD COLUMN IF NOT EXISTS "last_handled_message_id" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_chat_state" ADD COLUMN IF NOT EXISTS "last_manager_message_at" timestamptz NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_chat_state" DROP COLUMN IF EXISTS "last_manager_message_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_chat_state" DROP COLUMN IF EXISTS "last_handled_message_id"`,
    );
  }
}
