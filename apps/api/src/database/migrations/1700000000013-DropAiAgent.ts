import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Старый ИИ-агент удалён целиком — бот будет написан заново. Уходят все его
 * таблицы (состояние чатов, ходы, библиотека, черновики, очередь, алерты,
 * статистика) и его колонки в таблицах Telegram: пометка «требует внимания»
 * у чата и `ai_turn_id` у сообщения.
 *
 * Миграции 0005–0012 остаются как история: в них же добавлены колонки,
 * которыми Telegram пользуется и дальше (`read_at`, `media_kind`,
 * `read_outbox_max_id`, `peer_access_hash`).
 */
export class DropAiAgent1700000000013 implements MigrationInterface {
  name = 'DropAiAgent1700000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS
        "ai_account_settings",
        "ai_chat_state",
        "ai_turns",
        "ai_events",
        "ai_playbooks",
        "ai_phrases",
        "ai_facts",
        "ai_diagnostics",
        "ai_categories",
        "ai_drafts",
        "ai_notes",
        "ai_stats_daily",
        "ai_jobs",
        "alerts"
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_telegram_chats_attention"`,
    );
    await queryRunner.query(`
      ALTER TABLE "telegram_chats"
        DROP COLUMN IF EXISTS "needs_attention",
        DROP COLUMN IF EXISTS "attention_reason",
        DROP COLUMN IF EXISTS "attention_at"
    `);
    await queryRunner.query(
      `ALTER TABLE "telegram_messages" DROP COLUMN IF EXISTS "ai_turn_id"`,
    );
  }

  public async down(): Promise<void> {
    // Данные старого агента не восстанавливаются; up() идемпотентен и переживает повторный прогон.
  }
}
