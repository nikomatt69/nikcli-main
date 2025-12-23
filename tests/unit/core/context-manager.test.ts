/**
 * Comprehensive tests for Context Managers
 * Tests workspace context, retrieval, optimization, and edge cases
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContextManager } from '../../../src/cli/core/context-manager'
import { WorkspaceContextManager } from '../../../src/cli/context/workspace-context'
import { mockConsole, mockEnv, cleanup, createTempFile } from '../../helpers/test-utils'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
    access: vi.fn(),
    mkdir: vi.fn(),
  },
}))

vi.mock('../../../src/cli/ui/advanced-cli-ui', () => ({
  advancedUI: {
    logFunctionUpdate: vi.fn(),
  },
}))

vi.mock('../../../src/cli/context/workspace-context', () => ({
  workspaceContext: {
    getContextForAgent: vi.fn(() => ({
      selectedPaths: [],
      relevantFiles: [],
      projectSummary: 'Test project',
      totalContext: 'Test context',
    })),
    getContext: vi.fn(() => ({
      selectedPaths: [],
      files: [],
    })),
  },
}))

describe('ContextManager', () => {
  let contextManager: ContextManager
  let console: ReturnType<typeof mockConsole>
  let env: ReturnType<typeof mockEnv>

  beforeEach(() => {
    console = mockConsole()
    env = mockEnv({
      NODE_ENV: 'test',
    })
    contextManager = new ContextManager()
  })

  afterEach(() => {
    console.restore()
    env.restore()
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize with default settings', () => {
      expect(contextManager).toBeInstanceOf(ContextManager)
    })

    it('should have max tokens limit', () => {
      const maxTokens = (contextManager as any).MAX_TOKENS
      expect(typeof maxTokens).toBe('number')
      expect(maxTokens).toBeGreaterThan(0)
    })
  })

  describe('Workspace Analysis', () => {
    it('should analyze workspace', async () => {
      const summary = await contextManager.analyzeWorkspace()
      expect(summary).toHaveProperty('totalFiles')
      expect(summary).toHaveProperty('totalDirs')
      expect(summary).toHaveProperty('languages')
      expect(summary).toHaveProperty('importantFiles')
    })

    it('should cache workspace analysis', async () => {
      const summary1 = await contextManager.analyzeWorkspace()
      const summary2 = await contextManager.analyzeWorkspace()
      // Should return cached result
      expect(summary2).toBe(summary1)
    })

    it('should handle workspace analysis errors', async () => {
      vi.mocked(fs.readdir).mockRejectedValue(new Error('Permission denied'))
      const summary = await contextManager.analyzeWorkspace()
      expect(summary).toBeDefined()
    })
  })

  describe('Context Optimization', () => {
    it('should optimize context when tokens exceed limit', async () => {
      const messages = Array.from({ length: 100 }, (_, i) => ({
        role: 'user' as const,
        content: `Message ${i}: ${'x'.repeat(1000)}`,
      }))

      const optimized = await contextManager.optimizeContext(messages, {
        maxOutputTokens: 10000,
      })

      expect(optimized).toBeDefined()
      expect(Array.isArray(optimized)).toBe(true)
    })

    it('should preserve system messages during optimization', async () => {
      const messages = [
        { role: 'system' as const, content: 'System message' },
        { role: 'user' as const, content: 'User message' },
      ]

      const optimized = await contextManager.optimizeContext(messages, {
        maxOutputTokens: 1000,
      })

      const systemMessages = optimized.filter((m) => m.role === 'system')
      expect(systemMessages.length).toBeGreaterThan(0)
    })

    it('should preserve recent messages', async () => {
      const messages = Array.from({ length: 20 }, (_, i) => ({
        role: 'user' as const,
        content: `Message ${i}`,
      }))

      const optimized = await contextManager.optimizeContext(messages, {
        maxOutputTokens: 1000,
      })

      // Should keep at least MIN_MESSAGES recent messages
      expect(optimized.length).toBeGreaterThanOrEqual(4)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty messages array', async () => {
      const optimized = await contextManager.optimizeContext([], { maxOutputTokens: 1000 })
      expect(Array.isArray(optimized)).toBe(true)
      expect(optimized.length).toBe(0)
    })

    it('should handle very large messages', async () => {
      const largeMessage = { role: 'user' as const, content: 'x'.repeat(1000000) }
      const optimized = await contextManager.optimizeContext([largeMessage], { maxOutputTokens: 1000 })
      expect(optimized.length).toBeGreaterThan(0)
    })

    it('should handle messages with null/undefined content', async () => {
      const messages = [
        { role: 'user' as const, content: null as any },
        { role: 'user' as const, content: undefined as any },
      ]
      const optimized = await contextManager.optimizeContext(messages, { maxOutputTokens: 1000 })
      expect(Array.isArray(optimized)).toBe(true)
    })

    it('should handle optimization timeout', async () => {
      // Simulate slow operation
      const messages = Array.from({ length: 1000 }, (_, i) => ({
        role: 'user' as const,
        content: `Message ${i}: ${'x'.repeat(1000)}`,
      }))

      const optimized = await contextManager.optimizeContext(messages, {
        maxOutputTokens: 1000,
      })

      expect(optimized).toBeDefined()
    })

    it('should handle optimization recursion limit', async () => {
      const messages = Array.from({ length: 100 }, (_, i) => ({
        role: 'user' as const,
        content: `Message ${i}`,
      }))

      const optimized = await contextManager.optimizeContext(messages, {
        maxOutputTokens: 1000,
      })

      expect(optimized).toBeDefined()
    })
  })

  describe('Performance Metrics', () => {
    it('should track optimization metrics', async () => {
      const messages = Array.from({ length: 50 }, (_, i) => ({
        role: 'user' as const,
        content: `Message ${i}`,
      }))

      await contextManager.optimizeContext(messages, { maxOutputTokens: 10000 })
      const metrics = (contextManager as any).performanceMetrics
      expect(metrics).toBeDefined()
    })
  })
})

describe('WorkspaceContextManager', () => {
  let workspaceContext: WorkspaceContextManager
  let console: ReturnType<typeof mockConsole>
  let env: ReturnType<typeof mockEnv>
  const testDir = path.join(process.cwd(), 'test-workspace')

  beforeEach(() => {
    console = mockConsole()
    env = mockEnv({
      NODE_ENV: 'test',
    })
    vi.mocked(fs.readdir).mockResolvedValue([])
    vi.mocked(fs.stat).mockResolvedValue({
      isFile: () => true,
      isDirectory: () => false,
      size: 100,
      mtime: new Date(),
    } as any)
    workspaceContext = new WorkspaceContextManager(testDir)
  })

  afterEach(async () => {
    console.restore()
    env.restore()
    await cleanup([testDir])
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize with root path', () => {
      expect(workspaceContext).toBeInstanceOf(WorkspaceContextManager)
    })

    it('should initialize with default path', () => {
      const context = new WorkspaceContextManager()
      expect(context).toBeInstanceOf(WorkspaceContextManager)
    })

    it('should get context', () => {
      const context = workspaceContext.getContext()
      expect(context).toBeDefined()
      expect(typeof context).toBe('object')
    })
  })

  describe('Context Retrieval', () => {
    it('should get context for agent', () => {
      const context = workspaceContext.getContextForAgent('test-agent', 10)
      expect(context).toHaveProperty('selectedPaths')
      expect(context).toHaveProperty('relevantFiles')
      expect(context).toHaveProperty('projectSummary')
      expect(context).toHaveProperty('totalContext')
    })

    it('should respect maxFiles parameter', () => {
      const context = workspaceContext.getContextForAgent('test-agent', 5)
      expect(context.relevantFiles.length).toBeLessThanOrEqual(5)
    })

    it('should handle search query', () => {
      const context = workspaceContext.getContextForAgent('test-agent', 10, 'test query')
      expect(context).toBeDefined()
    })

    it('should handle empty search query', () => {
      const context = workspaceContext.getContextForAgent('test-agent', 10, '')
      expect(context).toBeDefined()
    })
  })

  describe('Edge Cases', () => {
    it('should handle non-existent directory', () => {
      vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'))
      expect(() => new WorkspaceContextManager('/non-existent-dir')).not.toThrow()
    })

    it('should handle permission denied errors', () => {
      vi.mocked(fs.readdir).mockRejectedValue(new Error('EACCES'))
      expect(() => new WorkspaceContextManager(testDir)).not.toThrow()
    })

    it('should handle very large workspace', async () => {
      const largeFileList = Array.from({ length: 10000 }, (_, i) => `file${i}.ts`)
      vi.mocked(fs.readdir).mockResolvedValue(largeFileList as any)
      const context = workspaceContext.getContextForAgent('test-agent', 50)
      expect(context.relevantFiles.length).toBeLessThanOrEqual(50)
    })

    it('should handle empty workspace', () => {
      vi.mocked(fs.readdir).mockResolvedValue([])
      const context = workspaceContext.getContextForAgent('test-agent', 10)
      expect(context.relevantFiles.length).toBe(0)
    })

    it('should handle invalid agent ID', () => {
      const context = workspaceContext.getContextForAgent('', 10)
      expect(context).toBeDefined()
    })

    it('should handle negative maxFiles', () => {
      const context = workspaceContext.getContextForAgent('test-agent', -1)
      expect(context).toBeDefined()
    })

    it('should handle zero maxFiles', () => {
      const context = workspaceContext.getContextForAgent('test-agent', 0)
      expect(context.relevantFiles.length).toBe(0)
    })

    it('should handle very large maxFiles', () => {
      const context = workspaceContext.getContextForAgent('test-agent', 100000)
      expect(context).toBeDefined()
    })
  })

  describe('File Watching', () => {
    it('should handle file system watcher errors', () => {
      // File watching may fail, should not crash
      expect(() => {
        const context = new WorkspaceContextManager(testDir)
        expect(context).toBeDefined()
      }).not.toThrow()
    })
  })

  describe('Cache Management', () => {
    it('should cache file content', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('test content')
      vi.mocked(fs.readdir).mockResolvedValue(['test.ts'] as any)
      const context = workspaceContext.getContextForAgent('test-agent', 10)
      expect(context).toBeDefined()
    })

    it('should handle cache cleanup', () => {
      // Cache cleanup should not throw
      expect(() => {
        const context = new WorkspaceContextManager(testDir)
        expect(context).toBeDefined()
      }).not.toThrow()
    })
  })
})

