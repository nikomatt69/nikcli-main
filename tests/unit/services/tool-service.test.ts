/**
 * Unit tests for Tool Service - Core tool execution and management service
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToolService } from '../../../src/cli/services/tool-service'
import { cleanup, createTempFile, mockConsole } from '../../helpers/test-utils'

vi.mock('../../../src/cli/tools/secure-tools-registry', () => ({
  SecureToolsRegistry: vi.fn(() => ({
    readFile: vi.fn(() => ({ success: true, data: { content: 'mock content' } })),
    writeFile: vi.fn(() => ({ success: true })),
    executeCommand: vi.fn(() => ({ success: true, data: { stdout: 'mock output' } })),
    listDirectory: vi.fn(() => ({ success: true, data: { files: ['file1.txt'] } })),
    findFiles: vi.fn(() => ({ success: true, data: ['found-file.txt'] })),
    getAvailableTools: vi.fn(() => ['read-file', 'write-file', 'run-command']),
  })),
}))

vi.mock('../../../src/cli/core/config-manager', () => ({
  ConfigManager: vi.fn(() => ({
    getConfig: vi.fn(() => ({ toolsConfig: { safeMode: true } })),
  })),
}))

describe('ToolService', () => {
  let toolService: ToolService
  let console: ReturnType<typeof mockConsole>
  let tempFiles: string[] = []

  beforeEach(() => {
    console = mockConsole()
    toolService = new ToolService()
  })

  afterEach(async () => {
    console.restore()
    await cleanup(tempFiles)
    tempFiles = []
  })

  describe('Service Initialization', () => {
    it('should initialize with default tools', () => {
      const tools = toolService.getAvailableTools()
      expect(tools.length).toBeGreaterThan(0)
      expect(tools.some((tool) => tool.name === 'read_file')).toBe(true)
      expect(tools.some((tool) => tool.name === 'write_file')).toBe(true)
    })

    it('should register new tools', () => {
      const customTool = {
        name: 'custom-tool',
        description: 'Custom tool for testing',
        category: 'file' as const,
        handler: vi.fn().mockResolvedValue({ success: true }),
      }

      toolService.registerTool(customTool)
      const tools = toolService.getAvailableTools()
      expect(tools.some((tool) => tool.name === 'custom-tool')).toBe(true)
    })

    it('should set working directory', () => {
      const testDir = '/test/directory'
      toolService.setWorkingDirectory(testDir)
      // Note: workingDirectory is private, so we test through behavior
      expect(() => toolService.setWorkingDirectory(testDir)).not.toThrow()
    })
  })

  describe('Tool Discovery and Registration', () => {
    it('should list available tools', () => {
      const tools = toolService.getAvailableTools()
      expect(Array.isArray(tools)).toBe(true)
      expect(tools.length).toBeGreaterThan(0)

      const toolNames = tools.map((tool) => tool.name)
      expect(toolNames).toContain('read_file')
      expect(toolNames).toContain('write_file')
    })

    it('should get tool information', () => {
      const tools = toolService.getAvailableTools()
      const readFileTool = tools.find((tool) => tool.name === 'read_file')

      expect(readFileTool).toBeDefined()
      expect(readFileTool).toHaveProperty('name')
      expect(readFileTool).toHaveProperty('description')
      expect(readFileTool).toHaveProperty('category')
      expect(readFileTool).toHaveProperty('handler')
    })

    it('should validate tool existence', () => {
      const tools = toolService.getAvailableTools()
      const toolNames = tools.map((tool) => tool.name)

      expect(toolNames).toContain('read_file')
      expect(toolNames).not.toContain('non-existent-tool')
    })

    it('should categorize tools by type', () => {
      const tools = toolService.getAvailableTools()
      const categories = tools.reduce(
        (acc, tool) => {
          if (!acc[tool.category]) acc[tool.category] = []
          acc[tool.category].push(tool.name)
          return acc
        },
        {} as Record<string, string[]>
      )

      expect(categories).toHaveProperty('file')
      expect(categories).toHaveProperty('command')
      expect(categories.file).toContain('read_file')
    })
  })

  describe('Tool Execution', () => {
    it('should execute tools successfully', async () => {
      // Create a test file first
      await createTempFile('test.txt', 'test content')
      tempFiles.push('test.txt')

      const result = await toolService.executeTool('read_file', { filePath: 'test.txt' })

      expect(result).toBeDefined()
      expect(result.content).toBe('test content')
      expect(result.size).toBe(11)
    })

    it('should handle tool execution failures', async () => {
      await expect(toolService.executeTool('read_file', { filePath: 'non-existent.txt' })).rejects.toThrow(
        'File not found'
      )
    })

    it('should handle non-existent tools', async () => {
      await expect(toolService.executeTool('non-existent-tool', {})).rejects.toThrow(
        "Tool 'non-existent-tool' not found"
      )
    })
  })

  describe('Tool Parameter Validation', () => {
    it('should validate required parameters', async () => {
      await expect(toolService.executeTool('read_file', {})).rejects.toThrow()
    })

    it('should validate parameter types', async () => {
      await expect(toolService.executeTool('read_file', { filePath: 123 })).rejects.toThrow()
    })

    it('should handle valid parameters', async () => {
      await createTempFile('valid-test.txt', 'test content')
      tempFiles.push('valid-test.txt')

      const result = await toolService.executeTool('read_file', { filePath: 'valid-test.txt' })
      expect(result.content).toBe('test content')
    })
  })

  describe('Tool Execution History', () => {
    it('should track execution history', async () => {
      await createTempFile('history-test.txt', 'test content')
      tempFiles.push('history-test.txt')

      await toolService.executeTool('read_file', { filePath: 'history-test.txt' })

      const history = toolService.getExecutionHistory()
      expect(history.length).toBeGreaterThan(0)
      expect(history[0].toolName).toBe('read_file')
      expect(history[0].status).toBe('completed')
    })

    it('should track failed executions', async () => {
      try {
        await toolService.executeTool('read_file', { filePath: 'non-existent.txt' })
      } catch (_error) {
        // Expected to fail
      }

      const history = toolService.getExecutionHistory()
      const failedExecutions = history.filter((exec) => exec.status === 'failed')
      expect(failedExecutions.length).toBeGreaterThan(0)
    })
  })

  describe('Tool Execution Safety', () => {
    it('should execute tools safely with approval', async () => {
      await createTempFile('safe-test.txt', 'test content')
      tempFiles.push('safe-test.txt')

      const result = await toolService.executeToolSafely('read_file', 'read', { filePath: 'safe-test.txt' })
      expect(result.content).toBe('test content')
    })

    it('should handle safe execution failures', async () => {
      await expect(
        toolService.executeToolSafely('read_file', 'read', { filePath: 'non-existent.txt' })
      ).rejects.toThrow()
    })
  })
})
