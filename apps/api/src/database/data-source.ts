import 'dotenv/config';
import { DataSource } from 'typeorm';
import { buildTypeOrmOptions, readDatabaseConfigFromEnv } from './database.config.js';

/**
 * Точка входа для CLI TypeORM (`npm run migration:*`).
 * Приложение свой DataSource собирает в AppModule через ConfigService.
 */
export default new DataSource(buildTypeOrmOptions(readDatabaseConfigFromEnv()));
