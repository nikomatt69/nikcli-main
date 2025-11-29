// Cloud Integration Helper for NikCLI
// Manages connection to cloud services and fallback to local mode

import chalk from 'chalk'
import { BackgroundAgentsClient } from '../background-agents/client/api-client'
import { getAPIKeyManager } from '../core/api-key-manager'

export interface CloudStatus {
  connected: boolean
  services: {
    backgroundAgents: {
      available: boolean
      latency?: number
      url: string
    }
    github: {
      available: boolean
      url: string
    }
  }
  mode: 'cloud' | 'local' | 'hybrid'
}

/**
 * Cloud Integration Manager
 */
export class CloudIntegration {
  private bgClient: BackgroundAgentsClient
  private apiKeyManager = getAPIKeyManager()
  private cloudStatus?: CloudStatus
  private statusCheckedAt?: number
  private statusCacheTTL = 60000 // 1 minute

  constructor() {
    this.bgClient = new BackgroundAgentsClient()
  }

  /**
   * Check cloud services status (with caching)
   */
  async checkCloudStatus(forceRefresh = false): Promise<CloudStatus> {
    const now = Date.now()

    // Return cached status if available and fresh
    if (!forceRefresh && this.cloudStatus && this.statusCheckedAt && now - this.statusCheckedAt < this.statusCacheTTL) {
      return this.cloudStatus
    }

    // Check Background Agents API
    const bgTest = await this.bgClient.testConnection()

    // Check GitHub webhook (Vercel)
    let githubAvailable = false
    try {
      const response = await fetch('https://nikcli.vercel.app/api/health', {
        signal: AbortSignal.timeout(5000),
      })
      githubAvailable = response.ok
    } catch {
      githubAvailable = false
    }

    // Determine mode
    let mode: 'cloud' | 'local' | 'hybrid' = 'local'
    if (bgTest.connected && githubAvailable) {
      mode = 'cloud'
    } else if (bgTest.connected || githubAvailable) {
      mode = 'hybrid'
    }

    this.cloudStatus = {
      connected: bgTest.connected || githubAvailable,
      services: {
        backgroundAgents: {
          available: bgTest.connected,
          latency: bgTest.latency,
          url: this.bgClient['baseUrl'],
        },
        github: {
          available: githubAvailable,
          url: 'https://nikcli.vercel.app/api/github/webhook',
        },
      },
      mode,
    }

    this.statusCheckedAt = now

    return this.cloudStatus
  }

  /**
   * Initialize cloud integration and display status
   */
  async initialize(options: { silent?: boolean } = {}): Promise<CloudStatus> {
    const status = await this.checkCloudStatus(true)

    if (!options.silent) {
      this.printStatus(status)
    }

    return status
  }

  /**
   * Print cloud status to console
   */
  printStatus(status?: CloudStatus): void {
    const s = status || this.cloudStatus

    if (!s) {
      console.log(chalk.gray('⚠︎  Cloud status unknown'))
      return
    }

    console.log()
    console.log(chalk.bold('☁️  Cloud Services Status'))
    console.log()

    // Background Agents API
    if (s.services.backgroundAgents.available) {
      const latency = s.services.backgroundAgents.latency
      console.log(
        `✓ Background Agents API: ${chalk.green('Connected')} ${latency ? chalk.gray(`(${latency}ms)`) : ''}`
      )
    } else {
      console.log(`✖ Background Agents API: ${chalk.red('Unavailable')} ${chalk.gray('(using local mode)')}`)
    }

    // GitHub Integration
    if (s.services.github.available) {
      console.log(`✓ GitHub Webhooks: ${chalk.green('Connected')}`)
    } else {
      console.log(`✖ GitHub Webhooks: ${chalk.red('Unavailable')}`)
    }

    console.log()

    // Mode indicator
    const modeColors = {
      cloud: chalk.green,
      hybrid: chalk.yellow,
      local: chalk.gray,
    }

    const modeLabels = {
      cloud: '☁️  Full Cloud Mode',
      hybrid: '🔄 Hybrid Mode',
      local: '💻 Local Mode',
    }

    console.log(modeColors[s.mode](modeLabels[s.mode]))
    console.log()

    // API Keys status
    if (!this.apiKeyManager.isUsingOwnKeys()) {
      console.log(chalk.cyan('🔑 Using cloud-provided API keys (set NIKCLI_USE_OWN_KEYS=true to use your own)'))
    } else {
      console.log(chalk.cyan('🔑 Using your own API keys'))
    }

    console.log()
  }

  /**
   * Get background agents client
   */
  getBackgroundAgentsClient(): BackgroundAgentsClient {
    return this.bgClient
  }

