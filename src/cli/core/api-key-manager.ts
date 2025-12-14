// API Key Manager - Hierarchical key resolution
// Priority: User local env > User config > Cloud service (with user's keys)

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import chalk from 'chalk'

export type AIProvider =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'mistral'
  | 'perplexity'
  | 'openrouter'
  | 'xai'
  | 'opencode'
  | 'ollama'
  | 'azure'

export interface APIKeyConfig {
  provider: AIProvider
  apiKey?: string
  endpoint?: string
  useCloudService?: boolean
}

export interface CloudServiceConfig {
  enabled: boolean
  baseUrl: string
  authToken?: string
}

/**
 * Manages API keys with hierarchical resolution
 * 1. User's local environment variables (highest priority)
 * 2. User's config file (~/.nikcli/config.json)
 * 3. Cloud service (uses your API keys server-side)
 */
export class APIKeyManager {
  private userConfigPath: string
  private userConfig: Record<string, string> = {}
  private cloudConfig: CloudServiceConfig

  constructor(cloudConfig?: CloudServiceConfig) {
    this.userConfigPath = path.join(os.homedir(), '.nikcli', 'config.json')
    this.cloudConfig = cloudConfig || {
      enabled: false,
      baseUrl: process.env.NIKCLI_API_URL || 'https://nikcli-api.railway.app',
    }

    this.loadUserConfig()
  }

  /**
   * Load user's config file if exists
   */
  private loadUserConfig(): void {
    try {
      if (fs.existsSync(this.userConfigPath)) {
        const content = fs.readFileSync(this.userConfigPath, 'utf-8')
        const config = JSON.parse(content)
        this.userConfig = config.apiKeys || {}
      }
    } catch (error) {
      console.warn(chalk.yellow('⚠︎  Could not load user config, using defaults'))
    }
  }

