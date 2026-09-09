import { defineConfig } from 'vitest/config';

// Тестируем только чистые модули (без Nest DI и декораторов).
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
});
