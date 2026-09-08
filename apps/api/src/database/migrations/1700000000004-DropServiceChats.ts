import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Служебные аккаунты Telegram (уведомления 777000, Passport 42777) успели
 * попасть в чаты и в начала диалогов до того, как их стали отфильтровывать.
 * Сообщения и начала диалогов удаляются каскадом.
 */
export class DropServiceChats1700000000004 implements MigrationInterface {
  name = 'DropServiceChats1700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "telegram_chats" WHERE "peer_id" IN (777000, 42777)`,
    );
  }

  public async down(): Promise<void> {
    // Удалённые служебные чаты вернутся сами при следующей синхронизации старой версией.
  }
}
