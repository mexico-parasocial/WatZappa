import path from 'node:path'
import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    testTimeout: 60000,
    setupFiles: ['dotenv/config'],
    exclude: ['dist/**', 'node_modules/**'],
    globals: true,
  },
  resolve: {
    alias: {
      '@atproto/bsky': path.resolve(__dirname, './src/index.ts'),
    },
  },
})
