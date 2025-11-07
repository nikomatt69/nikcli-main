// src/cli/background-agents/services/user-usage-tracker.ts

/**
 * Enterprise User Usage Tracker
 * Tracks AI calls, token usage, and costs per user for enterprise billing and quota management
 */

export interface UserUsage {
  userId: string
  period: 'hour' | 'day' | 'month'
  timestamp: Date
  aiCalls: number
  tokenUsage: {
    input: number
    output: number
    total: number
  }
  estimatedCost: number // USD
  jobsCompleted: number
  toolCalls: number
}

export interface UserUsageStats {
  userId: string
  currentPeriod: {
    hour: UserUsage
    day: UserUsage
    month: UserUsage
  }
  total: {
    aiCalls: number
    tokenUsage: number
    estimatedCost: number
    jobsCompleted: number
    toolCalls: number
  }
}

export class UserUsageTracker {
  private usage: Map<string, UserUsage[]> = new Map() // userId -> usage records
  private adapter?: UserUsageAdapter

  constructor(adapter?: UserUsageAdapter) {
    this.adapter = adapter
  }

  /**
   * Track an AI call for a user
   */
  async trackAICall(
    userId: string,
    inputTokens: number,
    outputTokens: number,
    estimatedCost: number,
    model?: string
  ): Promise<void> {
    const now = new Date()
    const hour = this.getPeriodStart(now, 'hour')
    const day = this.getPeriodStart(now, 'day')
    const month = this.getPeriodStart(now, 'month')

    // Update in-memory tracking
    this.updateUsage(userId, hour, inputTokens, outputTokens, estimatedCost, 1, 0)
    this.updateUsage(userId, day, inputTokens, outputTokens, estimatedCost, 1, 0)
    this.updateUsage(userId, month, inputTokens, outputTokens, estimatedCost, 1, 0)

    // Persist to adapter if available
    if (this.adapter) {
      await this.adapter.recordAICall(userId, {
        timestamp: now,
        inputTokens,
        outputTokens,
        estimatedCost,
        model,
      })
    }
  }

  /**
   * Track tool calls for a user
   */
  async trackToolCalls(userId: string, count: number): Promise<void> {
    const now = new Date()
    const hour = this.getPeriodStart(now, 'hour')
    const day = this.getPeriodStart(now, 'day')
    const month = this.getPeriodStart(now, 'month')

    const records = this.usage.get(userId) || []
    const updateRecord = (period: Date, periodType: 'hour' | 'day' | 'month') => {
      const key = `${period.getTime()}-${periodType}`
      let record = records.find((r) => r.timestamp.getTime() === period.getTime() && r.period === periodType)
      if (!record) {
        record = {
          userId,
          period: periodType,
          timestamp: period,
          aiCalls: 0,
          tokenUsage: { input: 0, output: 0, total: 0 },
          estimatedCost: 0,
          jobsCompleted: 0,
          toolCalls: 0,
        }
        records.push(record)
      }
      record.toolCalls += count
    }

    updateRecord(hour, 'hour')
    updateRecord(day, 'day')
    updateRecord(month, 'month')

    this.usage.set(userId, records)
  }

  /**
   * Track job completion for a user
   */
  async trackJobCompletion(userId: string): Promise<void> {
    const now = new Date()
    const hour = this.getPeriodStart(now, 'hour')
    const day = this.getPeriodStart(now, 'day')
    const month = this.getPeriodStart(now, 'month')

    const records = this.usage.get(userId) || []
    const updateRecord = (period: Date, periodType: 'hour' | 'day' | 'month') => {
      let record = records.find((r) => r.timestamp.getTime() === period.getTime() && r.period === periodType)
      if (!record) {
        record = {
          userId,
          period: periodType,
          timestamp: period,
          aiCalls: 0,
          tokenUsage: { input: 0, output: 0, total: 0 },
          estimatedCost: 0,
          jobsCompleted: 0,
          toolCalls: 0,
        }
        records.push(record)
      }
      record.jobsCompleted += 1
    }

    updateRecord(hour, 'hour')
    updateRecord(day, 'day')
    updateRecord(month, 'month')

    this.usage.set(userId, records)
  }

