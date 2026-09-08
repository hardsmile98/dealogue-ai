import bcrypt from 'bcrypt';
import type { MigrationInterface, QueryRunner } from 'typeorm';

const DEFAULT_LOGIN = 'demo';
const DEFAULT_PASSWORD = 'demo1234';
const SEED_NAME = 'Демо-пользователь';
const BCRYPT_ROUNDS = 12;
const MAX_LOGIN_LENGTH = 64;

/**
 * Приводит логин к тому же виду, в котором его ищет UsersService.
 * Логика продублирована намеренно: миграция должна оставаться самодостаточной
 * и не меняться задним числом вслед за normalizeLogin в коде приложения.
 */
function resolveSeedLogin(): string {
  const login = (process.env.SEED_USER_LOGIN ?? DEFAULT_LOGIN)
    .trim()
    .toLowerCase();

  if (!login) {
    throw new Error('SEED_USER_LOGIN задан пустой строкой');
  }

  if (login.length > MAX_LOGIN_LENGTH) {
    throw new Error(
      `SEED_USER_LOGIN длиннее ${MAX_LOGIN_LENGTH} символов — столько не влезет в колонку users.login`,
    );
  }

  return login;
}

/**
 * Заводит первого пользователя, чтобы было чем логиниться.
 * Логин и пароль берутся из SEED_USER_LOGIN и SEED_USER_PASSWORD
 * (см. .env.example), пароль хешируется здесь же — в файле миграции лежит
 * только код хеширования, а не готовый хеш с чужой машины.
 *
 * Миграция уже применённая не перезапустится, так что менять эти переменные
 * имеет смысл до первого `npm run migration:run`. Иначе сначала
 * `npm run migration:revert`, потом `npm run migration:run` заново.
 *
 * Осторожно: down() удаляет пользователя по ТЕКУЩЕМУ значению SEED_USER_LOGIN.
 * Если логин уже поменяли в .env, откатывать нужно со старым значением:
 * `SEED_USER_LOGIN=прежний npm run migration:revert` — иначе откат не найдёт
 * созданную ранее строку и молча ничего не удалит.
 *
 * Своих пользователей добавляйте такой же миграцией: `npm run migration:create`,
 * затем впишите её в массив `migrations` в src/database/database.config.ts.
 */
export class SeedDemoUser1700000000001 implements MigrationInterface {
  name = 'SeedDemoUser1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const login = resolveSeedLogin();
    const password = process.env.SEED_USER_PASSWORD ?? DEFAULT_PASSWORD;
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    await queryRunner.query(
      `INSERT INTO "users" ("login", "password_hash", "name")
       VALUES ($1, $2, $3)
       ON CONFLICT ("login") DO NOTHING`,
      [login, passwordHash, SEED_NAME],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "users" WHERE "login" = $1`, [
      resolveSeedLogin(),
    ]);
  }
}
