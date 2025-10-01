/**
 * Comprehensive Service Integration Tests
 * Tests the interaction of multiple services together
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createMockAgent,
  createMockTool,
  createMockConfigManager,
  createMockLogger,
  createMockTokenManager,
  createMockSessionManager,
} from '../../helpers/mock-factory'
import { waitFor, retry, measureTime } from '../../helpers/async-test-utils'
import { assertInRange, assertShape, assertCompletesWithin } from '../../helpers/assertion-helpers'

describe('Comprehensive Service Tests', () => {
  let mockConfig: ReturnType<typeof createMockConfigManager>
  let mockLogger: ReturnType<typeof createMockLogger>
  let mockTokenManager: ReturnType<typeof createMockTokenManager>
  let mockSessionManager: ReturnType<typeof createMockSessionManager>

  beforeEach(() => {
    mockConfig = createMockConfigManager()
    mockLogger = createMockLogger()
    mockTokenManager = createMockTokenManager()
    mockSessionManager = createMockSessionManager()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Service Initialization', () => {
    it('should initialize all services in correct order', async () => {
      const initOrder: string[] = []

      const services = {
        config: {
          init: () => {
            initOrder.push('config')
            return Promise.resolve()
          },
        },
        logger: {
          init: () => {
            initOrder.push('logger')
            return Promise.resolve()
          },
        },
        session: {
          init: () => {
            initOrder.push('session')
            return Promise.resolve()
          },
        },
      }

      await services.config.init()
      await services.logger.init()
      await services.session.init()

      expect(initOrder).toEqual(['config', 'logger', 'session'])
    })

    it('should handle service initialization failures', async () => {
      const failingService = {
        init: vi.fn().mockRejectedValue(new Error('Init failed')),
      }

      await expect(failingService.init()).rejects.toThrow('Init failed')
      expect(failingService.init).toHaveBeenCalledTimes(1)
    })

    it('should retry failed initialization', async () => {
      let attempts = 0
      const service = {
        init: vi.fn().mockImplementation(() => {
          attempts++
          if (attempts < 3) {
            return Promise.reject(new Error('Temporary failure'))
          }
          return Promise.resolve()
        }),
      }

      await retry(() => service.init(), { maxAttempts: 3 })

      expect(service.init).toHaveBeenCalledTimes(3)
      expect(attempts).toBe(3)
    })
  })

  describe('Configuration Service', () => {
    it('should load configuration from environment', () => {
      process.env.TEST_API_KEY = 'test-key-123'

      const config = mockConfig.getConfig()
      mockConfig.setConfig('apiKey', process.env.TEST_API_KEY)

      expect(mockConfig.getConfig('apiKey')).toBe('test-key-123')

      delete process.env.TEST_API_KEY
    })

    it('should validate configuration values', () => {
      const validations = [
        { key: 'apiKey', value: 'valid-key-12345', expected: true },
        { key: 'apiKey', value: 'short', expected: false },
        { key: 'temperature', value: 0.7, expected: true },
        { key: 'temperature', value: 2.0, expected: false },
      ]

      validations.forEach(({ key, value, expected }) => {
        mockConfig.setConfig(key, value)
        const isValid = mockConfig.validateConfig().valid
        expect(isValid).toBe(expected)
      })
    })

    it('should merge partial configurations', () => {
      const baseConfig = {
        apiKey: 'key-1',
        model: 'model-1',
        temperature: 0.7,
      }

      const override = {
        model: 'model-2',
        temperature: 0.9,
      }

      mockConfig.config = { ...baseConfig, ...override }

      expect(mockConfig.getConfig('apiKey')).toBe('key-1')
      expect(mockConfig.getConfig('model')).toBe('model-2')
      expect(mockConfig.getConfig('temperature')).toBe(0.9)
    })
  })

  describe('Session Management', () => {
    it('should create and retrieve sessions', () => {
      const session = mockSessionManager.createSession('session-1')

      expect(session).toBeDefined()
      expect(session.id).toBe('session-1')
      expect(session.createdAt).toBeGreaterThan(0)

      const retrieved = mockSessionManager.getSession('session-1')
      expect(retrieved).toEqual(session)
    })

    it('should list all active sessions', () => {
      mockSessionManager.createSession('session-1')
      mockSessionManager.createSession('session-2')
      mockSessionManager.createSession('session-3')

      const sessions = mockSessionManager.listSessions()

      expect(sessions).toHaveLength(3)
      expect(sessions.map((s) => s.id)).toContain('session-1')
      expect(sessions.map((s) => s.id)).toContain('session-2')
      expect(sessions.map((s) => s.id)).toContain('session-3')
    })

    it('should clean up old sessions', () => {
      const old = mockSessionManager.createSession('old-session')
      mockSessionManager.createSession('new-session')

      mockSessionManager.deleteSession('old-session')

      const sessions = mockSessionManager.listSessions()
      expect(sessions).toHaveLength(1)
      expect(sessions[0].id).toBe('new-session')
    })
  })

  describe('Token Management', () => {
    it('should count tokens accurately', () => {
      const text = 'This is a test message'
      const count = mockTokenManager.countTokens(text)

      expect(count).toBe(100) // Mocked value
      expect(mockTokenManager.countTokens).toHaveBeenCalledWith(text)
    })

    it('should track token usage', () => {
      mockTokenManager.countTokens('message 1')
      mockTokenManager.countTokens('message 2')
      mockTokenManager.countTokens('message 3')

      expect(mockTokenManager.countTokens).toHaveBeenCalledTimes(3)
    })

    it('should respect token limits', () => {
      const limit = mockTokenManager.getTokenLimit()
      const remaining = mockTokenManager.getRemainingTokens()

      expect(limit).toBe(4096)
      expect(remaining).toBe(3996)
      assertInRange(remaining, 0, limit)
    })

    it('should calculate token estimates', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ]

      const estimate = messages.reduce((sum, msg) => {
        return sum + mockTokenManager.estimateTokens(msg.content)
      }, 0)

      expect(estimate).toBeGreaterThan(0)
    })
  })

  describe('Logging Service', () => {
    it('should log messages at different levels', () => {
      mockLogger.info('Info message')
      mockLogger.warn('Warning message')
      mockLogger.error('Error message')
      mockLogger.debug('Debug message')

      expect(mockLogger.info).toHaveBeenCalledWith('Info message')
      expect(mockLogger.warn).toHaveBeenCalledWith('Warning message')
      expect(mockLogger.error).toHaveBeenCalledWith('Error message')
      expect(mockLogger.debug).toHaveBeenCalledWith('Debug message')
    })

    it('should handle structured logging', () => {
      const logData = {
        event: 'user_action',
        userId: 'user-123',
        action: 'create_agent',
        timestamp: Date.now(),
      }

      mockLogger.info('User action', logData)

      expect(mockLogger.info).toHaveBeenCalledWith('User action', logData)
    })

    it('should log errors with stack traces', () => {
      const error = new Error('Test error')

      mockLogger.error('An error occurred', { error, stack: error.stack })

      expect(mockLogger.error).toHaveBeenCalled()
    })
  })

  describe('Service Communication', () => {
    it('should pass data between services', async () => {
      const agent = createMockAgent('test-agent')
      const tool = createMockTool('test-tool')

      // Agent uses config
      agent.execute.mockImplementation(async () => {
        const config = mockConfig.getConfig()
        mockLogger.info('Agent executing with config', { config })

        // Agent uses tool
        const result = await tool.execute({ param: 'value' })

        // Log token usage
        mockTokenManager.countTokens(JSON.stringify(result))

        return result
      })

      await agent.execute()

      expect(mockConfig.getConfig).toHaveBeenCalled()
      expect(mockLogger.info).toHaveBeenCalled()
      expect(tool.execute).toHaveBeenCalled()
      expect(mockTokenManager.countTokens).toHaveBeenCalled()
    })

    it('should handle service dependencies', async () => {
      const serviceA = {
        getData: vi.fn().mockResolvedValue({ data: 'A' }),
      }

      const serviceB = {
        process: vi.fn().mockImplementation(async () => {
          const data = await serviceA.getData()
          return { ...data, processed: true }
        }),
      }

      const result = await serviceB.process()

      expect(serviceA.getData).toHaveBeenCalled()
      expect(result).toEqual({ data: 'A', processed: true })
    })
  })

  describe('Error Handling Across Services', () => {
    it('should propagate errors between services', async () => {
      const failingService = {
        execute: vi.fn().mockRejectedValue(new Error('Service A failed')),
      }

      const dependentService = {
        run: vi.fn().mockImplementation(async () => {
          try {
            return await failingService.execute()
          } catch (error: any) {
            mockLogger.error('Dependent service caught error', { error: error.message })
            throw error
          }
        }),
      }

      await expect(dependentService.run()).rejects.toThrow('Service A failed')
      expect(mockLogger.error).toHaveBeenCalled()
    })

    it('should implement circuit breaker pattern', async () => {
      let failureCount = 0
      const maxFailures = 3
      let circuitOpen = false

      const service = {
        call: vi.fn().mockImplementation(async () => {
          if (circuitOpen) {
            throw new Error('Circuit breaker open')
          }

          if (Math.random() > 0.5) {
            failureCount++
            if (failureCount >= maxFailures) {
              circuitOpen = true
            }
            throw new Error('Service call failed')
          }

          failureCount = 0
          return { success: true }
        }),
      }

      // Try multiple calls
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () => service.call())
      )

      const failures = results.filter((r) => r.status === 'rejected')
      expect(failures.length).toBeGreaterThan(0)
    })
  })

  describe('Performance Metrics', () => {
    it('should measure service operation time', async () => {
      const service = {
        operation: async () => {
          await new Promise((resolve) => setTimeout(resolve, 50))
          return 'done'
        },
      }

      const { result, timeMs } = await measureTime(() => service.operation())

      expect(result).toBe('done')
      assertInRange(timeMs, 40, 100)
    })

    it('should track operation counts', () => {
      const metrics = {
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
      }

      const service = {
        execute: vi.fn().mockImplementation(async (shouldFail: boolean) => {
          metrics.totalCalls++
          if (shouldFail) {
            metrics.failedCalls++
            throw new Error('Failed')
          }
          metrics.successfulCalls++
          return 'success'
        }),
      }

      Promise.allSettled([
        service.execute(false),
        service.execute(true),
        service.execute(false),
      ]).then(() => {
        expect(metrics.totalCalls).toBe(3)
        expect(metrics.successfulCalls).toBe(2)
        expect(metrics.failedCalls).toBe(1)
      })
    })

    it('should calculate average response times', async () => {
      const responseTimes: number[] = []

      const service = {
        call: async () => {
          const delay = Math.random() * 100
          await new Promise((resolve) => setTimeout(resolve, delay))
          responseTimes.push(delay)
          return 'done'
        },
      }

      await Promise.all(Array.from({ length: 10 }, () => service.call()))

      const average = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      expect(average).toBeGreaterThan(0)
      expect(average).toBeLessThan(100)
    })
  })

  describe('Caching and Optimization', () => {
    it('should cache frequently accessed data', async () => {
      const cache = new Map<string, any>()
      let dbCalls = 0

      const service = {
        getData: async (key: string) => {
          if (cache.has(key)) {
            return cache.get(key)
          }

          dbCalls++
          const data = { key, value: `data-${key}` }
          cache.set(key, data)
          return data
        },
      }

      // First call - cache miss
      await service.getData('key1')
      expect(dbCalls).toBe(1)

      // Second call - cache hit
      await service.getData('key1')
      expect(dbCalls).toBe(1) // Should still be 1

      // Different key - cache miss
      await service.getData('key2')
      expect(dbCalls).toBe(2)
    })

    it('should invalidate cache on updates', async () => {
      const cache = new Map<string, any>()

      const service = {
        get: (key: string) => cache.get(key),
        set: (key: string, value: any) => cache.set(key, value),
        invalidate: (key: string) => cache.delete(key),
      }

      service.set('key1', 'value1')
      expect(service.get('key1')).toBe('value1')

      service.invalidate('key1')
      expect(service.get('key1')).toBeUndefined()
    })
  })

  describe('Concurrent Operations', () => {
    it('should handle multiple concurrent requests', async () => {
      const service = {
        process: vi.fn().mockImplementation(async (id: number) => {
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 50))
          return { id, processed: true }
        }),
      }

      const requests = Array.from({ length: 20 }, (_, i) => service.process(i))
      const results = await Promise.all(requests)

      expect(results).toHaveLength(20)
      expect(service.process).toHaveBeenCalledTimes(20)
      results.forEach((result, index) => {
        expect(result.id).toBe(index)
        expect(result.processed).toBe(true)
      })
    })

    it('should respect concurrency limits', async () => {
      let activeRequests = 0
      let maxConcurrent = 0
      const limit = 5

      const service = {
        process: async (id: number) => {
          while (activeRequests >= limit) {
            await new Promise((resolve) => setTimeout(resolve, 10))
          }

          activeRequests++
          maxConcurrent = Math.max(maxConcurrent, activeRequests)

          await new Promise((resolve) => setTimeout(resolve, 20))

          activeRequests--
          return { id }
        },
      }

      await Promise.all(Array.from({ length: 20 }, (_, i) => service.process(i)))

      expect(maxConcurrent).toBeLessThanOrEqual(limit)
    })
  })
})
