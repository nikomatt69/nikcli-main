// src/cli/services/notification-service.ts

import { IncomingWebhook } from '@slack/webhook'
import axios, { type AxiosError } from 'axios'
import { MESSAGE_TEMPLATES } from '../config/notification-defaults'
import type {
  NotificationCacheEntry,
  NotificationConfig,
  NotificationDeliveryStatus,
  NotificationError,
  NotificationErrorCode,
  NotificationPayload,
  NotificationProvider,
  NotificationResult,
  PlanCompletionPayload,
  TaskCompletionPayload,
} from '../types/notifications'
import { NotificationType } from '../types/notifications'
import { advancedUI } from '../ui/advanced-cli-ui'

/**
 * Notification Service - Multi-provider notification system
 * Supports Slack, Discord, and Linear integrations
 */
export class NotificationService {
  private config: NotificationConfig
  private slackClient?: IncomingWebhook
  private cache: Map<string, NotificationCacheEntry> = new Map()
  private rateLimitCounters: Map<NotificationProvider, number[]> = new Map()

  constructor(config: NotificationConfig) {
    this.config = config
    this.initialize()
  }

  /**
   * Initialize notification providers
   */
  private initialize(): void {
    try {
      // Initialize Slack client
      if (this.config.providers.slack?.enabled && this.config.providers.slack.webhookUrl) {
        this.slackClient = new IncomingWebhook(this.config.providers.slack.webhookUrl)
        advancedUI.logFunctionUpdate('success', 'Slack notification provider initialized', '✓')
      }

      // Discord and Linear are HTTP-based, no client initialization needed
      if (this.config.providers.discord?.enabled && this.config.providers.discord.webhookUrl) {
        advancedUI.logFunctionUpdate('success', `Discord notification provider initialized`, '✓')
      } else {
        advancedUI.logFunctionUpdate(
          'info',
          `Discord NOT initialized - enabled: ${this.config.providers.discord?.enabled}, webhook: ${this.config.providers.discord?.webhookUrl ? 'set' : 'missing'}`,
          'ℹ️'
        )
      }

      if (this.config.providers.linear?.enabled && this.config.providers.linear.apiKey) {
        advancedUI.logFunctionUpdate('success', 'Linear notification provider initialized', '✓')
      }
    } catch (error: any) {
      advancedUI.logFunctionUpdate('error', `Notification service initialization failed: ${error.message}`, '✖')
    }
  }

  /**
   * Send task completion notification
   */
  async sendTaskCompletion(payload: TaskCompletionPayload): Promise<NotificationDeliveryStatus> {
    return this.send(payload)
  }

  /**
   * Send task started notification
   */
  async sendTaskStarted(payload: any): Promise<NotificationDeliveryStatus> {
    return this.send(payload)
  }

  /**
   * Send task failure notification
   */
  async sendTaskFailure(payload: TaskCompletionPayload): Promise<NotificationDeliveryStatus> {
    return this.send(payload)
  }

  /**
   * Send plan completion notification
   */
  async sendPlanCompletion(payload: PlanCompletionPayload): Promise<NotificationDeliveryStatus> {
    return this.send(payload)
  }

  /**
   * Send plan started notification
   */
  async sendPlanStarted(payload: any): Promise<NotificationDeliveryStatus> {
    return this.send(payload)
  }

  /**
   * Main send method - routes to appropriate providers
   */
  private async send(payload: NotificationPayload): Promise<NotificationDeliveryStatus> {
    if (!this.config.enabled) {
      return this.createDeliveryStatus(payload, [])
    }

    // Check deduplication
    if (this.config.deduplication?.enabled && this.isDuplicate(payload)) {
      advancedUI.logFunctionUpdate('info', 'Notification skipped (duplicate)', '⏭')
      return this.createDeliveryStatus(payload, [])
    }

    // Determine which providers to use
    const enabledProviders = this.getEnabledProviders()

    if (enabledProviders.length === 0) {
      return this.createDeliveryStatus(payload, [])
    }

    // Send to all enabled providers in parallel
    const results = await Promise.all(enabledProviders.map((provider) => this.sendToProvider(provider, payload)))

    // Cache for deduplication
    if (this.config.deduplication?.enabled) {
      this.cacheNotification(payload)
    }

    return this.createDeliveryStatus(payload, results)
  }

