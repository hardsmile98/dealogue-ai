import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `gender_source` убран: откуда взялось поле, теперь хранит сама карточка
 * (`card.meta.gender.source`) — и не только для пола, а для каждого поля,
 * вместе со словами клиента, из которых вывод сделан. Значение `name`
 * (словарь имён) больше не появляется вовсе: пол определяет модель.
 */
export class DropGenderSource1700000000012 implements MigrationInterface {
  name = 'DropGenderSource1700000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Правки менеджера переносим в карточку, чтобы источник не потерялся.
    await queryRunner.query(`
      UPDATE "ai_chat_state"
      SET "card" = jsonb_set(
        "card",
        '{meta,gender}',
        jsonb_build_object('source', 'manager', 'evidence', NULL, 'turnId', NULL, 'at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
      )
      WHERE "gender_source" = 'manual' AND "card" ? 'meta'
    `);
    await queryRunner.query(
      `ALTER TABLE "ai_chat_state" DROP COLUMN IF EXISTS "gender_source"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_chat_state" ADD COLUMN IF NOT EXISTS "gender_source" varchar(16) NULL`,
    );
    await queryRunner.query(
      `UPDATE "ai_chat_state" SET "gender_source" = 'manual' WHERE "card" #>> '{meta,gender,source}' = 'manager'`,
    );
  }
}
