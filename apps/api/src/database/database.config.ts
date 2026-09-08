import type { DataSourceOptions } from 'typeorm';
import { TelegramAccountEntity } from '../telegram/entities/telegram-account.entity.js';
import { TelegramChatEntity } from '../telegram/entities/telegram-chat.entity.js';
import { TelegramDialogStartEntity } from '../telegram/entities/telegram-dialog-start.entity.js';
import { TelegramLoginAttemptEntity } from '../telegram/entities/telegram-login-attempt.entity.js';
import { TelegramMessageEntity } from '../telegram/entities/telegram-message.entity.js';
import { UserEntity } from '../users/user.entity.js';
import { CreateUsersTable1700000000000 } from './migrations/1700000000000-CreateUsersTable.js';
import { SeedDemoUser1700000000001 } from './migrations/1700000000001-SeedDemoUser.js';
import { CreateTelegramTables1700000000002 } from './migrations/1700000000002-CreateTelegramTables.js';
import { CreateDialogStarts1700000000003 } from './migrations/1700000000003-CreateDialogStarts.js';
import { DropServiceChats1700000000004 } from './migrations/1700000000004-DropServiceChats.js';

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
    entities: [
      UserEntity,
      TelegramAccountEntity,
      TelegramLoginAttemptEntity,
      TelegramChatEntity,
      TelegramMessageEntity,
      TelegramDialogStartEntity,
    ],
    migrations: [
      CreateUsersTable1700000000000,
      SeedDemoUser1700000000001,
      CreateTelegramTables1700000000002,
      CreateDialogStarts1700000000003,
      DropServiceChats1700000000004,
    ],
    // Схему меняем только миграциями.
    synchronize: false,
  };
}