  /**
   * Check if cloud services are available
   */
  isCloudAvailable(): boolean {
    return this.cloudStatus?.connected || false
  }

  /**
   * Get current cloud mode
   */
  getMode(): 'cloud' | 'local' | 'hybrid' {
    return this.cloudStatus?.mode || 'local'
  }

  /**
   * Force local mode (disable cloud services)
   */
  forceLocalMode(): void {
    console.log(chalk.yellow('⚠︎  Forcing local mode'))
    this.cloudStatus = {
      connected: false,
      services: {
        backgroundAgents: {
          available: false,
          url: '',
        },
        github: {
          available: false,
          url: '',
        },
      },
      mode: 'local',
    }
  }

  /**
   * Test cloud connection with detailed output
   */
  async testConnection(verbose = true): Promise<CloudStatus> {
    if (verbose) {
      console.log(chalk.bold('\n🔍 Testing cloud services...\n'))
    }

    const status = await this.checkCloudStatus(true)

    if (verbose) {
      // Background Agents API
      console.log(chalk.bold('Background Agents API:'))
      if (status.services.backgroundAgents.available) {
        console.log(`  ${chalk.green('✓ Connected')}`)
        console.log(`  ${chalk.gray(`Latency: ${status.services.backgroundAgents.latency}ms`)}`)
        console.log(`  ${chalk.gray(`URL: ${status.services.backgroundAgents.url}`)}`)

        // Test job creation
        try {
          const stats = await this.bgClient.getStats()
          console.log(`  ${chalk.gray(`Active jobs: ${stats.jobs.running}`)}`)
          console.log(`  ${chalk.gray(`Queue: ${stats.queue.pending} pending`)}`)
        } catch {
          console.log(`  ${chalk.yellow('⚠︎  Stats unavailable')}`)
        }
      } else {
        console.log(`  ${chalk.red('✖ Not available')}`)
      }

      console.log()

      // GitHub Webhooks
      console.log(chalk.bold('GitHub Webhooks:'))
      if (status.services.github.available) {
        console.log(`  ${chalk.green('✓ Connected')}`)
        console.log(`  ${chalk.gray(`URL: ${status.services.github.url}`)}`)
      } else {
        console.log(`  ${chalk.red('✖ Not available')}`)
      }

      console.log()

      // Overall status
      if (status.mode === 'cloud') {
        console.log(chalk.green('✓ All cloud services operational'))
      } else if (status.mode === 'hybrid') {
        console.log(chalk.yellow('⚠︎  Some cloud services unavailable'))
      } else {
        console.log(chalk.gray('ℹ️  Running in local mode'))
      }

      console.log()
    }

    return status
  }

  /**
   * Show cloud configuration help
   */
  showHelp(): void {
    console.log(chalk.bold('\n☁️  Cloud Configuration Help\n'))

    console.log(chalk.bold('Environment Variables:'))
    console.log()
    console.log('  NIKCLI_API_URL          - Override default cloud API URL')
    console.log('  NIKCLI_USE_OWN_KEYS     - Use your own AI provider keys')
    console.log('  NIKCLI_CLOUD_TOKEN      - Authentication token (optional)')
    console.log()

    console.log(chalk.bold('Commands:'))
    console.log()
    console.log('  nikcli cloud test       - Test cloud connection')
    console.log('  nikcli cloud status     - Show cloud status')
    console.log('  nikcli config status    - Show API key configuration')
    console.log('  nikcli config set-key   - Save API key to config')
    console.log()

    console.log(chalk.bold('Using Your Own API Keys:'))
    console.log()
    console.log('  1. Set environment variable:')
    console.log('     export NIKCLI_USE_OWN_KEYS=true')
    console.log()
    console.log('  2. Provide API keys:')
    console.log('     export ANTHROPIC_API_KEY=sk-ant-...')
    console.log('     export OPENAI_API_KEY=sk-...')
    console.log()
    console.log('  Or save to config:')
    console.log('     nikcli config set-key anthropic sk-ant-...')
    console.log()

    console.log(chalk.bold('Self-Hosting:'))
    console.log()
    console.log('  See CLOUD-SETUP.md for deployment instructions')
    console.log('  Deploy your own instance on Railway or Render')
    console.log()
  }
}

/**
 * Singleton instance
 */
let cloudIntegrationInstance: CloudIntegration | undefined

export function getCloudIntegration(): CloudIntegration {
  if (!cloudIntegrationInstance) {
    cloudIntegrationInstance = new CloudIntegration()
  }
  return cloudIntegrationInstance
}

export function resetCloudIntegration(): void {
  cloudIntegrationInstance = undefined
}
