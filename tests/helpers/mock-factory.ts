/**
 * Mock Factory - Centralized mock creation for tests
 */

import type { Mock } from 'vitest'
import { vi } from 'vitest'

/**
 * Create a mock AI provider
 */
export function createMockAIProvider() {
  return {
    chat: vi.fn().mockResolvedValue({
      content: 'Mocked AI response',
      model: 'mock-model',
      usage: { inputTokens: 10, outputTokens: 20 },
    }),
    stream: vi.fn(),
    listModels: vi.fn().mockResolvedValue(['mock-model-1', 'mock-model-2']),
    validateApiKey: vi.fn().mockResolvedValue(true),
  }
}

/**
 * Create a mock agent
 */
export function createMockAgent(id = 'test-agent') {
  return {
    id,
    name: `Test Agent ${id}`,
    description: 'A test agent for unit testing',
    execute: vi.fn().mockResolvedValue({
      success: true,
      result: 'Agent execution successful',
    }),
    initialize: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
    getState: vi.fn().mockReturnValue({ initialized: true, active: true }),
  }
}

/**
 * Create a mock tool
 */
export function createMockTool(name = 'test-tool') {
  return {
    name,
    description: `Test tool: ${name}`,
    schema: {
      type: 'object',
      properties: {
        param1: { type: 'string' },
      },
    },
    execute: vi.fn().mockResolvedValue({
      success: true,
      data: 'Tool execution successful',
    }),
  }
}

/**
 * Create a mock config manager
 */
export function createMockConfigManager() {
  const config = {
    apiKey: 'test-api-key',
    model: 'claude-3-5-sonnet',
    temperature: 0.7,
    maxTokens: 4096,
  }

  return {
    getConfig: vi.fn().mockReturnValue(config),
    setConfig: vi.fn().mockImplementation((newConfig) => {
      Object.assign(config, newConfig)
    }),
    hasValidConfig: vi.fn().mockReturnValue(true),
    validateConfig: vi.fn().mockReturnValue({ valid: true }),
    reset: vi.fn(),
    config,
  }
}

/**
 * Create a mock file system
 */
export function createMockFileSystem() {
  const files = new Map<string, string>()

  return {
    readFile: vi.fn().mockImplementation((path: string) => {
      if (files.has(path)) {
        return Promise.resolve(files.get(path))
      }
      return Promise.reject(new Error(`File not found: ${path}`))
    }),
    writeFile: vi.fn().mockImplementation((path: string, content: string) => {
      files.set(path, content)
      return Promise.resolve()
    }),
    exists: vi.fn().mockImplementation((path: string) => {
      return Promise.resolve(files.has(path))
    }),
    readdir: vi.fn().mockResolvedValue([]),
    mkdir: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockImplementation((path: string) => {
      files.delete(path)
      return Promise.resolve()
    }),
    files,
  }
}

/**
 * Create a mock chat manager
 */
export function createMockChatManager() {
  const messages: any[] = []

  return {
    sendMessage: vi.fn().mockImplementation((message: string) => {
      messages.push({ role: 'user', content: message })
      const response = { role: 'assistant', content: `Response to: ${message}` }
      messages.push(response)
      return Promise.resolve(response)
    }),
    getHistory: vi.fn().mockImplementation(() => messages),
    clearHistory: vi.fn().mockImplementation(() => {
      messages.length = 0
    }),
    streamMessage: vi.fn(),
    messages,
  }
}

/**
 * Create a mock orchestrator
 */
export function createMockOrchestrator() {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    processRequest: vi.fn().mockResolvedValue({
      success: true,
      response: 'Request processed successfully',
    }),
    startServices: vi.fn().mockResolvedValue({ success: true }),
    stopServices: vi.fn().mockResolvedValue(undefined),
    getState: vi.fn().mockReturnValue({
      initialized: true,
      servicesRunning: true,
    }),
    getServices: vi.fn().mockReturnValue({}),
    cleanup: vi.fn().mockResolvedValue(undefined),
  }
}

/**
 * Create a mock logger
 */
export function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  }
}

/**
 * Create a mock token manager
 */
export function createMockTokenManager() {
  return {
    countTokens: vi.fn().mockReturnValue(100),
    estimateTokens: vi.fn().mockReturnValue(100),
    getTokenLimit: vi.fn().mockReturnValue(4096),
    getRemainingTokens: vi.fn().mockReturnValue(3996),
    resetCount: vi.fn(),
  }
}

/**
 * Create a mock session manager
 */
export function createMockSessionManager() {
  const sessions = new Map()

  return {
    createSession: vi.fn().mockImplementation((id: string) => {
      const session = { id, createdAt: Date.now(), data: {} }
      sessions.set(id, session)
      return session
    }),
    getSession: vi.fn().mockImplementation((id: string) => sessions.get(id)),
    updateSession: vi.fn(),
    deleteSession: vi.fn().mockImplementation((id: string) => {
      sessions.delete(id)
    }),
    listSessions: vi.fn().mockImplementation(() => Array.from(sessions.values())),
    sessions,
  }
}

/**
 * Create a spy that tracks all calls with detailed information
 */
export function createDetailedSpy<T extends (...args: any[]) => any>(
  implementation?: T
): Mock<T> & { getCallDetails: () => any[] } {
  const calls: any[] = []
  const spy = vi.fn((...args: any[]) => {
    const callInfo = {
      args,
      timestamp: Date.now(),
      result: undefined as any,
      error: undefined as any,
    }

    try {
      const result = implementation ? implementation(...args) : undefined
      callInfo.result = result
      calls.push(callInfo)
      return result
    } catch (error) {
      callInfo.error = error
      calls.push(callInfo)
      throw error
    }
  }) as any

  spy.getCallDetails = () => calls

  return spy
}
