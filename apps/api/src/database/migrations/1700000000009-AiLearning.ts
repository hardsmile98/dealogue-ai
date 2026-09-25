import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Этап 6 ИИ-агента: обучение и стабильность.
 *
 * - `client_text` у хода — текст входящих той же пачки. Нужен, чтобы искать
 *   похожие прошлые случаи (раздел 9.3) без джойна по `input_message_ids`;
 *   индексы такие же, как у черновиков: FTS `russian` + триграммы.
 * - `similar_case_ids` — на что опирался ход (видно в журнале).
 * - `library_ids` — какие примеры, блоки и диагностики ушли в этом ходе;
 *   по ним считается «ответили в 24 ч» (`replied_at`).
 */
export class AiLearning1700000000009 implements MigrationInterface {
  name = 'AiLearning1700000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_turns" ADD COLUMN IF NOT EXISTS "client_text" text NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_turns" ADD COLUMN IF NOT EXISTS "similar_case_ids" uuid[] NOT NULL DEFAULT '{}'::uuid[]`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_turns" ADD COLUMN IF NOT EXISTS "library_ids" uuid[] NOT NULL DEFAULT '{}'::uuid[]`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_turns" ADD COLUMN IF NOT EXISTS "replied_at" timestamptz NULL`,
    );

    // Старым ходам собираем текст клиента из сообщений пачки.
    await queryRunner.query(`
      UPDATE "ai_turns" t
      SET "client_text" = COALESCE(m."text", '')
      FROM (
        SELECT t2."id", string_agg(msg."text", E'\\n' ORDER BY msg."telegram_message_id") AS "text"
        FROM "ai_turns" t2
        JOIN "telegram_messages" msg ON msg."id" = ANY (t2."input_message_ids")
        GROUP BY t2."id"
      ) m
      WHERE m."id" = t."id" AND t."client_text" = ''
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_ai_turns_client_trgm" ON "ai_turns" USING gin ("client_text" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_turns_client_fts" ON "ai_turns" USING gin (to_tsvector('russian', "client_text"))`,
    );
    // Похожие случаи ищутся только среди хорошо оценённых ходов.
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_turns_rated_good" ON "ai_turns" ("account_id", "created_at" DESC) WHERE "rating" = 'good'`,
    );
    // Счётчик ответов: непосчитанные ходы чата за последние сутки.
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_turns_unreplied" ON "ai_turns" ("chat_id", "created_at" DESC) WHERE "replied_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ai_turns_unreplied"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ai_turns_rated_good"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ai_turns_client_fts"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ai_turns_client_trgm"`);
    await queryRunner.query(
      `ALTER TABLE "ai_turns" DROP COLUMN IF EXISTS "replied_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_turns" DROP COLUMN IF EXISTS "library_ids"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_turns" DROP COLUMN IF EXISTS "similar_case_ids"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_turns" DROP COLUMN IF EXISTS "client_text"`,
    );
  }
}
