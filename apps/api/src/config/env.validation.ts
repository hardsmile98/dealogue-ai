// @Type из class-transformer читает метаданные типов; в приложении их
// подключает Nest, здесь — явно, чтобы модуль работал и в тестах.
import 'reflect-metadata';
import { plainToInstance, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  Validate,
  validateSync,
} from 'class-validator';
import type {
  ValidatorConstraintInterface,
  ValidationError,
} from 'class-validator';
import { ValidatorConstraint } from 'class-validator';
import { isValidTimezone } from '../telegram/lib/timezone.js';

/** Длительность в формате jsonwebtoken (библиотека ms): `3600`, `15m`, `7d`, `2 days`. */
const JWT_DURATION =
  /^-?(?:\d+)?\.?\d+ *(?:milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i;

@ValidatorConstraint({ name: 'timezone' })
class TimezoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidTimezone(value);
  }

  defaultMessage(): string {
    return 'ожидается IANA-зона, например Europe/Moscow';
  }
}

/** Целое число в диапазоне; пустая строка — «не задано», берётся значение по умолчанию. */
function OptionalInt(min: number, max = Number.MAX_SAFE_INTEGER) {
  return (target: object, key: string) => {
    IsOptional()(target, key);
    Type(() => Number)(target, key);
    IsInt({ message: 'ожидается целое число' })(target, key);
    Min(min, { message: `не меньше ${min}` })(target, key);
    Max(max, { message: `не больше ${max}` })(target, key);
  };
}

/** Число больше нуля (дробное допустимо — так его и читают конфиги разделов). */
function OptionalPositive() {
  return (target: object, key: string) => {
    IsOptional()(target, key);
    Type(() => Number)(target, key);
    Min(Number.MIN_VALUE, { message: 'ожидается число больше 0' })(target, key);
  };
}

/**
 * Переменные окружения, которые приложение читает через ConfigService.
 * Проверяются один раз при старте: опечатка в .env роняет запуск с понятным
 * списком ошибок, а не превращается в тихое значение по умолчанию или в 500
 * на первом запросе. Пустое значение (`KEY=`) — то же, что не задано.
 * Значения секретов в сообщения об ошибках не попадают — только имена.
 */
class EnvironmentVariables {
  @OptionalInt(1, 65_535)
  PORT?: number;

  @IsNotEmpty({ message: 'обязателен: им подписываются токены доступа' })
  @IsString()
  JWT_SECRET!: string;

  @Matches(JWT_DURATION, { message: 'ожидается длительность: 3600, 15m, 7d' })
  @IsOptional()
  JWT_EXPIRES_IN?: string;

  @OptionalInt(1, 65_535)
  DB_PORT?: number;

  @OptionalInt(1)
  DB_POOL_SIZE?: number;

  @OptionalInt(1)
  DB_STATEMENT_TIMEOUT_MS?: number;

  @OptionalInt(1)
  DB_SLOW_QUERY_MS?: number;

  @OptionalInt(1)
  TELEGRAM_API_ID?: number;

  @Validate(TimezoneConstraint)
  @IsOptional()
  TELEGRAM_TIMEZONE?: string;

  @OptionalPositive()
  TELEGRAM_SYNC_DIALOGS_LIMIT?: number;

  @OptionalPositive()
  TELEGRAM_SYNC_MESSAGES_LIMIT?: number;

  @OptionalPositive()
  TELEGRAM_RESYNC_INTERVAL_SEC?: number;

  @OptionalPositive()
  TELEGRAM_RESYNC_DIALOGS_LIMIT?: number;

  @OptionalPositive()
  TELEGRAM_LOGIN_ATTEMPT_TTL_SEC?: number;

  @Matches(/^\s*(none|error|warn|info|debug)\s*$/i, {
    message: 'ожидается none, error, warn, info или debug',
  })
  @IsOptional()
  TELEGRAM_CLIENT_LOG_LEVEL?: string;

  @IsUrl(
    { require_tld: false, require_protocol: true },
    { message: 'ожидается адрес вида https://api.deepseek.com' },
  )
  @IsOptional()
  DEEPSEEK_BASE_URL?: string;

  @OptionalPositive()
  BOT_LLM_TIMEOUT_MS?: number;

  /** 0 — поллер лестницы выключен. */
  @Min(0, { message: 'не меньше 0' })
  @Type(() => Number)
  @IsOptional()
  BOT_SCHEDULER_POLL_MS?: number;
}

/**
 * `validate` для ConfigModule. Возвращает конфигурацию как есть (строки):
 * разделы читают и приводят значения сами, здесь — только проверка.
 */
export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const present = Object.fromEntries(
    Object.entries(config).filter(
      ([, value]) => !(typeof value === 'string' && value.trim() === ''),
    ),
  );
  const errors = validateSync(plainToInstance(EnvironmentVariables, present));
  if (errors.length > 0) {
    throw new Error(
      `Некорректные переменные окружения (.env):\n${errors.map(describe).join('\n')}`,
    );
  }
  return config;
}

function describe(error: ValidationError): string {
  const reasons = Object.values(error.constraints ?? {});
  return `  ${error.property}: ${reasons.join('; ')}`;
}
