/**
 * Secrets Initialization Module
 * Loads embedded secrets from the bundle into process.env
 * This must be imported at the very beginning of the CLI
 */

import { getProviderConfig } from './config/secrets-config'
import { SecretsManager } from './config/secrets-manager'

/**
 * Initialize embedded secrets synchronously
 * Loads all available embedded secrets and injects them into process.env
 */
export async function initializeEmbeddedSecrets(): Promise<void> {
  try {
    // Initialize the secrets manager
    await SecretsManager.initialize()

    // Get all available secrets (both embedded and user-provided)
    const availableSecrets = SecretsManager.listAvailableSecrets()

    // For each available secret, inject it into process.env if not already set
    for (const secretInfo of availableSecrets) {
      if (!secretInfo.hasEmbedded) {
        continue // Skip if no embedded version
      }

      // Get the provider configuration
      const config = getProviderConfig(secretInfo.provider)
      if (!config) {
        continue
      }

      // Try to get the secret value
      const secret = await SecretsManager.getSecret(secretInfo.provider)
      if (!secret || !secret.isEmbedded) {
        continue
      }

      // Inject into all possible environment variable names for this provider
      // This ensures compatibility with code expecting any of these env var names
      for (const envVar of config.environmentVars) {
        if (!process.env[envVar]) {
          process.env[envVar] = secret.value
        }
      }
    }
  } catch (error) {
    // Log error but don't fail - services will fail gracefully if they need keys
    if (process.env.DEBUG) {
      console.error('Failed to initialize embedded secrets:', error)
    }
  }
}

// Export a promise that resolves when secrets are initialized
export const secretsInitialized = initializeEmbeddedSecrets()
