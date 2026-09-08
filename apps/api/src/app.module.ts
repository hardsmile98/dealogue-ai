import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module.js';
import { buildTypeOrmOptions } from './database/database.config.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildTypeOrmOptions({
          host: config.get<string>('DB_HOST') ?? 'localhost',
          port: Number(config.get<string>('DB_PORT') ?? 5432),
          username: config.get<string>('DB_USER') ?? 'dealogue',
          password: config.get<string>('DB_PASSWORD') ?? 'dealogue',
          database: config.get<string>('DB_NAME') ?? 'dealogue',
          logging: config.get<string>('DB_LOGGING') === 'true',
        }),
    }),
    UsersModule,
    AuthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
