/**
 * Embedded Secrets Management System
 * Handles encryption/decryption of API keys embedded in the binary
 * Uses AES-256-GCM for secure encryption with hardware-based key derivation
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

interface SecretConfig {
  id: string
  envVarName: string
  encrypted: string
  iv: string
  authTag: string
  provider: string
  description: string
}

interface DecryptedSecret {
  value: string
  provider: string
  description: string
  envVarName: string
  isEmbedded: boolean
  quotaLimit?: number
  rateLimitPerMinute?: number
}

export class EmbeddedSecrets {
  private static readonly ALGORITHM = 'aes-256-gcm'
  private static readonly KEY_LENGTH = 32
  private static readonly IV_LENGTH = 16

  // Embedded secrets configuration - injected during build
  private static readonly EMBEDDED_CONFIGS: SecretConfig[] = []

  // Cache for decrypted secrets
  private static decryptionCache = new Map<string, string>()

  // Runtime hardware fingerprint (computed once)
  private static hardwareFingerprintCache: string | null = null

  /**
   * Initialize embedded secrets with hardware fingerprint (SYNCHRONOUS)
   * Should be called once at application startup before any services use secrets
   */
  static initializeSync(hardwareFingerprint?: string): void {
    if (hardwareFingerprint) {
      EmbeddedSecrets.hardwareFingerprintCache = hardwareFingerprint
    } else {
      const { getMachineFingerprintSync } = require('../utils/machine-fingerprint')
      EmbeddedSecrets.hardwareFingerprintCache = getMachineFingerprintSync()
    }

    // Warm up cache with precomputed secrets if needed
    if (process.env.PRELOAD_EMBEDDED_SECRETS === 'true') {
      for (const config of EmbeddedSecrets.EMBEDDED_CONFIGS) {
        try {
          EmbeddedSecrets.getSecretSync(config.id)
        } catch (error) {
          if (process.env.DEBUG) {
            console.warn(`Failed to preload secret ${config.id}:`, error)
          }
        }
      }
    }
  }

  /**
   * Initialize embedded secrets with hardware fingerprint (ASYNC)
   * Should be called once at application startup
   */
  static async initialize(hardwareFingerprint?: string): Promise<void> {
    if (hardwareFingerprint) {
      EmbeddedSecrets.hardwareFingerprintCache = hardwareFingerprint
    } else {
      const { getMachineFingerprint } = await import('../utils/machine-fingerprint')
      EmbeddedSecrets.hardwareFingerprintCache = await getMachineFingerprint()
    }

    // Warm up cache with precomputed secrets if needed
    if (process.env.PRELOAD_EMBEDDED_SECRETS === 'true') {
      for (const config of EmbeddedSecrets.EMBEDDED_CONFIGS) {
        try {
          await EmbeddedSecrets.getSecret(config.id)
        } catch (error) {
          if (process.env.DEBUG) {
            console.warn(`Failed to preload secret ${config.id}:`, error)
          }
        }
      }
    }
  }

  /**
   * Get decrypted secret value (SYNCHRONOUS - for early initialization)
   */
  static getSecretSync(secretId: string): DecryptedSecret | null {
    // Check cache first
    const cached = EmbeddedSecrets.decryptionCache.get(secretId)
    if (cached) {
      return JSON.parse(cached)
    }

    // Find configuration
    const config = EmbeddedSecrets.EMBEDDED_CONFIGS.find((c) => c.id === secretId)
    if (!config) {
      return null
    }

    try {
      const decrypted = EmbeddedSecrets.decryptSync(config)

      const result: DecryptedSecret = {
        value: decrypted.secret,
        provider: config.provider,
        description: config.description,
        envVarName: config.envVarName,
        isEmbedded: true,
        quotaLimit: decrypted.quotaLimit,
        rateLimitPerMinute: decrypted.rateLimitPerMinute,
      }

      // Cache for subsequent calls
      EmbeddedSecrets.decryptionCache.set(secretId, JSON.stringify(result))

      return result
    } catch (error) {
      if (process.env.DEBUG) {
        console.error(`Failed to decrypt secret ${secretId}:`, error instanceof Error ? error.message : String(error))
      }
      return null
    }
  }

  /**
   * Get decrypted secret value (ASYNC)
   */
  static async getSecret(secretId: string): Promise<DecryptedSecret | null> {
    return EmbeddedSecrets.getSecretSync(secretId)
  }

  /**
   * List available embedded secrets (without exposing values)
   */
  static listAvailable(): Array<{ id: string; envVarName: string; provider: string; description: string }> {
    return EmbeddedSecrets.EMBEDDED_CONFIGS.map(({ id, envVarName, provider, description }) => ({
      id,
      envVarName,
      provider,
      description,
    }))
  }

  /**
   * Check if a secret is available
   */
  static hasSecret(secretId: string): boolean {
    return EmbeddedSecrets.EMBEDDED_CONFIGS.some((c) => c.id === secretId)
  }

  /**
   * Internal: Decrypt secret using hardware fingerprint (SYNCHRONOUS)
   */
  private static decryptSync(config: SecretConfig): {
    secret: string
    quotaLimit?: number
    rateLimitPerMinute?: number
  } {
    const fingerprint = EmbeddedSecrets.hardwareFingerprintCache
    if (!fingerprint) {
      throw new Error('Hardware fingerprint not initialized')
    }

    try {
      // Derive key from fingerprint + secret ID
      const keyDerivationMaterial = `${fingerprint}:${config.id}`
      const salt = Buffer.from(config.id.padEnd(16, '0').slice(0, 16))

      const key = scryptSync(keyDerivationMaterial, salt, EmbeddedSecrets.KEY_LENGTH, {
        N: 16384,
        r: 8,
        p: 1,
        maxmem: 32 * 1024 * 1024,
      })

      const iv = Buffer.from(config.iv, 'hex')
      const encrypted = Buffer.from(config.encrypted, 'hex')
      const authTag = Buffer.from(config.authTag, 'hex')

      const decipher = createDecipheriv(EmbeddedSecrets.ALGORITHM, key, iv)
      decipher.setAuthTag(authTag)

      let decrypted = decipher.update(encrypted, undefined, 'utf8')
      decrypted += decipher.final('utf8')

      // Parse decrypted JSON
      const payload = JSON.parse(decrypted)

      return payload
    } catch (error) {
      throw new Error(`Decryption failed for ${config.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Internal: Decrypt secret using hardware fingerprint (ASYNC)
   */
  private static async decrypt(
    config: SecretConfig
  ): Promise<{ secret: string; quotaLimit?: number; rateLimitPerMinute?: number }> {
    return EmbeddedSecrets.decryptSync(config)
  }

  /**
   * Build-time: Encrypt a secret
   * Called by build script, not at runtime
   */
  static encryptForBuild(
    secretId: string,
    secretValue: string,
    provider: string,
    description: string,
    fingerprint: string,
    envVarName: string,
    options: { quotaLimit?: number; rateLimitPerMinute?: number } = {}
  ): SecretConfig {
    // Derive key from fingerprint + secret ID
    const keyDerivationMaterial = `${fingerprint}:${secretId}`
    const salt = Buffer.from(secretId.padEnd(16, '0').slice(0, 16))

    const key = scryptSync(keyDerivationMaterial, salt, EmbeddedSecrets.KEY_LENGTH, {
      N: 16384,
      r: 8,
      p: 1,
      maxmem: 32 * 1024 * 1024,
    })

    const iv = randomBytes(EmbeddedSecrets.IV_LENGTH)

    // Payload to encrypt
    const payload = JSON.stringify({
      secret: secretValue,
      quotaLimit: options.quotaLimit,
      rateLimitPerMinute: options.rateLimitPerMinute,
      encryptedAt: new Date().toISOString(),
      version: '1',
    })

    const cipher = createCipheriv(EmbeddedSecrets.ALGORITHM, key, iv)
    let encrypted = cipher.update(payload, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    const authTag = cipher.getAuthTag()

    return {
      id: secretId,
      envVarName,
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      provider,
      description,
    }
  }

  /**
   * Inject embedded configs at build time
   * This is called by the build script
   */
  static injectConfigs(configs: SecretConfig[]): void {
    EmbeddedSecrets.EMBEDDED_CONFIGS.push(...configs)
  }

  /**
   * Clear cache (useful for testing)
   */
  static clearCache(): void {
    EmbeddedSecrets.decryptionCache.clear()
  }

  /**
   * Check if built with embedded secrets
   */
  static isBuiltWithSecrets(): boolean {
    return EmbeddedSecrets.EMBEDDED_CONFIGS.length > 0
  }
}
