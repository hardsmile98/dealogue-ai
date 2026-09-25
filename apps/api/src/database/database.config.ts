import type { DataSourceOptions } from 'typeorm';
import { BotAccountSettingsEntity } from '../bot/entities/bot-account-settings.entity.js';
import { BotChatSaidEntity } from '../bot/entities/bot-chat-said.entity.js';
import { BotChatStateEntity } from '../bot/entities/bot-chat-state.entity.js';
import { BotClientFactEntity } from '../bot/entities/bot-client-fact.entity.js';
import { BotExampleEntity } from '../bot/entities/bot-example.entity.js';
import { BotJobEntity } from '../bot/entities/bot-job.entity.js';
import { BotLibraryItemEntity } from '../bot/entities/bot-library-item.entity.js';
import { BotPromptSnapshotEntity } from '../bot/entities/bot-prompt-snapshot.entity.js';
import { BotSandboxMessageEntity } from '../bot/entities/bot-sandbox-message.entity.js';
import { BotSandboxSessionEntity } from '../bot/entities/bot-sandbox-session.entity.js';
import { BotTurnEntity } from '../bot/entities/bot-turn.entity.js';
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
import { CreateAiAgent1700000000005 } from './migrations/1700000000005-CreateAiAgent.js';
import { AddFollowupNextAt1700000000006 } from './migrations/1700000000006-AddFollowupNextAt.js';
import { CreateAiFunnel1700000000007 } from './migrations/1700000000007-CreateAiFunnel.js';
import { AiChatStateHandledMessage1700000000008 } from './migrations/1700000000008-AiChatStateHandledMessage.js';
import { AiLearning1700000000009 } from './migrations/1700000000009-AiLearning.js';
import { DropNightWindow1700000000010 } from './migrations/1700000000010-DropNightWindow.js';
import { AiClientCard1700000000011 } from './migrations/1700000000011-AiClientCard.js';
import { DropGenderSource1700000000012 } from './migrations/1700000000012-DropGenderSource.js';
import { DropAiAgent1700000000013 } from './migrations/1700000000013-DropAiAgent.js';
import { AccountChatsPageIndex1700000000014 } from './migrations/1700000000014-AccountChatsPageIndex.js';
import { ChatMessagesPageIndex1700000000015 } from './migrations/1700000000015-ChatMessagesPageIndex.js';
import { DropChatsFirstMessageIndex1700000000016 } from './migrations/1700000000016-DropChatsFirstMessageIndex.js';
import { CreateBotTables1700000000017 } from './migrations/1700000000017-CreateBotTables.js';
import { CreateBotSandbox1700000000018 } from './migrations/1700000000018-CreateBotSandbox.js';
import { BotForeignKeyIndexes1700000000019 } from './migrations/1700000000019-BotForeignKeyIndexes.js';

export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  logging: boolean;
  /** Соединений в пуле. */
  poolSize: number;
  /**
   * Дольше этого Postgres прерывает запрос сам: зависший запрос не держит
   * соединение из пула вечно. 0 — без ограничения (так работают миграции).
   */
  statementTimeoutMs: number;
  /** Запросы дольше этого TypeORM пишет в лог как медленные. */
  slowQueryMs: number;
}

/** Источник переменных: ConfigService в приложении, process.env в CLI. */
export type EnvReader = (key: string) => string | undefined;

export function readDatabaseConfig(read: EnvReader): DatabaseConfig {
  return {
    host: read('DB_HOST') ?? 'localhost',
    port: readPositiveInt(read, 'DB_PORT', 5432),
    username: read('DB_USER') ?? 'dealogue',
    password: read('DB_PASSWORD') ?? 'dealogue',
    database: read('DB_NAME') ?? 'dealogue',
    logging: read('DB_LOGGING') === 'true',
    poolSize: readPositiveInt(read, 'DB_POOL_SIZE', 10),
    statementTimeoutMs: readPositiveInt(
      read,
      'DB_STATEMENT_TIMEOUT_MS',
      30_000,
    ),
    slowQueryMs: readPositiveInt(read, 'DB_SLOW_QUERY_MS', 1_000),
  };
}

export function readDatabaseConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseConfig {
  return readDatabaseConfig((key) => env[key]);
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
    applicationName: 'dealogue-api',
    poolSize: config.poolSize,
    // И на новое соединение, и на ожидание свободного в пуле: при исчерпанном
    // пуле запрос падает с понятной ошибкой, а не висит.
    connectTimeoutMS: 10_000,
    maxQueryExecutionTime: config.slowQueryMs,
    extra: {
      ...(config.statementTimeoutMs > 0
        ? { statement_timeout: config.statementTimeoutMs }
        : {}),
      // Транзакция, брошенная открытой, не держит блокировки дольше минуты.
      idle_in_transaction_session_timeout: 60_000,
      // Простаивающие соединения закрываются, оборванные TCP видны по keepalive.
      idleTimeoutMillis: 30_000,
      keepAlive: true,
    },
    entities: [
      UserEntity,
      TelegramAccountEntity,
      TelegramLoginAttemptEntity,
      TelegramChatEntity,
      TelegramMessageEntity,
      TelegramDialogStartEntity,
      BotAccountSettingsEntity,
      BotLibraryItemEntity,
      BotExampleEntity,
      BotChatStateEntity,
      BotClientFactEntity,
      BotChatSaidEntity,
      BotJobEntity,
      BotTurnEntity,
      BotPromptSnapshotEntity,
      BotSandboxSessionEntity,
      BotSandboxMessageEntity,
    ],
    migrations: [
      CreateUsersTable1700000000000,
      SeedDemoUser1700000000001,
      CreateTelegramTables1700000000002,
      CreateDialogStarts1700000000003,
      DropServiceChats1700000000004,
      CreateAiAgent1700000000005,
      AddFollowupNextAt1700000000006,
      CreateAiFunnel1700000000007,
      AiChatStateHandledMessage1700000000008,
      AiLearning1700000000009,
      DropNightWindow1700000000010,
      AiClientCard1700000000011,
      DropGenderSource1700000000012,
      DropAiAgent1700000000013,
      AccountChatsPageIndex1700000000014,
      ChatMessagesPageIndex1700000000015,
      DropChatsFirstMessageIndex1700000000016,
      CreateBotTables1700000000017,
      CreateBotSandbox1700000000018,
      BotForeignKeyIndexes1700000000019,
    ],
    // Схему меняем только миграциями.
    synchronize: false,
  };
}

function readPositiveInt(
  read: EnvReader,
  key: string,
  fallback: number,
): number {
  const raw = read(key);
  const value = raw === undefined || raw.trim() === '' ? NaN : Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
