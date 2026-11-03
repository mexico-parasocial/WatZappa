import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    ...(process.env.MATRIX_TEST_DATABASE_URL
      ? { testTimeout: 30000, hookTimeout: 30000, maxWorkers: 2 }
      : {}),
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
})
