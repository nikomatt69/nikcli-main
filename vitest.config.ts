import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 30000,
    root: '.',
    include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules', 'dist', '.next', 'build', 'coverage'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/cli/**/*.ts'],
      exclude: [
        'src/cli/**/*.{test,spec}.ts',
        'src/cli/**/types.ts',
        'src/cli/index.ts', // Will be refactored later
        'src/pages/**/*',
        'src/store/**/*',
        'src/stores/**/*',
        'src/types/**/*',
      ],
      thresholds: {
        global: {
          branches: 60, // Start lower, increase gradually
          functions: 60,
          lines: 60,
          statements: 60,
        },
      },
      reportOnFailure: true,
    },
    setupFiles: ['./tests/setup.ts'],
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@cli': resolve(__dirname, './src/cli'),
      '@agents': resolve(__dirname, './src/cli/automation/agents'),
      '@core': resolve(__dirname, './src/cli/core'),
      '@utils': resolve(__dirname, './src/cli/utils'),
      '@tools': resolve(__dirname, './src/cli/tools'),
      '@ai': resolve(__dirname, './src/cli/ai'),
      '@tests': resolve(__dirname, './tests'),
    },
  },
})