  /**
   * Get usage statistics for a user
   */
  getUsageStats(userId: string): UserUsageStats | null {
    const records = this.usage.get(userId) || []
    const now = new Date()
    const hour = this.getPeriodStart(now, 'hour')
    const day = this.getPeriodStart(now, 'day')
    const month = this.getPeriodStart(now, 'month')

    const hourRecord = records.find((r) => r.timestamp.getTime() === hour.getTime() && r.period === 'hour') || {
      userId,
      period: 'hour' as const,
      timestamp: hour,
      aiCalls: 0,
      tokenUsage: { input: 0, output: 0, total: 0 },
      estimatedCost: 0,
      jobsCompleted: 0,
      toolCalls: 0,
    }

    const dayRecord = records.find((r) => r.timestamp.getTime() === day.getTime() && r.period === 'day') || {
      userId,
      period: 'day' as const,
      timestamp: day,
      aiCalls: 0,
      tokenUsage: { input: 0, output: 0, total: 0 },
      estimatedCost: 0,
      jobsCompleted: 0,
      toolCalls: 0,
    }

    const monthRecord = records.find((r) => r.timestamp.getTime() === month.getTime() && r.period === 'month') || {
      userId,
      period: 'month' as const,
      timestamp: month,
      aiCalls: 0,
      tokenUsage: { input: 0, output: 0, total: 0 },
      estimatedCost: 0,
      jobsCompleted: 0,
      toolCalls: 0,
    }

    // Calculate totals
    const total = records.reduce(
      (acc, record) => ({
        aiCalls: acc.aiCalls + record.aiCalls,
        tokenUsage: acc.tokenUsage + record.tokenUsage.total,
        estimatedCost: acc.estimatedCost + record.estimatedCost,
        jobsCompleted: acc.jobsCompleted + record.jobsCompleted,
        toolCalls: acc.toolCalls + record.toolCalls,
      }),
      {
        aiCalls: 0,
        tokenUsage: 0,
        estimatedCost: 0,
        jobsCompleted: 0,
        toolCalls: 0,
      }
    )

    return {
      userId,
      currentPeriod: {
        hour: hourRecord,
        day: dayRecord,
        month: monthRecord,
      },
      total,
    }
  }

  /**
   * Get all users with usage
   */
  getAllUsers(): string[] {
    return Array.from(this.usage.keys())
  }

  private updateUsage(
    userId: string,
    period: Date,
    inputTokens: number,
    outputTokens: number,
    estimatedCost: number,
    aiCalls: number,
    toolCalls: number
  ): void {
    const records = this.usage.get(userId) || []
    const periodType = this.getPeriodType(period)
    let record = records.find((r) => r.timestamp.getTime() === period.getTime() && r.period === periodType)

    if (!record) {
      record = {
        userId,
        period: periodType,
        timestamp: period,
        aiCalls: 0,
        tokenUsage: { input: 0, output: 0, total: 0 },
        estimatedCost: 0,
        jobsCompleted: 0,
        toolCalls: 0,
      }
      records.push(record)
    }

    record.aiCalls += aiCalls
    record.tokenUsage.input += inputTokens
    record.tokenUsage.output += outputTokens
    record.tokenUsage.total += inputTokens + outputTokens
    record.estimatedCost += estimatedCost
    record.toolCalls += toolCalls

    this.usage.set(userId, records)
  }

  private getPeriodStart(date: Date, period: 'hour' | 'day' | 'month'): Date {
    const d = new Date(date)
    d.setSeconds(0, 0)

    if (period === 'hour') {
      d.setMinutes(0)
      return d
    }

    if (period === 'day') {
      d.setHours(0)
      d.setMinutes(0)
      return d
    }

    // month
    d.setDate(1)
    d.setHours(0)
    d.setMinutes(0)
    return d
  }

  private getPeriodType(date: Date): 'hour' | 'day' | 'month' {
    const now = new Date()
    const hour = this.getPeriodStart(now, 'hour')
    const day = this.getPeriodStart(now, 'day')
    const month = this.getPeriodStart(now, 'month')

    if (date.getTime() === hour.getTime()) return 'hour'
    if (date.getTime() === day.getTime()) return 'day'
    return 'month'
  }
}

/**
 * Adapter interface for persisting usage data
 */
export interface UserUsageAdapter {
  recordAICall(userId: string, data: { timestamp: Date; inputTokens: number; outputTokens: number; estimatedCost: number; model?: string }): Promise<void>
  getUserUsage(userId: string, period: 'hour' | 'day' | 'month'): Promise<UserUsage | null>
  getAllUserUsage(userId: string): Promise<UserUsage[]>
}

// Singleton instance
let userUsageTrackerInstance: UserUsageTracker | null = null

export function getUserUsageTracker(): UserUsageTracker {
  if (!userUsageTrackerInstance) {
    userUsageTrackerInstance = new UserUsageTracker()
  }
  return userUsageTrackerInstance
}










