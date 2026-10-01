import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * До какой вехи агент ведёт клиента (решение владельца 01.10.2026):
 * диагностика, варианты работы или цены. После неё чат уходит менеджеру.
 * По умолчанию `prices` — вся воронка, как было до настройки.
 */
export class BotHandoffAfter1700000000025 implements MigrationInterface {
  name = 'BotHandoffAfter1700000000025';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bot_account_settings" ADD COLUMN "handoff_after" varchar(16) NOT NULL DEFAULT 'prices'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bot_account_settings" DROP COLUMN "handoff_after"`,
    );
  }
}
