// src/cli/background-agents/services/user-quota-service.ts

import type { UserUsageStats } from './user-usage-tracker'

/**
 * Enterprise User Quota Service
 * Manages quotas and limits per user for enterprise resource control
 */

export interface UserQuota {
  userId: string
  limits: {
    aiCallsPerHour?: number
    aiCallsPerDay?: number
    aiCallsPerMonth?: number
    tokenUsagePerHour?: number
    tokenUsagePerDay?: number
    tokenUsagePerMonth?: number
    jobsPerHour?: number
    jobsPerDay?: number
    jobsPerMonth?: number
    maxCostPerHour?: number // USD
    maxCostPerDay?: number // USD
    maxCostPerMonth?: number // USD
  }
  plan?: 'free' | 'pro' | 'enterprise'
}

export interface QuotaCheckResult {
  allowed: boolean
  reason?: string
  remaining?: {
    aiCalls?: number
    tokens?: number
    jobs?: number
    cost?: number
  }
}

export class UserQuotaService {
  private quotas: Map<string, UserQuota> = new Map()

  /**
   * Set quota for a user
   */
  setQuota(userId: string, quota: UserQuota): void {
    this.quotas.set(userId, quota)
  }

  /**
   * Get quota for a user
   */
  getQuota(userId: string): UserQuota | null {
    return this.quotas.get(userId) || null
  }

  /**
   * Check if user can make an AI call
   */
  checkAICallAllowed(userId: string, usage: UserUsageStats, estimatedCost: number = 0): QuotaCheckResult {
    const quota = this.getQuota(userId)
    if (!quota) {
      // No quota = unlimited (default)
      return { allowed: true }
    }

    const limits = quota.limits
    const current = usage.currentPeriod

    // Check hourly limits
    if (limits.aiCallsPerHour !== undefined) {
      if (current.hour.aiCalls >= limits.aiCallsPerHour) {
        return {
          allowed: false,
          reason: `Hourly AI call limit exceeded (${limits.aiCallsPerHour})`,
          remaining: { aiCalls: 0 },
        }
      }
    }

    if (limits.tokenUsagePerHour !== undefined) {
      if (current.hour.tokenUsage.total >= limits.tokenUsagePerHour) {
        return {
          allowed: false,
          reason: `Hourly token limit exceeded (${limits.tokenUsagePerHour})`,
          remaining: { tokens: 0 },
        }
      }
    }

    if (limits.maxCostPerHour !== undefined) {
      if (current.hour.estimatedCost + estimatedCost > limits.maxCostPerHour) {
        return {
          allowed: false,
          reason: `Hourly cost limit exceeded ($${limits.maxCostPerHour})`,
          remaining: { cost: Math.max(0, limits.maxCostPerHour - current.hour.estimatedCost) },
        }
      }
    }

    // Check daily limits
    if (limits.aiCallsPerDay !== undefined) {
      if (current.day.aiCalls >= limits.aiCallsPerDay) {
        return {
          allowed: false,
          reason: `Daily AI call limit exceeded (${limits.aiCallsPerDay})`,
          remaining: { aiCalls: 0 },
        }
      }
    }

    if (limits.tokenUsagePerDay !== undefined) {
      if (current.day.tokenUsage.total >= limits.tokenUsagePerDay) {
        return {
          allowed: false,
          reason: `Daily token limit exceeded (${limits.tokenUsagePerDay})`,
          remaining: { tokens: 0 },
        }
      }
    }

    if (limits.maxCostPerDay !== undefined) {
      if (current.day.estimatedCost + estimatedCost > limits.maxCostPerDay) {
        return {
          allowed: false,
          reason: `Daily cost limit exceeded ($${limits.maxCostPerDay})`,
          remaining: { cost: Math.max(0, limits.maxCostPerDay - current.day.estimatedCost) },
        }
      }
    }

    // Check monthly limits
    if (limits.aiCallsPerMonth !== undefined) {
      if (current.month.aiCalls >= limits.aiCallsPerMonth) {
        return {
          allowed: false,
          reason: `Monthly AI call limit exceeded (${limits.aiCallsPerMonth})`,
          remaining: { aiCalls: 0 },
        }
      }
    }

    if (limits.tokenUsagePerMonth !== undefined) {
      if (current.month.tokenUsage.total >= limits.tokenUsagePerMonth) {
        return {
          allowed: false,
          reason: `Monthly token limit exceeded (${limits.tokenUsagePerMonth})`,
          remaining: { tokens: 0 },
        }
      }
    }

    if (limits.maxCostPerMonth !== undefined) {
      if (current.month.estimatedCost + estimatedCost > limits.maxCostPerMonth) {
        return {
          allowed: false,
          reason: `Monthly cost limit exceeded ($${limits.maxCostPerMonth})`,
          remaining: { cost: Math.max(0, limits.maxCostPerMonth - current.month.estimatedCost) },
        }
      }
    }

    // Calculate remaining
    const remaining = {
      aiCalls:
        limits.aiCallsPerHour !== undefined
          ? Math.max(0, limits.aiCallsPerHour - current.hour.aiCalls)
          : undefined,
      tokens:
        limits.tokenUsagePerHour !== undefined
          ? Math.max(0, limits.tokenUsagePerHour - current.hour.tokenUsage.total)
          : undefined,
      cost:
        limits.maxCostPerHour !== undefined
          ? Math.max(0, limits.maxCostPerHour - current.hour.estimatedCost)
          : undefined,
    }

    return { allowed: true, remaining }
  }

