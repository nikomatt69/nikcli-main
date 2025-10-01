/**
 * Unit tests for ConfigManager
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fileExists } from '../../helpers/test-utils'

// Mock the conf module
vi.mock('conf', () => {
  return {
    default: class MockConf {
      private store: Map<string, any>

      constructor() {
        this.store = new Map()
      }

      get(key: string, defaultValue?: any) {
        return this.store.get(key) ?? defaultValue
      }

      set(key: string, value: any) {
        this.store.set(key, value)
      }

      has(key: string) {
        return this.store.has(key)
      }

      delete(key: string) {
        this.store.delete(key)
      }

      clear() {
        this.store.clear()
      }

      get size() {
        return this.store.size
      }

      get store() {
        return Object.fromEntries(this.store)
      }
    },
  }
})

describe('ConfigManager', () => {
  let testConfigDir: string
  let ConfigManager: any

  beforeEach(async () => {
    // Create a temporary config directory
    testConfigDir = path.join(process.cwd(), '.test-config')
    await fs.mkdir(testConfigDir, { recursive: true })

    // Dynamic import after mocks are set up
    const module = await import('@core/config-manager')
    ConfigManager = module.ConfigManager
  })

  afterEach(async () => {
    // Clean up test config directory
    try {
      await fs.rm(testConfigDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should create a new config manager instance', () => {
      const configManager = new ConfigManager()
      expect(configManager).toBeDefined()
    })

    it('should initialize with default configuration', () => {
      const configManager = new ConfigManager()
      const config = configManager.getConfig()
      expect(config).toBeDefined()
      expect(typeof config).toBe('object')
    })
  })

  describe('Configuration Management', () => {
    it('should set and get configuration values', () => {
      const configManager = new ConfigManager()
      configManager.setConfig('apiKey', 'test-key-123')

      const apiKey = configManager.getConfig('apiKey')
      expect(apiKey).toBe('test-key-123')
    })

    it('should handle nested configuration objects', () => {
      const configManager = new ConfigManager()
      const modelConfig = {
        name: 'claude-3-5-sonnet',
        temperature: 0.7,
        maxTokens: 4096,
      }

      configManager.setConfig('model', modelConfig)
      const retrievedConfig = configManager.getConfig('model')

      expect(retrievedConfig).toEqual(modelConfig)
    })

    it('should update existing configuration values', () => {
      const configManager = new ConfigManager()
      configManager.setConfig('temperature', 0.5)
      expect(configManager.getConfig('temperature')).toBe(0.5)

      configManager.setConfig('temperature', 0.9)
      expect(configManager.getConfig('temperature')).toBe(0.9)
    })

    it('should return default value if key does not exist', () => {
      const configManager = new ConfigManager()
      const value = configManager.getConfig('nonexistent', 'default-value')
      expect(value).toBe('default-value')
    })

    it('should check if configuration key exists', () => {
      const configManager = new ConfigManager()
      configManager.setConfig('existingKey', 'value')

      expect(configManager.hasConfig('existingKey')).toBe(true)
      expect(configManager.hasConfig('nonExistentKey')).toBe(false)
    })
  })

  describe('Configuration Validation', () => {
    it('should validate API key presence', () => {
      const configManager = new ConfigManager()
      expect(configManager.hasValidConfig()).toBe(false)

      configManager.setConfig('apiKey', 'valid-api-key')
      expect(configManager.hasValidConfig()).toBe(true)
    })

    it('should validate API key format', () => {
      const configManager = new ConfigManager()

      // Test invalid API keys
      expect(configManager.validateApiKey('')).toBe(false)
      expect(configManager.validateApiKey('   ')).toBe(false)
      expect(configManager.validateApiKey('short')).toBe(false)

      // Test valid API key
      expect(configManager.validateApiKey('sk-ant-api-key-12345678')).toBe(true)
    })

    it('should validate model configuration', () => {
      const configManager = new ConfigManager()

      expect(configManager.validateModel('claude-3-5-sonnet')).toBe(true)
      expect(configManager.validateModel('gpt-4')).toBe(true)
      expect(configManager.validateModel('')).toBe(false)
    })
  })

  describe('Bulk Operations', () => {
    it('should set multiple configuration values at once', () => {
      const configManager = new ConfigManager()
      const bulkConfig = {
        apiKey: 'test-key',
        model: 'claude-3-5-sonnet',
        temperature: 0.7,
        maxTokens: 4096,
      }

      configManager.setBulkConfig(bulkConfig)

      expect(configManager.getConfig('apiKey')).toBe('test-key')
      expect(configManager.getConfig('model')).toBe('claude-3-5-sonnet')
      expect(configManager.getConfig('temperature')).toBe(0.7)
      expect(configManager.getConfig('maxTokens')).toBe(4096)
    })

    it('should get all configuration values', () => {
      const configManager = new ConfigManager()
      configManager.setConfig('key1', 'value1')
      configManager.setConfig('key2', 'value2')

      const allConfig = configManager.getAllConfig()
      expect(allConfig).toHaveProperty('key1', 'value1')
      expect(allConfig).toHaveProperty('key2', 'value2')
    })

    it('should clear all configuration', () => {
      const configManager = new ConfigManager()
      configManager.setConfig('key1', 'value1')
      configManager.setConfig('key2', 'value2')

      configManager.clearConfig()

      expect(configManager.getConfig('key1')).toBeUndefined()
      expect(configManager.getConfig('key2')).toBeUndefined()
    })
  })

  describe('Environment Variable Integration', () => {
    it('should load API key from environment', () => {
      process.env.ANTHROPIC_API_KEY = 'env-api-key'

      const configManager = new ConfigManager()
      const apiKey = configManager.getConfig('apiKey')

      expect(apiKey).toBe('env-api-key')

      delete process.env.ANTHROPIC_API_KEY
    })

    it('should prefer explicit configuration over environment', () => {
      process.env.ANTHROPIC_API_KEY = 'env-api-key'

      const configManager = new ConfigManager()
      configManager.setConfig('apiKey', 'explicit-api-key')

      expect(configManager.getConfig('apiKey')).toBe('explicit-api-key')

      delete process.env.ANTHROPIC_API_KEY
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid configuration gracefully', () => {
      const configManager = new ConfigManager()

      expect(() => {
        configManager.setConfig(null as any, 'value')
      }).not.toThrow()

      expect(() => {
        configManager.setConfig(undefined as any, 'value')
      }).not.toThrow()
    })

    it('should handle invalid get operations', () => {
      const configManager = new ConfigManager()

      expect(() => {
        configManager.getConfig(null as any)
      }).not.toThrow()

      expect(() => {
        configManager.getConfig(undefined as any)
      }).not.toThrow()
    })
  })

  describe('Configuration Persistence', () => {
    it('should persist configuration across instances', () => {
      const configManager1 = new ConfigManager()
      configManager1.setConfig('persistentKey', 'persistentValue')

      const configManager2 = new ConfigManager()
      const value = configManager2.getConfig('persistentKey')

      expect(value).toBe('persistentValue')
    })

    it('should handle configuration file creation', async () => {
      const configManager = new ConfigManager()
      configManager.setConfig('test', 'value')

      // Configuration should be stored (in memory for mocked version)
      expect(configManager.getConfig('test')).toBe('value')
    })
  })
})
