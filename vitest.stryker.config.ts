import { defineConfig } from 'vitest/config';

// Used only by Stryker mutation runs. Mirrors vitest.config.ts without coverage.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['reflect-metadata'],
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['node_modules/**', 'dist/**']
  }
});
