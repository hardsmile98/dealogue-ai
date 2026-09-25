import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Карточка клиента в состоянии чата. Дальше её ведёт модель: каждый ход
 * возвращает карточку целиком, а колонки-слоты становятся её проекцией.
 *
 * Заполняем карточку из уже собранных колонок. `meta` оставляем пустой:
 * откуда взялись прежние значения (словарь имён, детектор алфавита, модель,
 * менеджер), достоверно не известно, а выдумывать источник хуже, чем
 * признать его неизвестным — `manual_slots` всё равно продолжает защищать
 * правки менеджера.
 */
export class AiClientCard1700000000011 implements MigrationInterface {
  name = 'AiClientCard1700000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_chat_state" ADD COLUMN IF NOT EXISTS "card" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
    await queryRunner.query(`
      UPDATE "ai_chat_state" SET "card" = jsonb_build_object(
        'birthDate', to_char("birth_date", 'YYYY-MM-DD'),
        'birthDateText', "birth_date_text",
        'birthPlace', "birth_place",
        'gender', "gender",
        'language', COALESCE(NULLIF("language", ''), 'ru'),
        'requestSummary', "request_summary",
        'requestCategoryKey', "request_category_key",
        'minorHint', "is_minor" AND "birth_date" IS NULL,
        'openThreads', '[]'::jsonb,
        'meta', '{}'::jsonb
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_chat_state" DROP COLUMN IF EXISTS "card"`,
    );
  }
}
