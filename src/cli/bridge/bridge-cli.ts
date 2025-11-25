#!/usr/bin/env node
// src/cli/bridge/bridge-cli.ts
// CLI command to start workspace bridge

import { WorkspaceBridge } from './workspace-bridge'
import { simpleConfigManager } from '../core/config-manager'
import chalk from 'chalk'
import ora from 'ora'
import { nanoid } from 'nanoid'

interface BridgeStartOptions {
  cloudUrl?: string
  workspacePath?: string
  token?: string
  workspaceId?: string
}

/**
 * Start workspace bridge
 */
export async function startBridge(options: BridgeStartOptions = {}): Promise<void> {
  console.log(chalk.cyan.bold('\n🔗 NikCLI Workspace Bridge\n'))

  // Get configuration
  const cloudUrl =
    options.cloudUrl ||
    process.env.NIKCLI_CLOUD_URL ||
    'https://api.nikcli.com'

  const workspacePath = options.workspacePath || process.cwd()

  let accessToken = options.token || process.env.NIKCLI_BRIDGE_TOKEN
  let workspaceId = options.workspaceId || process.env.NIKCLI_WORKSPACE_ID

  // Generate workspace ID if not provided
  if (!workspaceId) {
    workspaceId = `workspace_${nanoid()}`
    console.log(chalk.yellow(`Generated workspace ID: ${workspaceId}`))
    console.log(chalk.dim('Set NIKCLI_WORKSPACE_ID to reuse this ID\n'))
  }

  // If no token, create anonymous session
  if (!accessToken) {
    console.log(chalk.yellow('No access token provided. Creating anonymous session...\n'))

    const spinner = ora('Authenticating...').start()

    try {
      // Call login API to get token
      const response = await fetch(`${cloudUrl}/api/mobile/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceInfo: {
            platform: process.platform,
            hostname: require('os').hostname(),
            version: '1.0.0',
          },
        }),
      })

      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.statusText}`)
      }

      const data = await response.json()
      accessToken = data.accessToken

      spinner.succeed('Authenticated successfully')
      console.log(chalk.green(`User ID: ${data.userId}`))
      console.log(chalk.dim('\nTo reuse this session, set NIKCLI_BRIDGE_TOKEN in your environment\n'))
    } catch (error) {
      spinner.fail('Authentication failed')
      console.error(chalk.red(error instanceof Error ? error.message : String(error)))
      process.exit(1)
    }
  }

  // Create bridge
  const bridge = new WorkspaceBridge({
    cloudUrl,
    accessToken,
    workspaceId,
    workspacePath,
  })

  // Setup event handlers
  bridge.on('connected', () => {
    console.log(chalk.green.bold('\n✓ Bridge Connected!\n'))
    console.log(chalk.cyan('Workspace Details:'))
    console.log(chalk.dim(`  Path:         ${workspacePath}`))
    console.log(chalk.dim(`  ID:           ${workspaceId}`))
    console.log(chalk.dim(`  Cloud URL:    ${cloudUrl}`))
    console.log(chalk.cyan('\n📱 Your workspace is now accessible from mobile!'))
    console.log(chalk.dim('Use this Workspace ID in the mobile app to connect.\n'))
    console.log(chalk.yellow('Press Ctrl+C to stop the bridge\n'))
  })

  bridge.on('disconnected', () => {
    console.log(chalk.yellow('\n⚠ Bridge disconnected. Attempting to reconnect...'))
  })

  bridge.on('error', (error: Error) => {
    console.error(chalk.red('\n✗ Bridge error:'), error.message)
  })

  // Handle shutdown gracefully
  process.on('SIGINT', async () => {
    console.log(chalk.yellow('\n\nShutting down bridge...'))
    bridge.disconnect()
    console.log(chalk.green('✓ Bridge stopped\n'))
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    bridge.disconnect()
    process.exit(0)
  })

  // Connect
  const spinner = ora('Connecting to cloud...').start()

  try {
    await bridge.connect()
    spinner.succeed('Connected to cloud')
  } catch (error) {
    spinner.fail('Connection failed')
    console.error(chalk.red(error instanceof Error ? error.message : String(error)))
    process.exit(1)
  }
}

/**
 * Display bridge status
 */
export async function bridgeStatus(): Promise<void> {
  console.log(chalk.cyan.bold('\n🔗 Bridge Status\n'))

  const cloudUrl = process.env.NIKCLI_CLOUD_URL || 'https://api.nikcli.com'
  const workspaceId = process.env.NIKCLI_WORKSPACE_ID

  console.log(chalk.dim(`Cloud URL:    ${cloudUrl}`))
  console.log(chalk.dim(`Workspace ID: ${workspaceId || 'Not set'}`))

  if (!workspaceId) {
    console.log(chalk.yellow('\n⚠ No workspace ID configured'))
    console.log(chalk.dim('Run "nikcli bridge start" to create a bridge\n'))
    return
  }

  // Check if bridge is running by checking cloud API
  try {
    const response = await fetch(`${cloudUrl}/api/mobile/health`, {
      method: 'GET',
    })

    if (response.ok) {
      console.log(chalk.green('\n✓ Cloud API is reachable'))
    } else {
      console.log(chalk.red('\n✗ Cloud API returned error'))
    }
  } catch (error) {
    console.log(chalk.red('\n✗ Cannot reach cloud API'))
    console.error(chalk.dim(error instanceof Error ? error.message : String(error)))
  }

  console.log()
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2)
  const command = args[0]

  if (command === 'start') {
    startBridge({
      cloudUrl: args.find(a => a.startsWith('--cloud-url='))?.split('=')[1],
      workspacePath: args.find(a => a.startsWith('--workspace='))?.split('=')[1],
      token: args.find(a => a.startsWith('--token='))?.split('=')[1],
      workspaceId: args.find(a => a.startsWith('--workspace-id='))?.split('=')[1],
    }).catch((error) => {
      console.error(chalk.red('Fatal error:'), error)
      process.exit(1)
    })
  } else if (command === 'status') {
    bridgeStatus().catch((error) => {
      console.error(chalk.red('Error:'), error)
      process.exit(1)
    })
  } else {
    console.log(chalk.cyan.bold('\n🔗 NikCLI Workspace Bridge\n'))
    console.log('Usage:')
    console.log('  nikcli bridge start [options]    Start workspace bridge')
    console.log('  nikcli bridge status             Show bridge status')
    console.log('\nOptions:')
    console.log('  --cloud-url=<url>                Cloud API URL')
    console.log('  --workspace=<path>               Workspace path (default: current directory)')
    console.log('  --token=<token>                  Access token')
    console.log('  --workspace-id=<id>              Workspace ID')
    console.log('\nEnvironment Variables:')
    console.log('  NIKCLI_CLOUD_URL                 Cloud API URL')
    console.log('  NIKCLI_BRIDGE_TOKEN              Access token')
    console.log('  NIKCLI_WORKSPACE_ID              Workspace ID')
    console.log()
  }
}
