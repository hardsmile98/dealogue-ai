import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { errorDetail } from './common/errors.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';

const DEFAULT_CORS_ORIGIN = 'http://localhost:5173';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.enableCors({
    origin: (config.get<string>('CORS_ORIGIN') ?? DEFAULT_CORS_ORIGIN)
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

  // Одна форма ответа на ошибку: тело HttpException не меняем (веб читает
  // `message`), остальное — 500 со стеком в логе.
  app.useGlobalFilters(new AllExceptionsFilter());

  // SIGTERM/SIGINT → onModuleDestroy: сначала останавливаются поллеры и
  // приём событий агента, потом закрываются клиенты Telegram (без logout —
  // сессии остаются действительными) и пул базы.
  app.enableShutdownHooks();

  // Клиенты Telegram, поллеры и уборка стартуют после того, как порт занят
  // (common/lifecycle.ts → whenListening): экземпляр, которому порт не
  // достался, падает здесь, не тронув сессии Telegram и очередь заданий.
  await app.listen(config.get<string>('PORT') ?? 3000);
}

// Последний рубеж. Фоновые задачи ловят свои ошибки сами (runDetached), но
// если какая-то всё же ускользнёт, Node по умолчанию завершит процесс — и
// вместе с ним оборвёт все подключения Telegram. Такой случай — баг: пишем
// стек, чтобы его найти, и продолжаем работать.
process.on('unhandledRejection', (reason) => {
  new Logger('Process').error(
    `Необработанный отказ промиса: ${errorDetail(reason)}`,
  );
});

try {
  await bootstrap();
} catch (error) {
  // Порт занят, база недоступна, ошибка в .env — процесс не должен остаться
  // висеть наполовину поднятым (пул базы, таймеры): пишем причину и выходим.
  new Logger('Bootstrap').error(`API не запустился: ${errorDetail(error)}`);
  process.exit(1);
}
