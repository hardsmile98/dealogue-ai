import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Список чатов стал постраничным по курсору. Ключ сортировки —
 * `COALESCE(last_message_at, '-infinity') DESC, id DESC`: чаты без сообщений
 * уходят в конец, как при NULLS LAST, но ключ никогда не NULL. Поэтому
 * курсор — одно row-сравнение, и Postgres начинает страницу прямо с нужного
 * места индекса, а не пролистывает всё до него. Прежний индекс
 * (account_id, last_message_at) такой порядок не давал вовсе.
 */
export class AccountChatsPageIndex1700000000014 implements MigrationInterface {
  name = 'AccountChatsPageIndex1700000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_telegram_chats_account_last_id" ON "telegram_chats" (
        "account_id",
        (COALESCE("last_message_at", '-infinity'::timestamptz)) DESC,
        "id" DESC
      )
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_telegram_chats_account_last"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_telegram_chats_account_last"
        ON "telegram_chats" ("account_id", "last_message_at")
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_telegram_chats_account_last_id"`,
    );
  }
}
