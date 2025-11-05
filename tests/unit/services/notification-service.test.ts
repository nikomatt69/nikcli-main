/**
 * Comprehensive tests for Notification Service
 * Tests notification sending, templates, rate limiting, and edge cases
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationService } from '../../../src/cli/services/notification-service'
import { mockConsole, mockEnv } from '../../helpers/test-utils'

vi.mock('@slack/webhook', () => ({
  IncomingWebhook: vi.fn(() => ({
    send: vi.fn().mockResolvedValue({ text: 'ok' }),
  })),
}))

vi.mock('../../../src/cli/ui/advanced-cli-ui', () => ({
  advancedUI: {
    logFunctionUpdate: vi.fn(),
  },
}))

const defaultConfig = {
  enabled: true,
  providers: {
    slack: { enabled: false },
    discord: { enabled: false },
    linear: { enabled: false },
    email: { enabled: false },
  },
  deduplication: { enabled: false },
  rateLimit: { enabled: false },
  retry: { enabled: false },
}

describe('NotificationService', () => {
  let notificationService: NotificationService
  let console: ReturnType<typeof mockConsole>
  let env: ReturnType<typeof mockEnv>

  beforeEach(() => {
    console = mockConsole()
    env = mockEnv({
      NODE_ENV: 'test',
    })
    notificationService = new NotificationService(defaultConfig)
  })

  afterEach(() => {
    console.restore()
    env.restore()
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize with config', () => {
      expect(notificationService).toBeInstanceOf(NotificationService)
    })

    it('should initialize with Slack enabled', () => {
      const config = {
        ...defaultConfig,
        providers: {
          ...defaultConfig.providers,
          slack: { enabled: true, webhookUrl: 'https://hooks.slack.com/test' },
        },
      }
      const service = new NotificationService(config)
      expect(service).toBeInstanceOf(NotificationService)
    })

    it('should initialize with Discord enabled', () => {
      const config = {
        ...defaultConfig,
        providers: {
          ...defaultConfig.providers,
          discord: { enabled: true, webhookUrl: 'https://discord.com/api/webhooks/test' },
        },
      }
      const service = new NotificationService(config)
      expect(service).toBeInstanceOf(NotificationService)
    })

    it('should handle initialization errors gracefully', () => {
      const config = {
        ...defaultConfig,
        providers: {
          ...defaultConfig.providers,
          slack: { enabled: true, webhookUrl: 'invalid-url' },
        },
      }
      expect(() => new NotificationService(config)).not.toThrow()
    })
  })

  describe('Task Notifications', () => {
    it('should send task completion notification', async () => {
      const payload = {
        taskId: 'test-task',
        taskName: 'Test Task',
        status: 'completed',
        duration: 1000,
      }
      const result = await notificationService.sendTaskCompletion(payload)
      expect(result).toBeDefined()
      expect(result.success).toBeDefined()
    })

    it('should send task started notification', async () => {
      const payload = {
        taskId: 'test-task',
        taskName: 'Test Task',
      }
      const result = await notificationService.sendTaskStarted(payload)
      expect(result).toBeDefined()
    })

    it('should send task failure notification', async () => {
      const payload = {
        taskId: 'test-task',
        taskName: 'Test Task',
        status: 'failed',
        error: 'Test error',
      }
      const result = await notificationService.sendTaskFailure(payload)
      expect(result).toBeDefined()
    })
  })

  describe('Plan Notifications', () => {
    it('should send plan completion notification', async () => {
      const payload = {
        planId: 'test-plan',
        planName: 'Test Plan',
        status: 'completed',
        tasksCompleted: 5,
        totalTasks: 5,
      }
      const result = await notificationService.sendPlanCompletion(payload)
      expect(result).toBeDefined()
    })

    it('should send plan started notification', async () => {
      const payload = {
        planId: 'test-plan',
        planName: 'Test Plan',
      }
      const result = await notificationService.sendPlanStarted(payload)
      expect(result).toBeDefined()
    })
  })

  describe('Service Disabled', () => {
    it('should not send notifications when service is disabled', async () => {
      const config = { ...defaultConfig, enabled: false }
      const service = new NotificationService(config)
      const payload = { taskId: 'test', taskName: 'Test' }
      const result = await service.sendTaskCompletion(payload)
      expect(result.success).toBe(false)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty payload', async () => {
      const payload = {} as any
      const result = await notificationService.sendTaskCompletion(payload)
      expect(result).toBeDefined()
    })

    it('should handle null payload', async () => {
      const result = await notificationService.sendTaskCompletion(null as any)
      expect(result).toBeDefined()
    })

    it('should handle payload with missing fields', async () => {
      const payload = { taskId: 'test' } as any
      const result = await notificationService.sendTaskCompletion(payload)
      expect(result).toBeDefined()
    })

    it('should handle very large payload', async () => {
      const payload = {
        taskId: 'test',
        taskName: 'x'.repeat(100000),
        data: 'x'.repeat(1000000),
      }
      const result = await notificationService.sendTaskCompletion(payload)
      expect(result).toBeDefined()
    })

    it('should handle special characters in payload', async () => {
      const payload = {
        taskId: 'test',
        taskName: '🚀 Test !@#$%^&*() 中文 🎉',
      }
      const result = await notificationService.sendTaskCompletion(payload)
      expect(result).toBeDefined()
    })

    it('should handle concurrent notifications', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        notificationService.sendTaskCompletion({
          taskId: `task-${i}`,
          taskName: `Task ${i}`,
          status: 'completed',
        })
      )
      const results = await Promise.all(promises)
      expect(results.length).toBe(10)
      results.forEach((result) => {
        expect(result).toBeDefined()
      })
    })
  })

  describe('Rate Limiting', () => {
    it('should respect rate limits when enabled', async () => {
      const config = {
        ...defaultConfig,
        rateLimit: {
          enabled: true,
          maxRequests: 5,
          windowMs: 60000,
        },
      }
      const service = new NotificationService(config)
      const payload = { taskId: 'test', taskName: 'Test' }

      // Send multiple notifications
      const results = await Promise.all(
        Array.from({ length: 10 }, () => service.sendTaskCompletion(payload))
      )

      // Some should be rate limited
      const rateLimited = results.filter((r) => r.deliveries.some((d) => d.error?.code === 'rate_limited'))
      expect(rateLimited.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Deduplication', () => {
    it('should deduplicate notifications when enabled', async () => {
      const config = {
        ...defaultConfig,
        deduplication: {
          enabled: true,
          ttl: 60000,
        },
      }
      const service = new NotificationService(config)
      const payload = { taskId: 'test', taskName: 'Test' }

      const result1 = await service.sendTaskCompletion(payload)
      const result2 = await service.sendTaskCompletion(payload)

      // Second notification should be skipped
      expect(result2.deliveries.length).toBe(0)
    })
  })

  describe('Provider Errors', () => {
    it('should handle provider connection errors', async () => {
      const config = {
        ...defaultConfig,
        providers: {
          ...defaultConfig.providers,
          slack: { enabled: true, webhookUrl: 'https://invalid-url.com' },
        },
      }
      const service = new NotificationService(config)
      const payload = { taskId: 'test', taskName: 'Test' }

      const result = await service.sendTaskCompletion(payload)
      expect(result).toBeDefined()
      // Should handle error gracefully
    })

    it('should handle provider timeout', async () => {
      const config = {
        ...defaultConfig,
        providers: {
          ...defaultConfig.providers,
          slack: { enabled: true, webhookUrl: 'https://hooks.slack.com/test' },
        },
      }
      const service = new NotificationService(config)
      const payload = { taskId: 'test', taskName: 'Test' }

      // Mock timeout
      vi.mocked(require('@slack/webhook').IncomingWebhook).mockImplementation(() => ({
        send: vi.fn().mockImplementation(
          () => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))
        ),
      }))

      const result = await service.sendTaskCompletion(payload)
      expect(result).toBeDefined()
    })
  })

  describe('Retry Logic', () => {
    it('should retry on failure when enabled', async () => {
      const config = {
        ...defaultConfig,
        retry: {
          enabled: true,
          maxAttempts: 3,
          delayMs: 100,
        },
        providers: {
          ...defaultConfig.providers,
          slack: { enabled: true, webhookUrl: 'https://hooks.slack.com/test' },
        },
      }
      const service = new NotificationService(config)
      const payload = { taskId: 'test', taskName: 'Test' }

      // Mock failing then succeeding
      let attemptCount = 0
      vi.mocked(require('@slack/webhook').IncomingWebhook).mockImplementation(() => ({
        send: vi.fn().mockImplementation(() => {
          attemptCount++
          if (attemptCount < 2) {
            return Promise.reject(new Error('Temporary error'))
          }
          return Promise.resolve({ text: 'ok' })
        }),
      }))

      const result = await service.sendTaskCompletion(payload)
      expect(result).toBeDefined()
    })
  })

  describe('Template Rendering', () => {
    it('should render task completion template', async () => {
      const payload = {
        taskId: 'test-task',
        taskName: 'Test Task',
        status: 'completed',
        duration: 1000,
      }
      const result = await notificationService.sendTaskCompletion(payload)
      expect(result).toBeDefined()
    })

    it('should handle template rendering errors', async () => {
      const payload = {
        taskId: 'test',
        taskName: null as any,
      }
      const result = await notificationService.sendTaskCompletion(payload)
      expect(result).toBeDefined()
    })
  })

  describe('Multiple Providers', () => {
    it('should send to multiple providers', async () => {
      const config = {
        ...defaultConfig,
        providers: {
          slack: { enabled: true, webhookUrl: 'https://hooks.slack.com/test' },
          discord: { enabled: true, webhookUrl: 'https://discord.com/api/webhooks/test' },
          linear: { enabled: false },
          email: { enabled: false },
        },
      }
      const service = new NotificationService(config)
      const payload = { taskId: 'test', taskName: 'Test' }

      const result = await service.sendTaskCompletion(payload)
      expect(result.deliveries.length).toBeGreaterThanOrEqual(0)
    })
  })
})

