/**
 * Secrets Manager
 * Unified interface for managing API keys from multiple sources:
 * 1. User-provided environment variables (.env)
 * 2. Embedded secrets in binary (encrypted)
 * 3. Runtime configuration
 *
 * Uses centralized secrets config for consistent provider handling
 */

import { EmbeddedSecrets } from './embedded-secrets'
import { QuotaManager } from '../services/quota-manager'
import {
  getProviderConfig,
  getSecretId,
  getEnvironmentVarNames,
  getAllConfiguredProviders,
  getOptionalProviders,
  getRequiredProviders,
  type ProviderSecretConfig,
} from './secrets-config'

interface SecretSource {
  value: string
  source: 'environment' | 'embedded' | 'runtime'
  provider: string
  isEmbedded: boolean
  quotaLimit?: number
  rateLimitPerMinute?: number
}

export class SecretsManager {
  private static initialized = false
  private static machineFingerprint: string = ''
  private static secretCache = new Map<string, SecretSource>()

  /**
   * Initialize secrets manager
   * Must be called once at application startup
   */
  static async initialize(machineFingerprint?: string): Promise<void> {
    if (SecretsManager.initialized) {
      return
    }

    // Get machine fingerprint if not provided
    if (!machineFingerprint) {
      const { getMachineFingerprint } = await import('../utils/machine-fingerprint')
      machineFingerprint = await getMachineFingerprint()
    }

    SecretsManager.machineFingerprint = machineFingerprint

    // Initialize subsystems
    await EmbeddedSecrets.initialize(machineFingerprint)
    await QuotaManager.initialize(machineFingerprint)

    SecretsManager.initialized = true
  }

  /**
   * Get API key for a provider with priority:
   * 1. User-provided environment variable (highest priority)
   * 2. Embedded secret in binary
   * 3. Runtime configuration
   *
   * Uses centralized secrets config to find correct env var names
   */
  static async getSecret(
    provider: string,
    environmentVarName?: string
  ): Promise<{ value: string; source: 'environment' | 'embedded' | 'runtime'; isEmbedded: boolean } | null> {
    if (!SecretsManager.initialized) {
      console.warn('SecretsManager not initialized')
      return null
    }

    const normalizedProvider = provider.toLowerCase()
    const cacheKey = `${normalizedProvider}:${environmentVarName || 'default'}`

    // Check cache first
    if (SecretsManager.secretCache.has(cacheKey)) {
      const cached = SecretsManager.secretCache.get(cacheKey)!
      return {
        value: cached.value,
        source: cached.source,
        isEmbedded: cached.isEmbedded,
      }
    }

    // Get provider configuration
    const providerConfig = getProviderConfig(normalizedProvider)

    // 1. Check user-provided environment variables (multiple fallback options)
    const envVarNames = environmentVarName
      ? [environmentVarName]
      : providerConfig?.environmentVars || []

    for (const envVar of envVarNames) {
      const envValue = process.env[envVar]
      if (envValue) {
        const source: SecretSource = {
          value: envValue,
          source: 'environment',
          provider: normalizedProvider,
          isEmbedded: false,
        }
        SecretsManager.secretCache.set(cacheKey, source)
        return {
          value: envValue,
          source: 'environment',
          isEmbedded: false,
        }
      }
    }

    // 2. Check embedded secrets
    const secretId = getSecretId(normalizedProvider)
    if (secretId) {
      const embedded = await EmbeddedSecrets.getSecret(secretId)
      if (embedded) {
        const source: SecretSource = {
          value: embedded.value,
          source: 'embedded',
          provider: normalizedProvider,
          isEmbedded: true,
          quotaLimit: embedded.quotaLimit,
          rateLimitPerMinute: embedded.rateLimitPerMinute,
        }
        SecretsManager.secretCache.set(cacheKey, source)
        return {
          value: embedded.value,
          source: 'embedded',
          isEmbedded: true,
        }
      }
    }

    return null
  }