  /**
   * Send notification to specific provider
   */
  private async sendToProvider(
    provider: NotificationProvider,
    payload: NotificationPayload
  ): Promise<NotificationResult> {
    const startTime = Date.now()
    let attemptNumber = 1

    // Check rate limit
    if (this.config.rateLimit?.enabled && this.isRateLimited(provider)) {
      return {
        provider,
        success: false,
        error: {
          code: 'rate_limited' as NotificationErrorCode,
          message: 'Rate limit exceeded',
          retryable: true,
        },
        timestamp: new Date(),
        duration: Date.now() - startTime,
        attemptNumber,
      }
    }

    // Retry logic
    const maxAttempts = this.config.retry?.enabled ? this.config.retry.maxAttempts : 1

    for (attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber++) {
      try {
        await this.deliverToProvider(provider, payload)

        // Success - track rate limit
        this.trackRateLimit(provider)

        return {
          provider,
          success: true,
          timestamp: new Date(),
          duration: Date.now() - startTime,
          attemptNumber,
        }
      } catch (error: any) {
        const notificationError = this.parseError(error)

        // If not retryable or last attempt, return failure
        if (!notificationError.retryable || attemptNumber === maxAttempts) {
          return {
            provider,
            success: false,
            error: notificationError,
            timestamp: new Date(),
            duration: Date.now() - startTime,
            attemptNumber,
          }
        }

        // Wait before retry (exponential backoff)
        if (this.config.retry?.enabled) {
          const backoffMs = this.config.retry.backoffMs * 2 ** (attemptNumber - 1)
          await new Promise((resolve) => setTimeout(resolve, backoffMs))
        }
      }
    }

    // Should never reach here, but TypeScript needs it
    return {
      provider,
      success: false,
      error: {
        code: 'unknown' as NotificationErrorCode,
        message: 'Unknown error',
        retryable: false,
      },
      timestamp: new Date(),
      duration: Date.now() - startTime,
      attemptNumber,
    }
  }

  /**
   * Deliver notification to provider (actual HTTP/API calls)
   */
  private async deliverToProvider(provider: NotificationProvider, payload: NotificationPayload): Promise<void> {
    const timeout = this.config.timeout?.requestTimeoutMs || 5000

    switch (provider) {
      case 'slack':
        await this.sendToSlack(payload, timeout)
        break
      case 'discord':
        await this.sendToDiscord(payload, timeout)
        break
      case 'linear':
        await this.sendToLinear(payload, timeout)
        break
      default:
        throw new Error(`Unknown provider: ${provider}`)
    }
  }

