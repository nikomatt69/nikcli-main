#!/usr/bin/env node

/**
 * nikd - Background Agent Runner Daemon
 * Executes background jobs using nikCLI in isolated environments
 */

import chalk from 'chalk'
import { Command } from 'commander'
import { BackgroundAgentsAPIServer, defaultAPIConfig } from './background-agents/api/server'
import { advancedUI } from './ui/advanced-cli-ui'

const program = new Command()

interface NikdOptions {
  port?: number
  redis?: string
  github?: {
    appId: string
    privateKey: string
    installationId: string
    webhookSecret: string
  }
  maxConcurrent?: number
  workspace?: string
}

async function startDaemon(options: NikdOptions) {
  advancedUI.logFunctionCall('nikdstart')
  advancedUI.logFunctionUpdate('info', 'Starting nikd (Background Agent Runner)...', 'ℹ')

  try {
    // Parse Redis URL if provided
    let redisConfig
    if (options.redis) {
      const url = new URL(options.redis)
      redisConfig = {
        host: url.hostname,
        port: parseInt(url.port, 10) || 6379,
        password: url.password || undefined,
      }
    }

    // Configure API server
    const config = {
      ...defaultAPIConfig,
      port: options.port || 3000,
      github: options.github,
      queue: {
        type: options.redis ? ('redis' as const) : ('local' as const),
        redis: redisConfig,
      },
    }

    // Initialize API server
    const server = new BackgroundAgentsAPIServer(config)

    // Start API server
    await server.start()

    console.log(chalk.green('✓ nikd daemon started successfully'))
    console.log(chalk.blue(`📡 API: http://localhost:${config.port}`))
    console.log(chalk.blue(`📊 Health: http://localhost:${config.port}/health`))

    if (options.redis) {
      console.log(chalk.blue(`🔴 Redis: ${options.redis}`))
    }

    if (options.github) {
      console.log(chalk.blue(`🐙 GitHub App: ${options.github.appId}`))
    }

    console.log(chalk.gray('\nPress Ctrl+C to stop the daemon'))

    // Graceful shutdown
    const cleanup = async () => {
      console.log(chalk.yellow('\n Shutting down nikd daemon...'))

      try {
        await server.stop()
        console.log(chalk.green('✓ nikd daemon stopped gracefully'))
        process.exit(0)
      } catch (error) {
        console.error(chalk.red('✖ Error during shutdown:'), error)
        process.exit(1)
      }
    }

    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)
  } catch (error: any) {
    console.error(chalk.red('✖ Failed to start nikd daemon:'), error.message)
    process.exit(1)
  }
}

async function main() {
  program.name('nikd').description('Background Agent Runner Daemon for nikCLI').version('1.4.0')

  program
    .command('start')
    .description('Start the background agent daemon')
    .option('-p, --port <port>', 'API server port', '3000')
    .option('--redis <url>', 'Redis connection URL (redis://localhost:6379)')
    .option('--max-concurrent <count>', 'Maximum concurrent jobs', '3')
    .option('--workspace <path>', 'Workspace directory', process.cwd())
    .option('--github-app-id <id>', 'GitHub App ID')
    .option('--github-private-key <path>', 'Path to GitHub App private key')
    .option('--github-installation-id <id>', 'GitHub App installation ID')
    .option('--github-webhook-secret <secret>', 'GitHub webhook secret')
    .action(async (options) => {
      // Parse GitHub configuration
      let githubConfig
      if (options.githubAppId && options.githubPrivateKey && options.githubInstallationId) {
        const fs = await import('node:fs/promises')
        try {
          const privateKey = await fs.readFile(options.githubPrivateKey, 'utf8')
          githubConfig = {
            appId: options.githubAppId,
            privateKey,
            installationId: options.githubInstallationId,
            webhookSecret: options.githubWebhookSecret || '',
          }
        } catch (error) {
          console.error(chalk.red('✖ Failed to read GitHub private key:'), error)
          process.exit(1)
        }
      }

      await startDaemon({
        port: parseInt(options.port, 10),
        redis: options.redis,
        maxConcurrent: parseInt(options.maxConcurrent, 10),
        workspace: options.workspace,
        github: githubConfig,
      })
    })

  program
    .command('status')
    .description('Check daemon status')
    .option('--api-url <url>', 'API server URL', 'http://localhost:3000')
    .action(async (options) => {
      try {
        const response = await fetch(`${options.apiUrl}/health`)
        const data = await response.json()

        console.log(chalk.green('✓ nikd daemon is running'))
        console.log(chalk.blue(`📡 API: ${options.apiUrl}`))
        console.log(chalk.blue(`⏱️  Uptime: ${Math.round(data.uptime)}s`))
        console.log(chalk.blue(`🕒 Last check: ${data.timestamp}`))
      } catch (_error) {
        console.log(chalk.red('✖ nikd daemon is not running'))
        console.log(chalk.gray(`   Could not connect to ${options.apiUrl}`))
        process.exit(1)
      }
    })

  program
    .command('logs')
    .description('Stream daemon logs')
    .option('--api-url <url>', 'API server URL', 'http://localhost:3000')
    .action(async (options) => {
      console.log(chalk.blue(`📡 Connecting to ${options.apiUrl}...`))
      console.log(chalk.gray('Note: Real-time logs would require additional implementation'))
      console.log(chalk.gray('For now, check the daemon console output'))
    })

  await program.parseAsync(process.argv)
}

// Error handling
process.on('unhandledRejection', (reason, _promise) => {
  console.error(chalk.red('Unhandled Rejection:'), reason)
  process.exit(1)
})

process.on('uncaughtException', (error) => {
  console.error(chalk.red('Uncaught Exception:'), error)
  process.exit(1)
})

// Run daemon CLI
if (require.main === module) {
  main().catch((error) => {
    console.error(chalk.red('nikd Error:'), error.message)
    process.exit(1)
  })
}

export { main, startDaemon }