  /**
   * Check if user can create a job
   */
  checkJobCreationAllowed(userId: string, usage: UserUsageStats): QuotaCheckResult {
    const quota = this.getQuota(userId)
    if (!quota) {
      return { allowed: true }
    }

    const limits = quota.limits
    const current = usage.currentPeriod

    if (limits.jobsPerHour !== undefined && current.hour.jobsCompleted >= limits.jobsPerHour) {
      return {
        allowed: false,
        reason: `Hourly job limit exceeded (${limits.jobsPerHour})`,
        remaining: { jobs: 0 },
      }
    }

    if (limits.jobsPerDay !== undefined && current.day.jobsCompleted >= limits.jobsPerDay) {
      return {
        allowed: false,
        reason: `Daily job limit exceeded (${limits.jobsPerDay})`,
        remaining: { jobs: 0 },
      }
    }

    if (limits.jobsPerMonth !== undefined && current.month.jobsCompleted >= limits.jobsPerMonth) {
      return {
        allowed: false,
        reason: `Monthly job limit exceeded (${limits.jobsPerMonth})`,
        remaining: { jobs: 0 },
      }
    }

    return { allowed: true }
  }

  /**
   * Set default quotas based on plan
   */
  setDefaultQuota(userId: string, plan: 'free' | 'pro' | 'enterprise'): void {
    const quotas: Record<string, UserQuota> = {
      free: {
        userId,
        plan: 'free',
        limits: {
          aiCallsPerHour: 10,
          aiCallsPerDay: 100,
          aiCallsPerMonth: 1000,
          tokenUsagePerHour: 100000,
          tokenUsagePerDay: 1000000,
          tokenUsagePerMonth: 10000000,
          jobsPerHour: 5,
          jobsPerDay: 20,
          jobsPerMonth: 200,
          maxCostPerHour: 0.1,
          maxCostPerDay: 1.0,
          maxCostPerMonth: 10.0,
        },
      },
      pro: {
        userId,
        plan: 'pro',
        limits: {
          aiCallsPerHour: 100,
          aiCallsPerDay: 1000,
          aiCallsPerMonth: 10000,
          tokenUsagePerHour: 1000000,
          tokenUsagePerDay: 10000000,
          tokenUsagePerMonth: 100000000,
          jobsPerHour: 50,
          jobsPerDay: 200,
          jobsPerMonth: 2000,
          maxCostPerHour: 1.0,
          maxCostPerDay: 10.0,
          maxCostPerMonth: 100.0,
        },
      },
      enterprise: {
        userId,
        plan: 'enterprise',
        limits: {
          // Enterprise = unlimited, but we can set high limits for monitoring
          aiCallsPerHour: 10000,
          aiCallsPerDay: 100000,
          aiCallsPerMonth: 1000000,
          tokenUsagePerHour: 100000000,
          tokenUsagePerDay: 1000000000,
          tokenUsagePerMonth: 10000000000,
          jobsPerHour: 1000,
          jobsPerDay: 10000,
          jobsPerMonth: 100000,
          maxCostPerHour: 100.0,
          maxCostPerDay: 1000.0,
          maxCostPerMonth: 10000.0,
        },
      },
    }

    this.setQuota(userId, quotas[plan])
  }
}

// Singleton instance
let userQuotaServiceInstance: UserQuotaService | null = null

export function getUserQuotaService(): UserQuotaService {
  if (!userQuotaServiceInstance) {
    userQuotaServiceInstance = new UserQuotaService()
  }
  return userQuotaServiceInstance
}



