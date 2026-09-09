import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

const DEFAULT_CORS_ORIGIN = 'http://localhost:5173';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? DEFAULT_CORS_ORIGIN)
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  });

  app.useGlobalPipes(
    new ValidationPipe({
      // Отсекаем лишние поля вместо того, чтобы молча их принимать.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // По одной ошибке на поле: иначе на пустое тело прилетает по три
      // сообщения на каждое (IsString + IsNotEmpty + MaxLength).
      stopAtFirstError: true,
    }),
  );

  // SIGTERM/SIGINT → onModuleDestroy: воркер ИИ дожидается заданий и возвращает
  // недоделанное в очередь, Telegram-клиенты закрываются штатно.
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3000);
}

await bootstrap();
