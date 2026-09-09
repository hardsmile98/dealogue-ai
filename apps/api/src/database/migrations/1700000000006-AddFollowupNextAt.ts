import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Денормализованное «когда следующий дожим» — чтобы список чатов не ходил в очередь. */
export class AddFollowupNextAt1700000000006 implements MigrationInterface {
  name = 'AddFollowupNextAt1700000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "telegram_chats" ADD COLUMN "ai_followup_next_at" timestamptz`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "telegram_chats" DROP COLUMN "ai_followup_next_at"`);
  }
}
