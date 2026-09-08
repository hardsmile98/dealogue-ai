import type { DataSourceOptions } from 'typeorm';
import { UserEntity } from '../users/user.entity.js';
import { CreateUsersTable1700000000000 } from './migrations/1700000000000-CreateUsersTable.js';
import { SeedDemoUser1700000000001 } from './migrations/1700000000001-SeedDemoUser.js';

export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  logging: boolean;
}

export function readDatabaseConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseConfig {
  return {
    host: env.DB_HOST ?? 'localhost',
    port: Number(env.DB_PORT ?? 5432),
    username: env.DB_USER ?? 'dealogue',
    password: env.DB_PASSWORD ?? 'dealogue',
    database: env.DB_NAME ?? 'dealogue',
    logging: env.DB_LOGGING === 'true',
  };
}

/**
 * Один источник опций и для приложения (AppModule), и для CLI миграций
 * (src/database/data-source.ts) — чтобы они не разъезжались.
 *
 * Сущности и миграции перечислены явно, а не глобом: проект на ESM,
 * где глобы TypeORM работают ненадёжно. Новую миграцию нужно добавить
 * в массив `migrations` руками.
 */
export function buildTypeOrmOptions(config: DatabaseConfig): DataSourceOptions {
  return {
    type: 'postgres',
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    database: config.database,
    logging: config.logging,
    entities: [UserEntity],
    migrations: [CreateUsersTable1700000000000, SeedDemoUser1700000000001],
    // Схему меняем только миграциями.
    synchronize: false,
  };
}
