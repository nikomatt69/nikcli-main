/**
 * Test setup for NikCLI SDK
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest'

// Mock environment variables
beforeAll(() => {
  process.env.NODE_ENV = 'test'
  process.env.ANTHROPIC_API_KEY = 'test-key'
  process.env.OPENAI_API_KEY = 'test-key'
})

// Clean up after each test
afterEach(() => {
  // Clean up any global state
  jest.clearAllMocks()
})

// Global test utilities
global.mockSDK = {
  getAgentManager: () => ({
    registerAgent: jest.fn(),
    getAgent: jest.fn(),
    listAgents: jest.fn(() => []),
    scheduleTask: jest.fn(),
    executeTask: jest.fn(),
    getStats: jest.fn(() => ({
      totalAgents: 0,
      activeAgents: 0,
      totalTasks: 0,
      pendingTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      averageTaskDuration: 0,
    })),
  }),
  getStreamManager: () => ({
    startStream: jest.fn(),
    stopStream: jest.fn(),
    sendMessage: jest.fn(),
    getEvents: jest.fn(() => []),
    getStats: jest.fn(() => ({
      isStreaming: false,
      totalEvents: 0,
      bufferSize: 0,
      duration: 0,
      eventsByType: {},
    })),
  }),
  getConfig: jest.fn(() => ({
    apiKeys: {},
    defaultModel: 'claude-3-5-sonnet-20241022',
    workingDirectory: process.cwd(),
    logLevel: 'info',
    enableStreaming: true,
    enableAgents: true,
    enableTools: true,
    maxConcurrentTasks: 5,
    defaultTimeout: 300000,
  })),
  cleanup: jest.fn(),
}

// Mock console methods in test environment
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
}