#!/usr/bin/env node

/**
 * nikctl - CLI tool for managing nikCLI Background Agents
 * Provides commands to start, monitor, and manage background jobs
 */

import chalk from 'chalk'
import { Command } from 'commander'

// Background Agents
import { BackgroundAgentsCommand } from './commands/background-agents'

const program = new Command()

async function main() {
  program.name('nikctl').description('CLI tool for managing nikCLI Background Agents').version('1.1.0')

  // Add background agent commands
  BackgroundAgentsCommand.register(program)

  // Global options
  program
    .option('--api-url <url>', 'API server URL', 'http://localhost:3000')
    .option('--debug', 'Enable debug logging')
    .option('--json', 'Output in JSON format')

  // Parse and execute
  await program.parseAsync(process.argv)
}

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled Rejection:'), reason)
  process.exit(1)
})

process.on('uncaughtException', (error) => {
  console.error(chalk.red('Uncaught Exception:'), error)
  process.exit(1)
})

// Run CLI
if (require.main === module) {
  main().catch((error) => {
    console.error(chalk.red('CLI Error:'), error.message)
    process.exit(1)
  })
}

export { main }
