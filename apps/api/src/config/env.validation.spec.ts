import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation.js';

const base = { JWT_SECRET: 'secret' };

describe('validateEnv', () => {
  it('минимальный набор: только JWT_SECRET', () => {
    expect(validateEnv(base)).toEqual(base);
  });

  it('возвращает конфигурацию как есть — строки не превращаются в числа', () => {
    const env = { ...base, PORT: '3100', DB_POOL_SIZE: '10' };
    expect(validateEnv(env)).toBe(env);
    expect(env.PORT).toBe('3100');
  });

  it('пустое значение — то же, что не задано', () => {
    const env = {
      ...base,
      TELEGRAM_API_ID: '',
      TELEGRAM_API_HASH: '',
      DB_POOL_SIZE: '',
      BOT_SCHEDULER_POLL_MS: ' ',
    };
    expect(() => validateEnv(env)).not.toThrow();
  });

  it('значения из .env.example проходят', () => {
    expect(() =>
      validateEnv({
        ...base,
        PORT: '3000',
        CORS_ORIGIN: 'http://localhost:5173',
        DB_PORT: '5432',
        DB_LOGGING: 'false',
        DB_POOL_SIZE: '10',
        DB_STATEMENT_TIMEOUT_MS: '30000',
        DB_SLOW_QUERY_MS: '1000',
        JWT_EXPIRES_IN: '7d',
        TELEGRAM_API_ID: '123456',
        TELEGRAM_TIMEZONE: 'Europe/Moscow',
        TELEGRAM_SYNC_DIALOGS_LIMIT: '300',
        TELEGRAM_SYNC_MESSAGES_LIMIT: '100',
        TELEGRAM_RESYNC_INTERVAL_SEC: '120',
        TELEGRAM_RESYNC_DIALOGS_LIMIT: '40',
        TELEGRAM_LOGIN_ATTEMPT_TTL_SEC: '600',
        TELEGRAM_CLIENT_LOG_LEVEL: 'warn',
        DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
        BOT_LLM_MODEL: 'deepseek-chat',
        BOT_LLM_TIMEOUT_MS: '30000',
        BOT_SCHEDULER_POLL_MS: '0',
      }),
    ).not.toThrow();
  });

  it('без JWT_SECRET не стартуем', () => {
    expect(() => validateEnv({ JWT_SECRET: '' })).toThrow(/JWT_SECRET/);
  });

  it('перечисляет все ошибки разом, без значений', () => {
    let message = '';
    try {
      validateEnv({
        ...base,
        PORT: 'abc',
        DB_POOL_SIZE: '1.5',
        TELEGRAM_TIMEZONE: 'Mars/Base',
        TELEGRAM_CLIENT_LOG_LEVEL: 'loud',
        JWT_EXPIRES_IN: 'forever',
        BOT_SCHEDULER_POLL_MS: '-5',
      });
    } catch (error) {
      message = (error as Error).message;
    }
    for (const key of [
      'PORT',
      'DB_POOL_SIZE',
      'TELEGRAM_TIMEZONE',
      'TELEGRAM_CLIENT_LOG_LEVEL',
      'JWT_EXPIRES_IN',
      'BOT_SCHEDULER_POLL_MS',
    ]) {
      expect(message).toContain(key);
    }
    expect(message).not.toContain('Mars/Base');
    expect(message).not.toContain('forever');
  });

  it('длительности в стиле jsonwebtoken', () => {
    for (const value of ['3600', '15m', '7d', '2 days', '1h']) {
      expect(() =>
        validateEnv({ ...base, JWT_EXPIRES_IN: value }),
      ).not.toThrow();
    }
  });
});
