/**
 * Quota and Rate Limiting Manager
 * Tracks API usage per user (machine fingerprint)
 * Prevents abuse of embedded API keys
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

interface UsageRecord {
  timestamp: number
  provider: string
  endpoint: string
  tokens?: number
  cost?: number
}

interface QuotaData {
  fingerprint: string
  created: string
  lastUpdated: string
  dailyReset: string
  monthlyReset: string
  usage: UsageRecord[]
  quotaExceeded: {
    [provider: string]: boolean
  }
  dailyUsage: {
    [provider: string]: {
      count: number
      tokens: number
      cost: number
    }
  }
  monthlyUsage: {
    [provider: string]: {
      count: number
      tokens: number
      cost: number
    }
  }
}

interface QuotaLimit {
  provider: string
  dailyRequests?: number
  monthlyRequests?: number
  dailyTokens?: number
  monthlyTokens?: number
  dailyCost?: number
  monthlyCost?: number
  ratePerMinute?: number
}

const QUOTA_DATA_FILE = join(homedir(), '.nikcli', 'quota.json')
const DEFAULT_QUOTA_LIMITS: Record<string, QuotaLimit> = {
  openai: {
    provider: 'openai',
    dailyRequests: 100,
    monthlyRequests: 2000,
    dailyTokens: 100000,
    monthlyTokens: 1000000,
    dailyCost: 10,
    monthlyCost: 200,
    ratePerMinute: 20,
  },
  anthropic: {
    provider: 'anthropic',
    dailyRequests: 100,
    monthlyRequests: 2000,
    dailyTokens: 100000,
    monthlyTokens: 1000000,
    dailyCost: 10,
    monthlyCost: 200,
    ratePerMinute: 20,
  },
  openrouter: {
    provider: 'openrouter',
    dailyRequests: 100,
    monthlyRequests: 2000,
    dailyTokens: 100000,
    monthlyTokens: 1000000,
    dailyCost: 15,
    monthlyCost: 300,
    ratePerMinute: 20,
  },
  browserbase: {
    provider: 'browserbase',
    dailyRequests: 50,
    monthlyRequests: 1000,
    dailyCost: 5,
    monthlyCost: 100,
    ratePerMinute: 10,
  },
  default: {
    provider: 'default',
    dailyRequests: 100,
    monthlyRequests: 2000,
    ratePerMinute: 20,
  },
}

export class QuotaManager {
  private static quotaData: QuotaData | null = null
  private static quotaLimits: Record<string, QuotaLimit> = DEFAULT_QUOTA_LIMITS
  private static initialized = false
  private static lastMinuteRequests: Array<{ provider: string; timestamp: number }> = []

  /**
   * Initialize quota manager with fingerprint
   */
  static async initialize(fingerprint: string): Promise<void> {
    QuotaManager.quotaData = QuotaManager.loadOrCreateQuotaData(fingerprint)
    QuotaManager.initialized = true

    // Clean up old usage records (keep only 7 days)
    QuotaManager.cleanupOldRecords()

    // Check daily and monthly resets
    QuotaManager.checkResets()
  }

  /**
   * Record API usage
   */
  static recordUsage(
    provider: string,
    endpoint: string,
    options: { tokens?: number; cost?: number } = {}
  ): void {
    if (!QuotaManager.initialized) {
      console.warn('QuotaManager not initialized')
      return
    }

    if (!QuotaManager.quotaData) {
      return
    }

    const now = Date.now()

    // Record usage
    QuotaManager.quotaData.usage.push({
      timestamp: now,
      provider,
      endpoint,
      tokens: options.tokens,
      cost: options.cost,
    })

    // Update daily usage
    if (!QuotaManager.quotaData.dailyUsage[provider]) {
      QuotaManager.quotaData.dailyUsage[provider] = { count: 0, tokens: 0, cost: 0 }
    }
    QuotaManager.quotaData.dailyUsage[provider].count++
    if (options.tokens) {
      QuotaManager.quotaData.dailyUsage[provider].tokens += options.tokens
    }
    if (options.cost) {
      QuotaManager.quotaData.dailyUsage[provider].cost += options.cost
    }

    // Update monthly usage
    if (!QuotaManager.quotaData.monthlyUsage[provider]) {
      QuotaManager.quotaData.monthlyUsage[provider] = { count: 0, tokens: 0, cost: 0 }
    }
    QuotaManager.quotaData.monthlyUsage[provider].count++
    if (options.tokens) {
      QuotaManager.quotaData.monthlyUsage[provider].tokens += options.tokens
    }
    if (options.cost) {
      QuotaManager.quotaData.monthlyUsage[provider].cost += options.cost
    }

    // Add to rate limit window
    QuotaManager.lastMinuteRequests.push({ provider, timestamp: now })

    // Save changes
    QuotaManager.quotaData.lastUpdated = new Date().toISOString()
    QuotaManager.saveQuotaData()
  }

  /**
   * Check if quota is exceeded
   */
  static checkQuota(provider: string): { allowed: boolean; reason?: string } {
    if (!QuotaManager.initialized || !QuotaManager.quotaData) {
      return { allowed: true } // Allow if not initialized
    }

    const limits = QuotaManager.quotaLimits[provider] || QuotaManager.quotaLimits.default
    const dailyUsage = QuotaManager.quotaData.dailyUsage[provider]
    const monthlyUsage = QuotaManager.quotaData.monthlyUsage[provider]

    // Check daily limits
    if (dailyUsage && limits.dailyRequests && dailyUsage.count >= limits.dailyRequests) {
      return { allowed: false, reason: `Daily request limit (${limits.dailyRequests}) exceeded for ${provider}` }
    }

    if (dailyUsage && limits.dailyTokens && dailyUsage.tokens >= limits.dailyTokens) {
      return { allowed: false, reason: `Daily token limit (${limits.dailyTokens}) exceeded for ${provider}` }
    }

    if (dailyUsage && limits.dailyCost && dailyUsage.cost >= limits.dailyCost) {
      return { allowed: false, reason: `Daily cost limit ($${limits.dailyCost}) exceeded for ${provider}` }
    }

    // Check monthly limits
    if (monthlyUsage && limits.monthlyRequests && monthlyUsage.count >= limits.monthlyRequests) {
      return { allowed: false, reason: `Monthly request limit (${limits.monthlyRequests}) exceeded for ${provider}` }
    }

    if (monthlyUsage && limits.monthlyTokens && monthlyUsage.tokens >= limits.monthlyTokens) {
      return { allowed: false, reason: `Monthly token limit (${limits.monthlyTokens}) exceeded for ${provider}` }
    }

    if (monthlyUsage && limits.monthlyCost && monthlyUsage.cost >= limits.monthlyCost) {
      return { allowed: false, reason: `Monthly cost limit ($${limits.monthlyCost}) exceeded for ${provider}` }
    }

    // Check rate limiting
    if (limits.ratePerMinute) {
      const oneMinuteAgo = Date.now() - 60 * 1000
      const recentRequests = QuotaManager.lastMinuteRequests.filter(
        (r) => r.provider === provider && r.timestamp > oneMinuteAgo
      )

      if (recentRequests.length >= limits.ratePerMinute) {
        return { allowed: false, reason: `Rate limit (${limits.ratePerMinute}/min) exceeded for ${provider}` }
      }
    }

    return { allowed: true }
  }

  /**
   * Get usage statistics
   */
  static getUsageStats(provider?: string): Record<string, any> {
    if (!QuotaManager.initialized || !QuotaManager.quotaData) {
      return {}
    }

    if (provider) {
      const limits = QuotaManager.quotaLimits[provider] || QuotaManager.quotaLimits.default
      const dailyUsage = QuotaManager.quotaData.dailyUsage[provider] || { count: 0, tokens: 0, cost: 0 }
      const monthlyUsage = QuotaManager.quotaData.monthlyUsage[provider] || { count: 0, tokens: 0, cost: 0 }

      return {
        provider,
        daily: {
          requests: {
            used: dailyUsage.count,
            limit: limits.dailyRequests || '∞',
            percentage: limits.dailyRequests ? Math.round((dailyUsage.count / limits.dailyRequests) * 100) : 0,
          },
          tokens: {
            used: dailyUsage.tokens,
            limit: limits.dailyTokens || '∞',
            percentage: limits.dailyTokens ? Math.round((dailyUsage.tokens / limits.dailyTokens) * 100) : 0,
          },
          cost: {
            used: dailyUsage.cost.toFixed(2),
            limit: limits.dailyCost || '∞',
            percentage: limits.dailyCost ? Math.round((dailyUsage.cost / limits.dailyCost) * 100) : 0,
          },
        },
        monthly: {
          requests: {
            used: monthlyUsage.count,
            limit: limits.monthlyRequests || '∞',
            percentage: limits.monthlyRequests ? Math.round((monthlyUsage.count / limits.monthlyRequests) * 100) : 0,
          },
          tokens: {
            used: monthlyUsage.tokens,
            limit: limits.monthlyTokens || '∞',
            percentage: limits.monthlyTokens ? Math.round((monthlyUsage.tokens / limits.monthlyTokens) * 100) : 0,
          },
          cost: {
            used: monthlyUsage.cost.toFixed(2),
            limit: limits.monthlyCost || '∞',
            percentage: limits.monthlyCost ? Math.round((monthlyUsage.cost / limits.monthlyCost) * 100) : 0,
          },
        },
        resetDaily: QuotaManager.quotaData.dailyReset,
        resetMonthly: QuotaManager.quotaData.monthlyReset,
      }
    }

    // Return all providers
    const stats: Record<string, any> = {}
    for (const prov of Object.keys(QuotaManager.quotaLimits)) {
      if (prov !== 'default') {
        stats[prov] = QuotaManager.getUsageStats(prov)
      }
    }
    return stats
  }

  /**
   * Update quota limits (runtime override)
   */
  static setQuotaLimits(provider: string, limits: Partial<QuotaLimit>): void {
    if (!QuotaManager.quotaLimits[provider]) {
      QuotaManager.quotaLimits[provider] = { provider }
    }
    Object.assign(QuotaManager.quotaLimits[provider], limits)
  }

  // Private methods

  private static loadOrCreateQuotaData(fingerprint: string): QuotaData {
    try {
      if (existsSync(QUOTA_DATA_FILE)) {
        const data = JSON.parse(readFileSync(QUOTA_DATA_FILE, 'utf-8'))
        if (data.fingerprint === fingerprint) {
          return data
        }
      }
    } catch (error) {
      console.warn('Failed to load quota data:', error)
    }

    // Create new quota data
    const now = new Date()
    const nextDaily = new Date(now)
    nextDaily.setDate(nextDaily.getDate() + 1)
    nextDaily.setHours(0, 0, 0, 0)

    const nextMonthly = new Date(now)
    nextMonthly.setMonth(nextMonthly.getMonth() + 1)
    nextMonthly.setDate(1)
    nextMonthly.setHours(0, 0, 0, 0)

    return {
      fingerprint,
      created: now.toISOString(),
      lastUpdated: now.toISOString(),
      dailyReset: nextDaily.toISOString(),
      monthlyReset: nextMonthly.toISOString(),
      usage: [],
      quotaExceeded: {},
      dailyUsage: {},
      monthlyUsage: {},
    }
  }

  private static saveQuotaData(): void {
    if (!QuotaManager.quotaData) {
      return
    }

    try {
      const dir = join(homedir(), '.nikcli')
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true, mode: 0o700 })
      }
      writeFileSync(QUOTA_DATA_FILE, JSON.stringify(QuotaManager.quotaData, null, 2), { mode: 0o600 })
    } catch (error) {
      console.warn('Failed to save quota data:', error)
    }
  }

  private static checkResets(): void {
    if (!QuotaManager.quotaData) {
      return
    }

    const now = new Date()

    // Check daily reset
    if (new Date(QuotaManager.quotaData.dailyReset) < now) {
      QuotaManager.quotaData.dailyUsage = {}
      const nextDaily = new Date(now)
      nextDaily.setDate(nextDaily.getDate() + 1)
      nextDaily.setHours(0, 0, 0, 0)
      QuotaManager.quotaData.dailyReset = nextDaily.toISOString()
    }

    // Check monthly reset
    if (new Date(QuotaManager.quotaData.monthlyReset) < now) {
      QuotaManager.quotaData.monthlyUsage = {}
      const nextMonthly = new Date(now)
      nextMonthly.setMonth(nextMonthly.getMonth() + 1)
      nextMonthly.setDate(1)
      nextMonthly.setHours(0, 0, 0, 0)
      QuotaManager.quotaData.monthlyReset = nextMonthly.toISOString()
    }

    QuotaManager.saveQuotaData()
  }

  private static cleanupOldRecords(): void {
    if (!QuotaManager.quotaData) {
      return
    }

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    QuotaManager.quotaData.usage = QuotaManager.quotaData.usage.filter((record) => record.timestamp > sevenDaysAgo)
    QuotaManager.saveQuotaData()
  }
}
