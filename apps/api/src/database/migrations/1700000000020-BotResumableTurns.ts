import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ходы агента переживают остановку API.
 *
 * - `bot_turns.delivery` — точка фиксации: собранный и проверенный текст с
 *   планом задержек. Ход с этой записью после перезапуска досылается с того
 *   места, где остановился, без него — повторяется целиком.
 * - Ключ идемпотентности уникален только среди ходов, которые не
 *   `interrupted`: ход, прерванный до фиксации, ничего не отправил, и его
 *   повтор с тем же ключом (`чат:поколение`, `job:<id>`) должен пройти.
 *   Раньше повтор молча пропускался — терялись ответ клиенту или ступень
 *   лестницы молчания.
 */
export class BotResumableTurns1700000000020 implements MigrationInterface {
  name = 'BotResumableTurns1700000000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bot_turns" ADD COLUMN IF NOT EXISTS "delivery" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "bot_turns" DROP CONSTRAINT IF EXISTS "UQ_bot_turns_idempotency_key"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_bot_turns_idempotency_key_active" ON "bot_turns" ("idempotency_key") WHERE "status" <> 'interrupted'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_bot_turns_idempotency_key_active"`,
    );
    // Повторы прерванных ходов несут тот же ключ: старое полное ограничение
    // встанет, только если прерванные строки уступят ключ.
    await queryRunner.query(
      `UPDATE "bot_turns" SET "idempotency_key" = left("idempotency_key", 40) || ':' || "id" WHERE "status" = 'interrupted'`,
    );
    await queryRunner.query(
      `ALTER TABLE "bot_turns" ADD CONSTRAINT "UQ_bot_turns_idempotency_key" UNIQUE ("idempotency_key")`,
    );
    await queryRunner.query(
      `ALTER TABLE "bot_turns" DROP COLUMN IF EXISTS "delivery"`,
    );
  }
}
