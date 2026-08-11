import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(dir, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['lib/**/__tests__/**/*.test.ts'],
    testTimeout: 20_000,
  },
})
