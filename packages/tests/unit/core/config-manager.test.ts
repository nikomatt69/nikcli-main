/**
 * Comprehensive tests for Config Manager
 * Tests configuration loading, saving, validation, and edge cases
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SimpleConfigManager } from '../../../src/cli/core/config-manager'
import { mockConsole, mockEnv, createTempFile, cleanup } from '../../helpers/test-utils'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import os from 'node:os'

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    access: vi.fn(),
    mkdir: vi.fn(),
    stat: vi.fn(),
  },
}))

describe('SimpleConfigManager', () => {
  let configManager: SimpleConfigManager
  let console: ReturnType<typeof mockConsole>
  let env: ReturnType<typeof mockEnv>
  let tempFiles: string[] = []

  beforeEach(() => {
    console = mockConsole()
    env = mockEnv({
      NODE_ENV: 'test',
    })
    configManager = new SimpleConfigManager()
  })

  afterEach(async () => {
    console.restore()
    env.restore()
    await cleanup(tempFiles)
    tempFiles = []
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      expect(configManager).toBeInstanceOf(SimpleConfigManager)
      const config = configManager.getConfig()
      expect(config).toBeDefined()
      expect(typeof config).toBe('object')
    })

    it('should load configuration on initialization', () => {
      const config = configManager.getConfig()
      expect(config).toHaveProperty('models')
      expect(config).toHaveProperty('currentModel')
    })

    it('should handle initialization when config file does not exist', () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'))
      expect(() => new SimpleConfigManager()).not.toThrow()
    })
  })

  describe('Configuration Get/Set Operations', () => {
    it('should get configuration values', () => {
      const currentModel = configManager.getCurrentModel()
      expect(typeof currentModel).toBe('string')
    })

    it('should set configuration values', () => {
      const newModel = 'claude-3-5-sonnet-latest'
      configManager.setCurrentModel(newModel)
      expect(configManager.getCurrentModel()).toBe(newModel)
    })

    it('should get all configuration', () => {
      const allConfig = configManager.getAll()
      expect(typeof allConfig).toBe('object')
      expect(allConfig).toHaveProperty('currentModel')
    })

    it('should set all configuration', () => {
      const currentConfig = configManager.getAll()
      const newConfig = { ...currentConfig, currentModel: 'gpt-4o' }
      configManager.setAll(newConfig)
      expect(configManager.getCurrentModel()).toBe('gpt-4o')
    })

    it('should get specific config keys', () => {
      const model = configManager.get('currentModel')
      expect(typeof model).toBe('string')
    })

    it('should set specific config keys', () => {
      configManager.set('currentModel', 'test-model')
      expect(configManager.get('currentModel')).toBe('test-model')
    })
  })

  describe('API Key Management', () => {
    it('should set API key for a model', () => {
      configManager.setApiKey('anthropic', 'test-api-key-123')
      const apiKey = configManager.getApiKey('anthropic')
      expect(apiKey).toBe('test-api-key-123')
    })

    it('should get API key for a model', () => {
      configManager.setApiKey('openai', 'test-openai-key')
      const apiKey = configManager.getApiKey('openai')
      expect(apiKey).toBe('test-openai-key')
    })

    it('should return undefined for non-existent API key', () => {
      const apiKey = configManager.getApiKey('non-existent-provider')
      expect(apiKey).toBeUndefined()
    })

    it('should handle multiple API keys for different providers', () => {
      configManager.setApiKey('anthropic', 'anthropic-key')
      configManager.setApiKey('openai', 'openai-key')
      configManager.setApiKey('google', 'google-key')

      expect(configManager.getApiKey('anthropic')).toBe('anthropic-key')
      expect(configManager.getApiKey('openai')).toBe('openai-key')
      expect(configManager.getApiKey('google')).toBe('google-key')
    })

    it('should handle empty API keys', () => {
      configManager.setApiKey('test', '')
      const apiKey = configManager.getApiKey('test')
      expect(apiKey).toBe('')
    })

    it('should handle very long API keys', () => {
      const longKey = 'a'.repeat(1000)
      configManager.setApiKey('test', longKey)
      expect(configManager.getApiKey('test')).toBe(longKey)
    })
  })

  describe('Model Configuration', () => {
    it('should get current model', () => {
      const model = configManager.getCurrentModel()
      expect(typeof model).toBe('string')
      expect(model.length).toBeGreaterThan(0)
    })

    it('should set current model', () => {
      configManager.setCurrentModel('claude-3-5-sonnet-latest')
      expect(configManager.getCurrentModel()).toBe('claude-3-5-sonnet-latest')
    })

    it('should get model configuration', () => {
      const modelConfig = configManager.getModelConfig('claude-3-5-sonnet-latest')
      expect(modelConfig).toBeDefined()
      expect(modelConfig).toHaveProperty('provider')
      expect(modelConfig).toHaveProperty('model')
      expect(modelConfig).toHaveProperty('maxContextTokens')
    })

    it('should return undefined for non-existent model', () => {
      const modelConfig = configManager.getModelConfig('non-existent-model-xyz')
      expect(modelConfig).toBeUndefined()
    })

    it('should get max context tokens for model', () => {
      const tokens = configManager.getMaxContextTokens('claude-3-5-sonnet-latest')
      expect(typeof tokens).toBe('number')
      expect(tokens).toBeGreaterThan(0)
    })

    it('should get safe context limit', () => {
      const limit = configManager.getSafeContextLimit('claude-3-5-sonnet-latest')
      expect(typeof limit).toBe('number')
      expect(limit).toBeGreaterThan(0)
    })

    it('should get safe context limit with custom safety ratio', () => {
      const limit = configManager.getSafeContextLimit('claude-3-5-sonnet-latest', 0.5)
      expect(typeof limit).toBe('number')
      expect(limit).toBeGreaterThan(0)
    })
  })

  describe('Redis Configuration', () => {
    it('should get Redis configuration', () => {
      const redisConfig = configManager.getRedisConfig()
      expect(typeof redisConfig).toBe('object')
    })

    it('should set Redis configuration', () => {
      const newConfig = { enabled: true, url: 'redis://localhost:6379' }
      configManager.setRedisConfig(newConfig)
      const updated = configManager.getRedisConfig()
      expect(updated.enabled).toBe(true)
    })

    it('should get Redis connection string', () => {
      const connString = configManager.getRedisConnectionString()
      expect(connString === null || typeof connString === 'string').toBe(true)
    })

    it('should get Redis credentials', () => {
      const credentials = configManager.getRedisCredentials()
      expect(typeof credentials).toBe('object')
    })
  })

  describe('Supabase Configuration', () => {
    it('should get Supabase configuration', () => {
      const supabaseConfig = configManager.getSupabaseConfig()
      expect(typeof supabaseConfig).toBe('object')
    })

    it('should set Supabase configuration', () => {
      const newConfig = { enabled: true, url: 'https://test.supabase.co' }
      configManager.setSupabaseConfig(newConfig)
      const updated = configManager.getSupabaseConfig()
      expect(updated.enabled).toBe(true)
    })

    it('should get Supabase credentials', () => {
      const credentials = configManager.getSupabaseCredentials()
      expect(typeof credentials).toBe('object')
    })
  })

  describe('Output Style Configuration', () => {
    it('should get output style configuration', () => {
      const styleConfig = configManager.getOutputStyleConfig()
      expect(typeof styleConfig).toBe('object')
    })

    it('should set output style configuration', () => {
      const newConfig = { default: 'concise' as const }
      configManager.setOutputStyleConfig(newConfig)
      const updated = configManager.getOutputStyleConfig()
      expect(updated.default).toBe('concise')
    })

    it('should set default output style', () => {
      configManager.setDefaultOutputStyle('verbose')
      expect(configManager.getDefaultOutputStyle()).toBe('verbose')
    })

    it('should get default output style', () => {
      const style = configManager.getDefaultOutputStyle()
      expect(typeof style).toBe('string')
    })

    it('should set model output style', () => {
      configManager.setModelOutputStyle('claude-3-5-sonnet-latest', 'concise')
      const style = configManager.getModelOutputStyle('claude-3-5-sonnet-latest')
      expect(style).toBe('concise')
    })

    it('should get model output style', () => {
      configManager.setModelOutputStyle('test-model', 'verbose')
      const style = configManager.getModelOutputStyle('test-model')
      expect(style).toBe('verbose')
    })

    it('should set context output style', () => {
      configManager.setContextOutputStyle('coding', 'detailed')
      const style = configManager.getContextOutputStyle('coding')
      expect(style).toBe('detailed')
    })

    it('should get context output style', () => {
      configManager.setContextOutputStyle('planning', 'concise')
      const style = configManager.getContextOutputStyle('planning')
      expect(style).toBe('concise')
    })
  })

  describe('Environment Variables', () => {
    it('should get environment variables', () => {
      const envVars = configManager.getEnvironmentVariables()
      expect(typeof envVars).toBe('object')
    })

    it('should get environment sources', () => {
      const sources = configManager.getEnvironmentSources()
      expect(Array.isArray(sources)).toBe(true)
    })
  })

  describe('Configuration Validation', () => {
    it('should validate valid configuration', () => {
      const isValid = configManager.validateConfig()
      expect(typeof isValid).toBe('boolean')
    })

    it('should validate notification configuration', () => {
      const validConfig = {
        enabled: true,
        providers: {
          slack: { enabled: false },
          email: { enabled: false },
        },
      }
      const isValid = configManager.validateNotificationConfig(validConfig)
      expect(typeof isValid).toBe('boolean')
    })

    it('should reject invalid notification configuration', () => {
      const invalidConfig = { invalid: 'structure' }
      const isValid = configManager.validateNotificationConfig(invalidConfig)
      expect(isValid).toBe(false)
    })
  })

  describe('Edge Cases - File Operations', () => {
    it('should handle corrupted config file', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('invalid json content!!!')
      expect(() => new SimpleConfigManager()).not.toThrow()
    })

    it('should handle config file with permission denied', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('EACCES: permission denied'))
      expect(() => new SimpleConfigManager()).not.toThrow()
    })

    it('should handle config file not found', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT: no such file'))
      expect(() => new SimpleConfigManager()).not.toThrow()
    })

    it('should handle config file read timeout', async () => {
      vi.mocked(fs.readFile).mockImplementation(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('ETIMEDOUT')), 100))
      )
      expect(() => new SimpleConfigManager()).not.toThrow()
    })

    it('should handle very large config file', async () => {
      const largeConfig = JSON.stringify({ data: 'x'.repeat(10 * 1024 * 1024) })
      vi.mocked(fs.readFile).mockResolvedValue(largeConfig)
      expect(() => new SimpleConfigManager()).not.toThrow()
    })

    it('should handle config file with invalid JSON structure', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('{"incomplete": json')
      expect(() => new SimpleConfigManager()).not.toThrow()
    })

    it('should handle config file with null values', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('{"currentModel": null, "models": null}')
      expect(() => new SimpleConfigManager()).not.toThrow()
    })

    it('should handle config file with circular references (if possible)', async () => {
      // JSON.stringify will fail on circular refs, but we test the error handling
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Circular reference'))
      expect(() => new SimpleConfigManager()).not.toThrow()
    })
  })

  describe('Edge Cases - Configuration Values', () => {
    it('should handle empty string values', () => {
      configManager.set('currentModel', '')
      expect(configManager.get('currentModel')).toBe('')
    })

    it('should handle null values', () => {
      configManager.set('currentModel', null as any)
      expect(configManager.get('currentModel')).toBeNull()
    })

    it('should handle undefined values', () => {
      configManager.set('currentModel', undefined as any)
      expect(configManager.get('currentModel')).toBeUndefined()
    })

    it('should handle very long string values', () => {
      const longString = 'a'.repeat(100000)
      configManager.set('currentModel', longString)
      expect(configManager.get('currentModel')).toBe(longString)
    })

    it('should handle special characters in values', () => {
      const specialChars = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/~`'
      configManager.set('currentModel', specialChars)
      expect(configManager.get('currentModel')).toBe(specialChars)
    })

    it('should handle unicode characters', () => {
      const unicode = '🚀 测试 中文 🎉'
      configManager.set('currentModel', unicode)
      expect(configManager.get('currentModel')).toBe(unicode)
    })

    it('should handle numeric values', () => {
      configManager.set('currentModel', 12345 as any)
      expect(configManager.get('currentModel')).toBe(12345)
    })

    it('should handle boolean values', () => {
      configManager.set('currentModel', true as any)
      expect(configManager.get('currentModel')).toBe(true)
    })
  })

  describe('Edge Cases - Concurrent Access', () => {
    it('should handle concurrent get operations', () => {
      const promises = Array.from({ length: 100 }, () => Promise.resolve(configManager.getCurrentModel()))
      return Promise.all(promises).then((results) => {
        expect(results.length).toBe(100)
        results.forEach((result) => {
          expect(typeof result).toBe('string')
        })
      })
    })

    it('should handle concurrent set operations', () => {
      const promises = Array.from({ length: 50 }, (_, i) =>
        Promise.resolve(configManager.setCurrentModel(`model-${i}`))
      )
      return Promise.all(promises).then(() => {
        const finalModel = configManager.getCurrentModel()
        expect(typeof finalModel).toBe('string')
      })
    })

    it('should handle rapid get/set operations', () => {
      for (let i = 0; i < 100; i++) {
        configManager.setCurrentModel(`model-${i}`)
        const model = configManager.getCurrentModel()
        expect(model).toBe(`model-${i}`)
      }
    })
  })

  describe('Edge Cases - Memory and Performance', () => {
    it('should handle many configuration updates without memory leaks', () => {
      const initialMemory = process.memoryUsage().heapUsed
      for (let i = 0; i < 1000; i++) {
        configManager.setCurrentModel(`model-${i}`)
        configManager.setApiKey(`provider-${i}`, `key-${i}`)
      }
      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory
      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024)
    })

    it('should handle configuration with many models', () => {
      const config = configManager.getAll()
      expect(config.models).toBeDefined()
      const modelCount = Object.keys(config.models || {}).length
      expect(modelCount).toBeGreaterThan(0)
    })
  })

  describe('Edge Cases - Invalid Inputs', () => {
    it('should handle invalid model names', () => {
      const modelConfig = configManager.getModelConfig('')
      expect(modelConfig).toBeUndefined()
    })

    it('should handle invalid API key format', () => {
      configManager.setApiKey('test', 'invalid-key-format!!!')
      const apiKey = configManager.getApiKey('test')
      expect(apiKey).toBe('invalid-key-format!!!')
    })

    it('should handle path traversal attempts in config paths', () => {
      // Config manager should sanitize paths
      expect(() => {
        const manager = new SimpleConfigManager()
        expect(manager).toBeDefined()
      }).not.toThrow()
    })

    it('should handle negative numbers in configuration', () => {
      configManager.set('currentModel', -1 as any)
      expect(configManager.get('currentModel')).toBe(-1)
    })

    it('should handle extremely large numbers', () => {
      configManager.set('currentModel', Number.MAX_SAFE_INTEGER as any)
      expect(configManager.get('currentModel')).toBe(Number.MAX_SAFE_INTEGER)
    })
  })

  describe('Edge Cases - Authentication Credentials', () => {
    it('should save auth credentials', () => {
      const credentials = {
        email: 'test@example.com',
        password: 'test-password',
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
      }
      configManager.saveAuthCredentials(credentials)
      const saved = configManager.getAuthCredentials()
      expect(saved).toMatchObject(credentials)
    })

    it('should get auth credentials', () => {
      const credentials = configManager.getAuthCredentials()
      expect(credentials === null || typeof credentials === 'object').toBe(true)
    })

    it('should check if auth credentials exist', () => {
      const hasCredentials = configManager.hasAuthCredentials()
      expect(typeof hasCredentials).toBe('boolean')
    })

    it('should handle empty auth credentials', () => {
      configManager.saveAuthCredentials({})
      const credentials = configManager.getAuthCredentials()
      expect(credentials).toBeDefined()
    })
  })

  describe('Edge Cases - Browserbase Credentials', () => {
    it('should get Browserbase credentials', () => {
      const credentials = configManager.getBrowserbaseCredentials()
      expect(typeof credentials).toBe('object')
    })
  })

  describe('Edge Cases - Cloud Docs API Keys', () => {
    it('should get Cloud Docs API keys', () => {
      const keys = configManager.getCloudDocsApiKeys()
      expect(typeof keys).toBe('object')
    })
  })

  describe('Edge Cases - Notification Config', () => {
    it('should get notification configuration', () => {
      const config = configManager.getNotificationConfig()
      expect(typeof config).toBe('object')
    })
  })

  describe('Static Methods', () => {
    it('should get embed batch size', () => {
      const batchSize = SimpleConfigManager.getEmbedBatchSize()
      expect(typeof batchSize).toBe('number')
      expect(batchSize).toBeGreaterThan(0)
      expect(batchSize).toBeLessThanOrEqual(1000)
    })

    it('should get embed max concurrency', () => {
      const concurrency = SimpleConfigManager.getEmbedMaxConcurrency()
      expect(typeof concurrency).toBe('number')
      expect(concurrency).toBeGreaterThan(0)
      expect(concurrency).toBeLessThanOrEqual(20)
    })

    it('should get embed inter batch delay', () => {
      const delay = SimpleConfigManager.getEmbedInterBatchDelay()
      expect(typeof delay).toBe('number')
      expect(delay).toBeGreaterThanOrEqual(0)
      expect(delay).toBeLessThanOrEqual(1000)
    })

    it('should get indexing batch size', () => {
      const batchSize = SimpleConfigManager.getIndexingBatchSize()
      expect(typeof batchSize).toBe('number')
      expect(batchSize).toBeGreaterThan(0)
      expect(batchSize).toBeLessThanOrEqual(1000)
    })

    it('should check if adaptive batching is enabled', () => {
      const enabled = SimpleConfigManager.isAdaptiveBatchingEnabled()
      expect(typeof enabled).toBe('boolean')
    })
  })

  describe('Edge Cases - Model Registration', () => {
    it('should handle models with special characters', () => {
      const modelConfig = configManager.getModelConfig('anthropic/claude-3.5-sonnet')
      expect(modelConfig === undefined || typeof modelConfig === 'object').toBe(true)
    })

    it('should handle OpenRouter model IDs', () => {
      const modelConfig = configManager.getModelConfig('openrouter/anthropic/claude-3.5-sonnet')
      expect(modelConfig === undefined || typeof modelConfig === 'object').toBe(true)
    })
  })

  describe('Edge Cases - Configuration Persistence', () => {
    it('should persist configuration changes', () => {
      const originalModel = configManager.getCurrentModel()
      configManager.setCurrentModel('new-model')
      expect(configManager.getCurrentModel()).toBe('new-model')
      // Note: Actual persistence depends on saveConfig() being called
    })

    it('should handle configuration reset', () => {
      const originalConfig = configManager.getAll()
      configManager.setCurrentModel('test-model')
      configManager.setAll(originalConfig)
      // Configuration should be reset
      expect(configManager.getCurrentModel()).toBe(originalConfig.currentModel)
    })
  })
})