  /**
   * Check if quota allows operation
   */
  static checkQuota(provider: string): { allowed: boolean; reason?: string } {
    if (!SecretsManager.initialized) {
      return { allowed: true }
    }

    // Check if using embedded secret
    const cached = Array.from(SecretsManager.secretCache.values()).find((s) => s.provider === provider)
    if (cached?.isEmbedded) {
      return QuotaManager.checkQuota(provider)
    }

    // User's own key - no quota limits
    return { allowed: true }
  }

  /**
   * Record API usage
   */
  static recordUsage(
    provider: string,
    endpoint: string,
    options: { tokens?: number; cost?: number } = {}
  ): void {
    if (!SecretsManager.initialized) {
      return
    }

    // Only track embedded secrets
    const cached = Array.from(SecretsManager.secretCache.values()).find((s) => s.provider === provider)
    if (cached?.isEmbedded) {
      QuotaManager.recordUsage(provider, endpoint, options)
    }
  }

  /**
   * Get usage statistics
   */
  static getUsageStats(provider?: string): Record<string, any> {
    if (!SecretsManager.initialized) {
      return {}
    }

    return QuotaManager.getUsageStats(provider)
  }

  /**
   * List available secrets for all configured providers
   * Uses centralized secrets config
   */
  static listAvailableSecrets(): Array<{ id: string; provider: string; description: string; hasEmbedded: boolean; hasUser: boolean }> {
    if (!SecretsManager.initialized) {
      return []
    }

    const embedded = EmbeddedSecrets.listAvailable()
    const allProviders = getAllConfiguredProviders()

    return allProviders.map((provider) => {
      const config = getProviderConfig(provider)
      if (!config) {
        return {
          id: '',
          provider: '',
          description: '',
          hasEmbedded: false,
          hasUser: false,
        }
      }

      const embeddedSecret = embedded.find((e) => e.id === config.id)

      // Check all possible environment variable names
      let hasUser = false
      for (const envVar of config.environmentVars) {
        if (process.env[envVar]) {
          hasUser = true
          break
        }
      }

      return {
        id: config.id,
        provider: config.provider,
        description: config.description,
        hasEmbedded: !!embeddedSecret,
        hasUser,
      }
    })
  }

  /**
   * Get information about secret usage for a provider
   * Uses centralized secrets config to check all env var names
   */
  static getSecretInfo(provider: string): {
    provider: string
    hasEmbedded: boolean
    hasUser: boolean
    currentlyUsing: 'embedded' | 'user' | 'none'
    quotaInfo?: Record<string, any>
    config?: ProviderSecretConfig
  } {
    const normalizedProvider = provider.toLowerCase()
    const config = getProviderConfig(normalizedProvider)
    const secretId = getSecretId(normalizedProvider)

    const embedded = secretId ? EmbeddedSecrets.hasSecret(secretId) : false

    // Check all possible environment variable names
    let userKey: string | undefined
    if (config) {
      for (const envVar of config.environmentVars) {
        const val = process.env[envVar]
        if (val) {
          userKey = val
          break
        }
      }
    }

    let currentlyUsing: 'embedded' | 'user' | 'none' = 'none'
    if (userKey) {
      currentlyUsing = 'user'
    } else if (embedded) {
      currentlyUsing = 'embedded'
    }

    const info: any = {
      provider: normalizedProvider,
      hasEmbedded: embedded,
      hasUser: !!userKey,
      currentlyUsing,
      config,
    }

    if (currentlyUsing === 'embedded') {
      info.quotaInfo = QuotaManager.getUsageStats(normalizedProvider)
    }

    return info
  }

  /**
   * Check if built with embedded secrets
   */
  static hasEmbeddedSecrets(): boolean {
    return EmbeddedSecrets.isBuiltWithSecrets()
  }

  /**
   * Get machine fingerprint (for quota system)
   */
  static getMachineFingerprint(): string {
    return SecretsManager.machineFingerprint
  }

  /**
   * Clear cache (for testing)
   */
  static clearCache(): void {
    SecretsManager.secretCache.clear()
  }
}
