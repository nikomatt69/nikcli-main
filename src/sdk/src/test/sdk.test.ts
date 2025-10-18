/**
 * Tests for NikCLISDK
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NikCLISDK, createSDK, getSDK, initializeSDK } from '../core/sdk'
import type { SDKConfig } from '../types'

// Mock the core modules
vi.mock('../core/agent-manager', () => ({
  AgentManager: vi.fn().mockImplementation(() => ({
    registerAgent: vi.fn(),
    getAgent: vi.fn(),
    listAgents: vi.fn(() => []),
    scheduleTask: vi.fn(),
    executeTask: vi.fn(),
    getStats: vi.fn(() => ({
      totalAgents: 0,
      activeAgents: 0,
      totalTasks: 0,
      pendingTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      averageTaskDuration: 0,
    })),
    cleanup: vi.fn(),
  })),
}))

vi.mock('../core/stream-manager', () => ({
  StreamManager: vi.fn().mockImplementation(() => ({
    startStream: vi.fn(),
    stopStream: vi.fn(),
    sendMessage: vi.fn(),
    getEvents: vi.fn(() => []),
    getStats: vi.fn(() => ({
      isStreaming: false,
      totalEvents: 0,
      bufferSize: 0,
      duration: 0,
      eventsByType: {},
    })),
    cleanup: vi.fn(),
  })),
}))

describe('NikCLISDK', () => {
  let sdk: NikCLISDK

  beforeEach(() => {
    sdk = new NikCLISDK({
      apiKeys: {
        anthropic: 'test-key',
      },
      enableStreaming: true,
      enableAgents: true,
    })
  })

  describe('Initialization', () => {
    it('should create SDK instance with default config', () => {
      const sdk = new NikCLISDK()
      expect(sdk).toBeDefined()
    })

    it('should create SDK instance with custom config', () => {
      const config: Partial<SDKConfig> = {
        apiKeys: {
          anthropic: 'test-key',
        },
        enableStreaming: false,
        enableAgents: true,
      }

      const sdk = new NikCLISDK(config)
      expect(sdk).toBeDefined()
    })

    it('should initialize successfully', async () => {
      await expect(sdk.initialize()).resolves.not.toThrow()
      expect(sdk['isInitialized']).toBe(true)
    })

    it('should not initialize twice', async () => {
      await sdk.initialize()
      const consoleSpy = vi.spyOn(console, 'warn')
      
      await sdk.initialize()
      expect(consoleSpy).toHaveBeenCalledWith('SDK is already initialized')
    })
  })

  describe('Configuration', () => {
    it('should get configuration', () => {
      const config = sdk.getConfig()
      expect(config).toHaveProperty('apiKeys')
      expect(config).toHaveProperty('defaultModel')
      expect(config).toHaveProperty('workingDirectory')
    })

    it('should update configuration', () => {
      const newConfig = {
        enableStreaming: false,
        maxConcurrentTasks: 10,
      }

      sdk.updateConfig(newConfig)
      const config = sdk.getConfig()
      expect(config.enableStreaming).toBe(false)
      expect(config.maxConcurrentTasks).toBe(10)
    })
  })

  describe('Agent Management', () => {
    beforeEach(async () => {
      await sdk.initialize()
    })

    it('should get agent manager', () => {
      const agentManager = sdk.getAgentManager()
      expect(agentManager).toBeDefined()
    })

    it('should register agent', async () => {
      const agent = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'A test agent',
        specialization: 'testing',
        capabilities: [],
        maxConcurrentTasks: 1,
        timeout: 300000,
        retryAttempts: 3,
        autonomyLevel: 'supervised' as const,
      }

      await expect(sdk.registerAgent(agent)).resolves.not.toThrow()
    })

    it('should throw error when registering agent before initialization', async () => {
      const uninitializedSdk = new NikCLISDK()
      const agent = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'A test agent',
        specialization: 'testing',
        capabilities: [],
        maxConcurrentTasks: 1,
        timeout: 300000,
        retryAttempts: 3,
        autonomyLevel: 'supervised' as const,
      }

      await expect(uninitializedSdk.registerAgent(agent)).rejects.toThrow(
        'SDK must be initialized before registering agents'
      )
    })
  })

  describe('Stream Management', () => {
    beforeEach(async () => {
      await sdk.initialize()
    })

    it('should get stream manager', () => {
      const streamManager = sdk.getStreamManager()
      expect(streamManager).toBeDefined()
    })

    it('should send message', async () => {
      await expect(sdk.sendMessage('Test message')).resolves.not.toThrow()
    })

    it('should throw error when sending message before initialization', async () => {
      const uninitializedSdk = new NikCLISDK()
      await expect(uninitializedSdk.sendMessage('Test message')).rejects.toThrow(
        'SDK must be initialized before sending messages'
      )
    })

    it('should throw error when sending message with streaming disabled', async () => {
      const sdkWithoutStreaming = new NikCLISDK({ enableStreaming: false })
      await sdkWithoutStreaming.initialize()
      
      await expect(sdkWithoutStreaming.sendMessage('Test message')).rejects.toThrow(
        'Streaming is disabled'
      )
    })
  })

  describe('Task Execution', () => {
    beforeEach(async () => {
      await sdk.initialize()
    })

    it('should execute task', async () => {
      const task = {
        type: 'user_request' as const,
        title: 'Test Task',
        description: 'A test task',
        priority: 'medium' as const,
        data: { test: 'data' },
      }

      await expect(sdk.executeTask(task)).resolves.not.toThrow()
    })

    it('should throw error when executing task before initialization', async () => {
      const uninitializedSdk = new NikCLISDK()
      const task = {
        type: 'user_request' as const,
        title: 'Test Task',
        description: 'A test task',
        priority: 'medium' as const,
        data: { test: 'data' },
      }

      await expect(uninitializedSdk.executeTask(task)).rejects.toThrow(
        'SDK must be initialized before executing tasks'
      )
    })
  })

  describe('Statistics', () => {
    beforeEach(async () => {
      await sdk.initialize()
    })

    it('should get statistics', () => {
      const stats = sdk.getStats()
      expect(stats).toHaveProperty('initialized')
      expect(stats).toHaveProperty('config')
      expect(stats).toHaveProperty('agents')
      expect(stats).toHaveProperty('stream')
      expect(stats.initialized).toBe(true)
    })
  })

  describe('Cleanup', () => {
    it('should cleanup successfully', async () => {
      await sdk.initialize()
      await expect(sdk.cleanup()).resolves.not.toThrow()
    })
  })
})

describe('SDK Factory Functions', () => {
  it('should create SDK instance', () => {
    const sdk = createSDK({ enableStreaming: true })
    expect(sdk).toBeDefined()
  })

  it('should get or create default SDK instance', () => {
    const sdk1 = getSDK()
    const sdk2 = getSDK()
    expect(sdk1).toBe(sdk2)
  })

  it('should initialize default SDK', async () => {
    const sdk = await initializeSDK({ enableStreaming: true })
    expect(sdk).toBeDefined()
    expect(sdk['isInitialized']).toBe(true)
  })
})
