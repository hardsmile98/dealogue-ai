import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Индекс (account_id, first_message_at) остался со времён, когда статистика
 * считалась по чатам; теперь её источник — telegram_dialog_starts, а по
 * first_message_at никто не ищет. Строка чата переписывается на каждое
 * сообщение (last_message_*), и лишний индекс только удорожал эти записи.
 */
export class DropChatsFirstMessageIndex1700000000016 implements MigrationInterface {
  name = 'DropChatsFirstMessageIndex1700000000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_telegram_chats_account_first"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_telegram_chats_account_first"
        ON "telegram_chats" ("account_id", "first_message_at")
    `);
  }
}