  /**
   * Send to Slack
   */
  private async sendToSlack(payload: NotificationPayload, timeout: number): Promise<void> {
    if (!this.slackClient) {
      throw new Error('Slack client not initialized')
    }

    const message = this.formatMessage(payload, 'slack')

    await Promise.race([
      this.slackClient.send(message),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout)),
    ])
  }

  /**
   * Send to Discord
   */
  private async sendToDiscord(payload: NotificationPayload, timeout: number): Promise<void> {
    const webhookUrl = this.config.providers.discord?.webhookUrl

    if (!webhookUrl) {
      throw new Error('Discord webhook URL not configured')
    }

    const message = this.formatMessage(payload, 'discord')

    try {
      const response = await axios.post(webhookUrl, message, {
        timeout,
        headers: {
          'Content-Type': 'application/json',
        },
      })

      advancedUI.logFunctionUpdate('success', `Discord notification ${response.status})`, '✓')
    } catch (error: any) {
      advancedUI.logFunctionUpdate('error', `Discord notification failed: ${error.message}`, '✖')
      if (error.response) {
        advancedUI.logFunctionUpdate('error', `Discord API error: ${JSON.stringify(error.response.data)}`, '⚠︎')
      }
      throw error
    }
  }

  /**
   * Send to Linear (create comment on issue)
   */
  private async sendToLinear(payload: NotificationPayload, timeout: number): Promise<void> {
    const apiKey = this.config.providers.linear?.apiKey
    const teamId = this.config.providers.linear?.teamId

    if (!apiKey) {
      throw new Error('Linear API key not configured')
    }

    if (!teamId) {
      throw new Error('Linear team ID not configured')
    }

    const comment = this.formatMessage(payload, 'linear')

    // Linear GraphQL API
    const query = `
      mutation CreateComment($issueId: String!, $body: String!) {
        commentCreate(input: { issueId: $issueId, body: $body }) {
          success
          comment {
            id
          }
        }
      }
    `

    // For now, we'll create a standalone comment without linking to a specific issue
    // In a production scenario, you'd have logic to find/create the appropriate issue
    const notificationIssueId = await this.getOrCreateNotificationIssue(teamId, apiKey, timeout)

    await axios.post(
      'https://api.linear.app/graphql',
      {
        query,
        variables: {
          issueId: notificationIssueId,
          body: comment,
        },
      },
      {
        timeout,
        headers: {
          'Content-Type': 'application/json',
          Authorization: apiKey,
        },
      }
    )
  }

  /**
   * Get or create a notification tracking issue in Linear
   */
  private async getOrCreateNotificationIssue(teamId: string, apiKey: string, timeout: number): Promise<string> {
    // This is a simplified implementation
    // In production, you'd cache this issue ID or query for it
    const query = `
      mutation CreateIssue($teamId: String!, $title: String!, $description: String!) {
        issueCreate(input: { teamId: $teamId, title: $title, description: $description }) {
          success
          issue {
            id
          }
        }
      }
    `

    const response = await axios.post(
      'https://api.linear.app/graphql',
      {
        query,
        variables: {
          teamId,
          title: 'NikCLI Notifications',
          description: 'Automated notifications from NikCLI task execution',
        },
      },
      {
        timeout,
        headers: {
          'Content-Type': 'application/json',
          Authorization: apiKey,
        },
      }
    )

    return response.data.data.issueCreate.issue.id
  }

  /**
   * Format message for specific provider
   */
  private formatMessage(payload: NotificationPayload, provider: 'slack' | 'discord' | 'linear'): any {
    switch (payload.type) {
      case NotificationType.TASK_STARTED:
        return (MESSAGE_TEMPLATES as any).taskStarted[provider](payload)
      case NotificationType.TASK_COMPLETED:
        return MESSAGE_TEMPLATES.taskCompleted[provider](payload)

      case NotificationType.TASK_FAILED:
        return MESSAGE_TEMPLATES.taskFailed[provider](payload)

      case NotificationType.PLAN_STARTED:
        return (MESSAGE_TEMPLATES as any).planStarted[provider](payload)
      case NotificationType.PLAN_COMPLETED:
      case NotificationType.PLAN_FAILED:
        return MESSAGE_TEMPLATES.planCompleted[provider](payload)

      default:
        throw new Error(`Unsupported notification type: ${JSON.stringify(payload)}`)
    }
  }

  /**
   * Parse error into NotificationError
   */
  private parseError(error: any): NotificationError {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError

      if (axiosError.code === 'ECONNABORTED') {
        return {
          code: 'timeout' as NotificationErrorCode,
          message: 'Request timeout',
          retryable: true,
        }
      }

      if (axiosError.response?.status === 429) {
        return {
          code: 'rate_limited' as NotificationErrorCode,
          message: 'Rate limited by provider',
          retryable: true,
        }
      }

      if (axiosError.response?.status && axiosError.response.status >= 500) {
        return {
          code: 'provider_error' as NotificationErrorCode,
          message: `Provider error: ${axiosError.response.status}`,
          details: axiosError.response.data,
          retryable: true,
        }
      }

      return {
        code: 'network_error' as NotificationErrorCode,
        message: axiosError.message,
        details: axiosError.response?.data,
        retryable: false,
      }
    }

    if (error.message?.includes('not initialized') || error.message?.includes('not configured')) {
      return {
        code: 'invalid_config' as NotificationErrorCode,
        message: error.message,
        retryable: false,
      }
    }

    return {
      code: 'unknown' as NotificationErrorCode,
      message: error.message || 'Unknown error',
      details: error,
      retryable: false,
    }
  }

  /**
   * Check if notification is duplicate
   */
  private isDuplicate(payload: NotificationPayload): boolean {
    const key = this.getCacheKey(payload)
    const cached = this.cache.get(key)

    if (!cached) {
      return false
    }

    // Check if cache entry is still valid
    if (cached.expiresAt < new Date()) {
      this.cache.delete(key)
      return false
    }

    return true
  }

  /**
   * Cache notification for deduplication
   */
  private cacheNotification(payload: NotificationPayload): void {
    const key = this.getCacheKey(payload)
    const windowMs = this.config.deduplication?.windowMs || 300000

    this.cache.set(key, {
      key,
      payload,
      timestamp: new Date(),
      expiresAt: new Date(Date.now() + windowMs),
    })

    // Clean expired entries
    this.cleanExpiredCache()
  }

  /**
   * Generate cache key for deduplication
   */
  private getCacheKey(payload: NotificationPayload): string {
    if ('taskId' in payload) {
      return `task:${payload.taskId}:${payload.agentName}:${payload.type}`
    }
    if ('planId' in payload) {
      return `plan:${payload.planId}:${payload.type}`
    }
    return `${(payload as any).type}:${(payload as any).timestamp?.getTime() || Date.now()}` as string
  }

  /**
   * Clean expired cache entries
   */
  private cleanExpiredCache(): void {
    const now = new Date()
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Check if provider is rate limited
   */
  private isRateLimited(provider: NotificationProvider): boolean {
    if (!this.config.rateLimit?.enabled) {
      return false
    }

    const timestamps = this.rateLimitCounters.get(provider) || []
    const oneMinuteAgo = Date.now() - 60000

    // Clean old timestamps
    const recentTimestamps = timestamps.filter((ts) => ts > oneMinuteAgo)

    return recentTimestamps.length >= (this.config.rateLimit.maxPerMinute || 10)
  }

  /**
   * Track rate limit
   */
  private trackRateLimit(provider: NotificationProvider): void {
    if (!this.config.rateLimit?.enabled) {
      return
    }

    const timestamps = this.rateLimitCounters.get(provider) || []
    timestamps.push(Date.now())

    // Keep only last minute
    const oneMinuteAgo = Date.now() - 60000
    const recentTimestamps = timestamps.filter((ts) => ts > oneMinuteAgo)

    this.rateLimitCounters.set(provider, recentTimestamps)
  }

  /**
   * Get list of enabled providers
   */
  private getEnabledProviders(): NotificationProvider[] {
    const providers: NotificationProvider[] = []

    if (this.config.providers.slack?.enabled && this.config.providers.slack.webhookUrl) {
      providers.push('slack' as NotificationProvider)
    }

    if (this.config.providers.discord?.enabled && this.config.providers.discord.webhookUrl) {
      providers.push('discord' as NotificationProvider)
    }

    if (this.config.providers.linear?.enabled && this.config.providers.linear.apiKey) {
      providers.push('linear' as NotificationProvider)
    }

    return providers
  }

  /**
   * Create delivery status
   */
  private createDeliveryStatus(
    payload: NotificationPayload,
    results: NotificationResult[]
  ): NotificationDeliveryStatus {
    const allSucceeded = results.length > 0 && results.every((r) => r.success)
    const allFailed = results.length > 0 && results.every((r) => !r.success)
    const partialSuccess = results.length > 0 && !allSucceeded && !allFailed

    return {
      queueId: this.getCacheKey(payload),
      payload,
      results,
      allSucceeded,
      allFailed,
      partialSuccess,
      timestamp: new Date(),
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<NotificationConfig>): void {
    this.config = { ...this.config, ...config }
    this.initialize()
  }

  /**
   * Get current configuration
   */
  getConfig(): NotificationConfig {
    return { ...this.config }
  }
}

/**
 * Singleton instance (will be initialized by config manager)
 */
let notificationServiceInstance: NotificationService | null = null

export function getNotificationService(config?: NotificationConfig): NotificationService {
  if (!notificationServiceInstance && config) {
    notificationServiceInstance = new NotificationService(config)
  }

  if (!notificationServiceInstance) {
    throw new Error('NotificationService not initialized. Call with config first.')
  }

  return notificationServiceInstance
}

export function resetNotificationService(): void {
  notificationServiceInstance = null
}
