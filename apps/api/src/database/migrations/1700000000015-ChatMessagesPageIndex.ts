import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Переписка стала постраничной: `ORDER BY sent_at DESC, telegram_message_id
 * DESC` и курсор по той же паре. Прежний индекс (chat_id, sent_at) не знал
 * второй половины ключа; новый покрывает её, и страница читается прямо с
 * места курсора. Старый — его префикс, поэтому больше не нужен.
 */
export class ChatMessagesPageIndex1700000000015 implements MigrationInterface {
  name = 'ChatMessagesPageIndex1700000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_telegram_messages_chat_sent_id"
        ON "telegram_messages" ("chat_id", "sent_at", "telegram_message_id")
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_telegram_messages_chat_sent"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_telegram_messages_chat_sent"
        ON "telegram_messages" ("chat_id", "sent_at")
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_telegram_messages_chat_sent_id"`,
    );
  }
}
