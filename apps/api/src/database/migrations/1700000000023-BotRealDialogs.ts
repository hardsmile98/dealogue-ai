import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Подстройка агента под реальную переписку (docs/real-dialogs-report.md) —
 * тайминги по умолчанию: первое касание после диагностики — через 2–4 ч
 * после прочтения (было 45–75 мин), ступени — раз в сутки, 20–24 ч (было
 * 12–16 ч). Форма таймингов сохраняет их целиком, поэтому старые значения по
 * умолчанию в базе заменяются; заданные руками не трогаются. Новое поле
 * `offerAfterSilenceHours` берётся из умолчаний кода.
 */
export class BotRealDialogs1700000000023 implements MigrationInterface {
  name = 'BotRealDialogs1700000000023';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "bot_account_settings"
      SET "timings" = "timings" || '{"returnQuestionMin": {"min": 120, "max": 240}}'::jsonb
      WHERE "timings" -> 'returnQuestionMin' = '{"min": 45, "max": 75}'::jsonb
    `);
    await queryRunner.query(`
      UPDATE "bot_account_settings"
      SET "timings" = "timings" || '{"stepHours": {"min": 20, "max": 24}}'::jsonb
      WHERE "timings" -> 'stepHours' = '{"min": 12, "max": 16}'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "bot_account_settings"
      SET "timings" = "timings" || '{"stepHours": {"min": 12, "max": 16}}'::jsonb
      WHERE "timings" -> 'stepHours' = '{"min": 20, "max": 24}'::jsonb
    `);
    await queryRunner.query(`
      UPDATE "bot_account_settings"
      SET "timings" = "timings" || '{"returnQuestionMin": {"min": 45, "max": 75}}'::jsonb
      WHERE "timings" -> 'returnQuestionMin' = '{"min": 120, "max": 240}'::jsonb
    `);
  }
}
