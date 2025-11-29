/**
 * Secrets Helper Utilities
 * Convenience functions for provider integration
 * Simplifies the API for getting secrets and managing quotas
 */

import { SecretsManager } from './secrets-manager'
import {
  getProviderConfig,
  getAllConfiguredProviders,
  getRequiredProviders,
  getOptionalProviders,
} from './secrets-config'

/**
 * Provider secret resolver
 * Safely gets a secret and provides context about usage
 */
export interface ResolvedSecret {
  value: string
  source: 'environment' | 'embedded'
  isEmbedded: boolean
  provider: string
}

/**
 * Get secret with error handling
 */
export async function resolveSecret(provider: string): Promise<ResolvedSecret> {
  const secret = await SecretsManager.getSecret(provider)

  if (!secret) {
    const config = getProviderConfig(provider)
    const envVars = config?.environmentVars || []
    throw new Error(
      `No API key configured for ${provider}. Set one of: ${envVars.join(', ')}`
    )
  }

  return {
    value: secret.value,
    source: secret.source as 'environment' | 'embedded',
    isEmbedded: secret.isEmbedded,
    provider,
  }
}

/**
 * Safe API call wrapper with quota checking
 */
export async function executeWithQuotaCheck<T>(
  provider: string,
  operation: () => Promise<T>,
  usageInfo?: { tokens?: number; cost?: number }
): Promise<T> {
  // Check quota before operation
  const quotaCheck = SecretsManager.checkQuota(provider)
  if (!quotaCheck.allowed) {
    throw new Error(`⚠︎  Quota limit exceeded: ${quotaCheck.reason}`)
  }

  try {
    const result = await operation()

    // Record successful usage
    if (usageInfo) {
      SecretsManager.recordUsage(provider, 'api_call', usageInfo)
    }

    return result
  } catch (error) {
    // Don't count failed calls against quota
    throw error
  }
}

/**
 * Get provider status info
 */
export interface ProviderStatus {
  provider: string
  available: boolean
  required: boolean
  hasUser: boolean
  hasEmbedded: boolean
  currentSource: 'environment' | 'embedded' | 'none'
  quota?: Record<string, any>
}

export function getProviderStatus(provider: string): ProviderStatus {
  const info = SecretsManager.getSecretInfo(provider)
  const config = getProviderConfig(provider)
  const isRequired = getRequiredProviders().includes(provider)

  return {
    provider,
    available: info.currentlyUsing !== 'none',
    required: isRequired,
    hasUser: info.hasUser,
    hasEmbedded: info.hasEmbedded,
    currentSource: info.currentlyUsing as 'environment' | 'embedded' | 'none',
    quota: info.quotaInfo,
  }
}

/**
 * Get status for all providers
 */
export function getAllProvidersStatus(): ProviderStatus[] {
  return getAllConfiguredProviders().map((provider) =>
    getProviderStatus(provider)
  )
}

/**
 * Check if provider can be used
 */
export function canUseProvider(provider: string): boolean {
  const status = getProviderStatus(provider)
  return status.available
}

/**
 * Get providers that are available
 */
export function getAvailableProviders(): string[] {
  return getAllConfiguredProviders().filter((provider) => canUseProvider(provider))
}

/**
 * Get providers that are required but not available
 */
export function getMissingRequiredProviders(): string[] {
  const required = getRequiredProviders()
  const available = getAvailableProviders()

  return required.filter((provider) => !available.includes(provider))
}

/**
 * Suggest which env vars to set for missing providers
 */
export function suggestMissingProviderSetup(): string[] {
  const missing = getMissingRequiredProviders()
  const suggestions: string[] = []

  for (const provider of missing) {
    const config = getProviderConfig(provider)
    if (config) {
      suggestions.push(
        `Set ${config.environmentVars[0]}=your-${provider}-key`
      )
    }
  }

  return suggestions
}

/**
 * Validate that all required providers are available
 */
export function validateRequiredProviders(): { valid: boolean; missing: string[] } {
  const missing = getMissingRequiredProviders()

  return {
    valid: missing.length === 0,
    missing,
  }
}

/**
 * Get quota usage summary
 */
export interface QuotaSummary {
  provider: string
  dailyUsage: number
  dailyLimit?: number
  monthlyUsage: number
  monthlyLimit?: number
  percentDaily: number
  percentMonthly: number
  warning: boolean
}

export function getQuotaSummary(provider: string): QuotaSummary | null {
  const info = SecretsManager.getSecretInfo(provider)

  if (!info.quotaInfo) {
    return null
  }

  const stats = info.quotaInfo

  return {
    provider,
    dailyUsage: stats.daily.requests.used,
    dailyLimit: stats.daily.requests.limit,
    monthlyUsage: stats.monthly.requests.used,
    monthlyLimit: stats.monthly.requests.limit,
    percentDaily: stats.daily.requests.percentage,
    percentMonthly: stats.monthly.requests.percentage,
    warning: stats.daily.requests.percentage > 80 || stats.monthly.requests.percentage > 80,
  }
}

/**
 * Format quota info for display
 */
export function formatQuotaInfo(provider: string): string {
  const summary = getQuotaSummary(provider)

  if (!summary) {
    return `${provider}: No quota tracking`
  }

  const dailyStr =
    summary.dailyLimit === undefined
      ? `${summary.dailyUsage} calls`
      : `${summary.dailyUsage}/${summary.dailyLimit} calls (${summary.percentDaily}%)`

  const monthlyStr =
    summary.monthlyLimit === undefined
      ? `${summary.monthlyUsage} calls`
      : `${summary.monthlyUsage}/${summary.monthlyLimit} calls (${summary.percentMonthly}%)`

  const warning = summary.warning ? ' ⚠︎ ' : ''

  return `${provider}: Daily: ${dailyStr}, Monthly: ${monthlyStr}${warning}`
}

/**
 * Get quota warnings
 */
export function getQuotaWarnings(): string[] {
  const warnings: string[] = []

  for (const provider of getAllConfiguredProviders()) {
    const summary = getQuotaSummary(provider)

    if (summary?.warning) {
      const message =
        summary.percentDaily > 80
          ? `${provider}: Daily quota at ${summary.percentDaily}%`
          : `${provider}: Monthly quota at ${summary.percentMonthly}%`

      warnings.push(message)
    }
  }

  return warnings
}
