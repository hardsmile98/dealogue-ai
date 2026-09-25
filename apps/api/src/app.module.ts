import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module.js';
import { BotModule } from './bot/bot.module.js';
import { validateEnv } from './config/env.validation.js';
import {
  buildTypeOrmOptions,
  readDatabaseConfig,
} from './database/database.config.js';
import { HealthModule } from './health/health.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { TelegramModule } from './telegram/telegram.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    // .env проверяется при старте: опечатка роняет запуск со списком ошибок.
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildTypeOrmOptions(
          readDatabaseConfig((key) => config.get<string>(key)),
        ),
    }),
    UsersModule,
    AuthModule,
    TelegramModule,
    BotModule,
    RealtimeModule,
    HealthModule,
  ],
})
export class AppModule {}
