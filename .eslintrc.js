module.exports = {
  parser: '@typescript-eslint/parser',
  extends: ['eslint:recommended', '@typescript-eslint/recommended'],
  plugins: ['@typescript-eslint'],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  env: {
    node: true,
    es2020: true,
  },
  rules: {
    // TypeScript specific rules
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    '@typescript-eslint/prefer-const': 'error',
    '@typescript-eslint/no-var-requires': 'off', // Allow for dynamic imports where needed

    // General code quality
    'no-console': 'off', // CLI tool needs console output
    'no-debugger': 'error',
    'no-duplicate-imports': 'error',
    'no-unreachable': 'error',
    'prefer-const': 'error',
    'no-var': 'error',

    // Best practices for CLI development
    'no-process-exit': 'off', // CLI tools need process.exit
    'no-async-promise-executor': 'error',
    'no-await-in-loop': 'warn',
    'prefer-promise-reject-errors': 'error',

    // Code style - Disabled in favor of Biome formatter
    // indent: ['error', 2], // Handled by Biome
    // quotes: ['error', 'single', { avoidEscape: true }], // Handled by Biome
    // semi: ['error', 'always'], // Handled by Biome (conflicts with semicolons: "asNeeded")
    // 'comma-dangle': ['error', 'always-multiline'], // Handled by Biome
  },
  overrides: [
    {
      files: ['**/*.test.ts', '**/*.spec.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
      },
    },
  ],
  ignorePatterns: ['dist/', 'node_modules/', '*.js', 'build/', '.next/', 'coverage/'],
}
