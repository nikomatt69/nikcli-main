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
    exclude: ['node_modules', 'dist', '.next', 'build', 'coverage', 'benchmarks'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov', 'text-summary'],
      include: ['src/cli/**/*.ts'],
      exclude: [
        'src/cli/**/*.{test,spec}.ts',
        'src/cli/**/types.ts',
        'src/cli/**/types/*.ts',
        'src/cli/index.ts',
        'src/pages/**/*',
        'src/store/**/*',
        'src/stores/**/*',
        'src/types/**/*',
      ],
      thresholds: {
        global: {
          branches: 65,
          functions: 65,
          lines: 70,
          statements: 70,
        },
      },
      reportOnFailure: true,
      all: true,
    },
    setupFiles: ['./tests/setup.ts'],
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },
    // Improve test output
    reporters: ['verbose', 'html'],
    // Enable parallel execution
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        isolate: true,
      },
    },
    // Better error reporting
    onConsoleLog(log: string) {
      if (log.includes('WARN') || log.includes('ERROR')) {
        return false
      }
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
      '@benchmarks': resolve(__dirname, './benchmarks'),
    },
  },
})