  /**
   * Save API key to user config
   */
  async saveAPIKey(provider: AIProvider, apiKey: string): Promise<void> {
    try {
      const configDir = path.dirname(this.userConfigPath)

      // Create directory if doesn't exist
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }

      // Load existing config
      let config: any = {}
      if (fs.existsSync(this.userConfigPath)) {
        const content = fs.readFileSync(this.userConfigPath, 'utf-8')
        config = JSON.parse(content)
      }

      // Update API keys
      config.apiKeys = config.apiKeys || {}
      config.apiKeys[provider] = apiKey

      // Save
      fs.writeFileSync(this.userConfigPath, JSON.stringify(config, null, 2))

      this.userConfig[provider] = apiKey

      console.log(chalk.green(`✓ Saved ${provider} API key to config`))
    } catch (error) {
      console.error(chalk.red(`✖ Failed to save API key: ${error instanceof Error ? error.message : 'Unknown error'}`))
    }
  }

  /**
   * Get API key with hierarchical resolution
   */
  getAPIKey(provider: AIProvider): string | undefined {
    // 1. Check local environment variables (highest priority)
    const envKey = this.getEnvKey(provider)
    if (envKey) {
      return envKey
    }

    // 2. Check user's config file
    const configKey = this.userConfig[provider]
    if (configKey) {
      return configKey
    }

    // 3. No server-provided keys. User must supply their own.

    return undefined
  }

  /**
   * Get API key from environment variables
   */
  private getEnvKey(provider: AIProvider): string | undefined {
    const envVarNames: Record<AIProvider, string[]> = {
      anthropic: ['ANTHROPIC_API_KEY'],
      openai: ['OPENAI_API_KEY'],
      google: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_API_KEY'],
      mistral: ['MISTRAL_API_KEY'],
      perplexity: ['PERPLEXITY_API_KEY'],
      openrouter: ['OPENROUTER_API_KEY'],
      xai: ['XAI_API_KEY'],
      opencode: ['OPENCODE_API_KEY', 'OPENAI_COMPATIBLE_API_KEY'],
      ollama: ['OLLAMA_API_KEY'],
      azure: ['AZURE_OPENAI_API_KEY'],
    }

    const names = envVarNames[provider] || []

    for (const name of names) {
      const value = process.env[name]
      if (value) {
        return value
      }
    }

    return undefined
  }

  /**
   * Check if user wants to use their own keys
   */
  isUsingOwnKeys(): boolean {
    return process.env.NIKCLI_USE_OWN_KEYS === 'true' || process.env.NIKCLI_USE_OWN_KEYS === '1'
  }

  /**
   * Check if API key is available for provider
   */
  hasAPIKey(provider: AIProvider): boolean {
    return !!this.getAPIKey(provider)
  }

  /**
   * Get all configured providers
   */
  getConfiguredProviders(): AIProvider[] {
    const providers: AIProvider[] = [
      'anthropic',
      'openai',
      'google',
      'mistral',
      'perplexity',
      'openrouter',
      'xai',
      'opencode',
      'ollama',
      'azure',
    ]

    return providers.filter((provider) => this.hasAPIKey(provider))
  }

  /**
   * Check if cloud service is available
   */
  async isCloudServiceAvailable(): Promise<boolean> {
    if (!this.cloudConfig.enabled) {
      return false
    }

    try {
      const response = await fetch(`${this.cloudConfig.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      })

      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Get API key source for debugging
   */
  getAPIKeySource(provider: AIProvider): 'env' | 'config' | 'cloud' | 'none' {
    if (this.getEnvKey(provider)) {
      return 'env'
    }

    if (this.userConfig[provider]) {
      return 'config'
    }

    // No cloud fallback

    return 'none'
  }

  /**
   * Print configuration status
   */
  printStatus(): void {
    console.log(chalk.bold('\n🔑 API Key Configuration Status\n'))

    const providers: AIProvider[] = ['anthropic', 'openai', 'google', 'mistral', 'perplexity', 'openrouter', 'xai', 'opencode']

    for (const provider of providers) {
      const source = this.getAPIKeySource(provider)
      const icon = source !== 'none' ? '✓' : '✖'
      const sourceLabel = {
        env: chalk.blue('(local env)'),
        config: chalk.cyan('(config file)'),
        cloud: chalk.magenta('(cloud service)'),
        none: chalk.gray('(not configured)'),
      }[source]

      console.log(`${icon} ${chalk.bold(provider.padEnd(12))} ${sourceLabel}`)
    }

    console.log()

    console.log(chalk.yellow('🔒 No server keys. Provide your own via env or nikcli config.'))

    console.log()
  }

  /**
   * Validate API key format (basic check)
   */
  validateAPIKey(provider: AIProvider, apiKey: string): boolean {
    if (!apiKey || apiKey.length < 10) {
      return false
    }

    // Provider-specific validation
    const patterns: Record<string, RegExp> = {
      anthropic: /^sk-ant-/,
      openai: /^sk-/,
      google: /^AIza/,
      perplexity: /^pplx-/,
      openrouter: /^sk-or-/,
      xai: /^xai-/,
    }

    const pattern = patterns[provider]
    if (pattern) {
      return pattern.test(apiKey)
    }

    // Generic validation for unknown providers
    return apiKey.length >= 20
  }

  /**
   * Remove API key from config
   */
  async removeAPIKey(provider: AIProvider): Promise<void> {
    try {
      if (!fs.existsSync(this.userConfigPath)) {
        console.log(chalk.yellow(`⚠︎  No config file found`))
        return
      }

      const content = fs.readFileSync(this.userConfigPath, 'utf-8')
      const config = JSON.parse(content)

      if (config.apiKeys && config.apiKeys[provider]) {
        delete config.apiKeys[provider]
        delete this.userConfig[provider]

        fs.writeFileSync(this.userConfigPath, JSON.stringify(config, null, 2))

        console.log(chalk.green(`✓ Removed ${provider} API key from config`))
      } else {
        console.log(chalk.yellow(`⚠︎  ${provider} API key not found in config`))
      }
    } catch (error) {
      console.error(
        chalk.red(`✖ Failed to remove API key: ${error instanceof Error ? error.message : 'Unknown error'}`)
      )
    }
  }

  /**
   * Get cloud service authentication token (for internal use)
   */
  getCloudAuthToken(): string | undefined {
    return this.cloudConfig.authToken || process.env.NIKCLI_CLOUD_TOKEN || process.env.NIKCLI_AUTH_TOKEN
  }

  /**
   * Enable/disable cloud service
   */
  setCloudServiceEnabled(enabled: boolean): void {
    this.cloudConfig.enabled = enabled
  }
}

/**
 * Create a singleton instance
 */
let apiKeyManagerInstance: APIKeyManager | undefined

export function getAPIKeyManager(): APIKeyManager {
  if (!apiKeyManagerInstance) {
    apiKeyManagerInstance = new APIKeyManager()
  }
  return apiKeyManagerInstance
}

export function resetAPIKeyManager(): void {
  apiKeyManagerInstance = undefined
}
