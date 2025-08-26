#!/usr/bin/env node

// Minimal binary that delegates to the unified entrypoint
// Keep behavior centralized in src/cli/index.ts

import chalk from 'chalk';
import { main as startNikCLI } from '../src/cli/index';

(async () => {
  try {
    await startNikCLI();
  } catch (error) {
    console.error(chalk.red('Failed to start NikCLI:'), error);
    process.exit(1);
  }
})();
