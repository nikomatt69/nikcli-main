#!/usr/bin/env node
// @ts-nocheck

// Minimal binary that delegates to the unified entrypoint
// Keep behavior centralized in src/cli/index.ts

import 'source-map-support/register'
import chalk from 'chalk'
import { main as startNikCLI } from '../src/cli/index'

process.title = process.title || 'nikcli'

process.on('unhandledRejection', (reason: any) => {
  // eslint-disable-next-line no-console
  console.error(chalk.red('Unhandled promise rejection in NikCLI:'), reason)
})

process.on('uncaughtException', (err: any) => {
  // eslint-disable-next-line no-console
  console.error(chalk.red('Uncaught exception in NikCLI:'), err)
})

const stop = () => {
  // Allow graceful exit hooks inside the app if needed in the future
  process.exit(0)
}

process.once('SIGINT', stop)
process.once('SIGTERM', stop)

  ; (async () => {
    try {
      await startNikCLI()
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(chalk.red('Failed to start NikCLI:'), error)
      process.exit(1)
    }
  })()
