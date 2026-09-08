import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersTable1700000000000 implements MigrationInterface {
  name = 'CreateUsersTable1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "login" varchar(64) NOT NULL,
        "password_hash" varchar(255) NOT NULL,
        "name" varchar(128) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_login" UNIQUE ("login")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
