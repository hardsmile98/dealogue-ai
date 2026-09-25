import { defineConfig } from 'vitest/config';

// Тестируем чистые модули и сервисы, собранные руками на подделках: без
// Nest-контейнера, базы и сети (кроме локального HTTP-сервера в тесте клиента модели).
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
});
