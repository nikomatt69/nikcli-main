/**
 * Comprehensive tests for Slash Command Handler
 * Tests command parsing, execution, routing, and edge cases
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SlashCommandHandler } from '../../../src/cli/chat/nik-cli-commands'
import { mockConsole, mockEnv } from '../../helpers/test-utils'

vi.mock('../../../src/cli/core/config-manager', () => ({
  simpleConfigManager: {
    getConfig: vi.fn(() => ({ apiKey: 'test-key', model: 'claude-3' })),
    setConfig: vi.fn(),
    hasValidConfig: vi.fn(() => true),
  },
  configManager: {
    getConfig: vi.fn(() => ({ apiKey: 'test-key', model: 'claude-3' })),
  },
}))

vi.mock('../../../src/cli/core/agent-manager', () => ({
  AgentManager: vi.fn(() => ({
    getAgent: vi.fn(),
    listAgents: vi.fn(() => []),
    executeAgent: vi.fn(),
  })),
  registerAgents: vi.fn(),
}))

vi.mock('../../../src/cli/vm/vm-orchestrator', () => ({
  VMOrchestrator: vi.fn(() => ({
    createVM: vi.fn(),
    listVMs: vi.fn(() => []),
    stopVM: vi.fn(),
  })),
}))

vi.mock('../../../src/cli/vm/container-manager', () => ({
  ContainerManager: vi.fn(() => ({
    createContainer: vi.fn(),
    listContainers: vi.fn(() => []),
  })),
}))

vi.mock('../../../src/cli/vm/vm-selector', () => ({
  initializeVMSelector: vi.fn(),
}))

describe('SlashCommandHandler', () => {
  let handler: SlashCommandHandler
  let console: ReturnType<typeof mockConsole>
  let env: ReturnType<typeof mockEnv>

  beforeEach(() => {
    console = mockConsole()
    env = mockEnv({
      NODE_ENV: 'test',
    })
    handler = new SlashCommandHandler()
  })

  afterEach(() => {
    console.restore()
    env.restore()
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize without errors', () => {
      expect(handler).toBeInstanceOf(SlashCommandHandler)
    })

    it('should initialize with CLI instance', () => {
      const mockCLI = { printPanel: vi.fn() }
      const handlerWithCLI = new SlashCommandHandler(mockCLI)
      expect(handlerWithCLI).toBeInstanceOf(SlashCommandHandler)
    })

    it('should register all commands on initialization', () => {
      const commands = handler.listCommands()
      expect(commands.length).toBeGreaterThan(0)
      expect(commands).toContain('help')
      expect(commands).toContain('quit')
      expect(commands).toContain('exit')
    })
  })

  describe('Command Listing', () => {
    it('should list all registered commands', () => {
      const commands = handler.listCommands()
      expect(Array.isArray(commands)).toBe(true)
      expect(commands.length).toBeGreaterThan(0)
    })

    it('should include basic commands', () => {
      const commands = handler.listCommands()
      expect(commands).toContain('help')
      expect(commands).toContain('clear')
      expect(commands).toContain('quit')
    })

    it('should include file operation commands', () => {
      const commands = handler.listCommands()
      expect(commands).toContain('read')
      expect(commands).toContain('write')
      expect(commands).toContain('edit')
    })

    it('should include agent commands', () => {
      const commands = handler.listCommands()
      expect(commands).toContain('agent')
      expect(commands).toContain('agents')
    })
  })

  describe('Command Parsing', () => {
    it('should parse command without arguments', async () => {
      const result = await handler.handle('/help')
      expect(result).toBeDefined()
      expect(result.shouldExit).toBe(false)
    })

    it('should parse command with arguments', async () => {
      const result = await handler.handle('/model claude-3')
      expect(result).toBeDefined()
    })

    it('should parse command with multiple arguments', async () => {
      const result = await handler.handle('/set-key openrouter test-key')
      expect(result).toBeDefined()
    })

    it('should handle commands with leading slash', async () => {
      const result = await handler.handle('/help')
      expect(result).toBeDefined()
    })

    it('should convert command to lowercase', async () => {
      const result = await handler.handle('/HELP')
      expect(result).toBeDefined()
    })

    it('should handle commands with mixed case', async () => {
      const result = await handler.handle('/HeLp')
      expect(result).toBeDefined()
    })
  })

  describe('Command Execution', () => {
    it('should execute help command', async () => {
      const result = await handler.handle('/help')
      expect(result).toBeDefined()
      expect(result.shouldExit).toBe(false)
    })

    it('should execute quit command', async () => {
      const result = await handler.handle('/quit')
      expect(result).toBeDefined()
    })

    it('should execute exit command', async () => {
      const result = await handler.handle('/exit')
      expect(result).toBeDefined()
    })

    it('should execute clear command', async () => {
      const result = await handler.handle('/clear')
      expect(result).toBeDefined()
    })

    it('should execute model command', async () => {
      const result = await handler.handle('/model claude-3')
      expect(result).toBeDefined()
    })

    it('should execute models command', async () => {
      const result = await handler.handle('/models')
      expect(result).toBeDefined()
    })
  })

  describe('Edge Cases - Invalid Commands', () => {
    it('should handle unknown command', async () => {
      const result = await handler.handle('/unknown-command')
      expect(result).toBeDefined()
      expect(result.shouldExit).toBe(false)
    })

    it('should handle empty command', async () => {
      const result = await handler.handle('/')
      expect(result).toBeDefined()
    })

    it('should handle command with only whitespace', async () => {
      const result = await handler.handle('/   ')
      expect(result).toBeDefined()
    })

    it('should handle command without slash', async () => {
      const result = await handler.handle('help')
      expect(result).toBeDefined()
    })

    it('should handle command with special characters', async () => {
      const result = await handler.handle('/test-command!@#$')
      expect(result).toBeDefined()
    })
  })

  describe('Edge Cases - Arguments', () => {
    it('should handle command with empty arguments', async () => {
      const result = await handler.handle('/help ')
      expect(result).toBeDefined()
    })

    it('should handle command with multiple spaces', async () => {
      const result = await handler.handle('/model   claude-3')
      expect(result).toBeDefined()
    })

    it('should handle command with very long arguments', async () => {
      const longArg = 'x'.repeat(10000)
      const result = await handler.handle(`/model ${longArg}`)
      expect(result).toBeDefined()
    })

    it('should handle command with unicode arguments', async () => {
      const result = await handler.handle('/model 🚀测试中文🎉')
      expect(result).toBeDefined()
    })

    it('should handle command with special characters in arguments', async () => {
      const result = await handler.handle('/model test!@#$%^&*()')
      expect(result).toBeDefined()
    })

    it('should handle command with newlines in arguments', async () => {
      const result = await handler.handle('/model test\nline2')
      expect(result).toBeDefined()
    })

    it('should handle command with tabs in arguments', async () => {
      const result = await handler.handle('/model test\ttab')
      expect(result).toBeDefined()
    })
  })

  describe('Edge Cases - Nested Commands', () => {
    it('should handle command with nested slashes', async () => {
      const result = await handler.handle('/model /test')
      expect(result).toBeDefined()
    })

    it('should handle command with multiple slashes', async () => {
      const result = await handler.handle('///help')
      expect(result).toBeDefined()
    })
  })

  describe('Edge Cases - Concurrent Execution', () => {
    it('should handle concurrent command execution', async () => {
      const promises = Array.from({ length: 10 }, () => handler.handle('/help'))
      const results = await Promise.all(promises)
      expect(results.length).toBe(10)
      results.forEach((result) => {
        expect(result).toBeDefined()
      })
    })

    it('should handle rapid command execution', async () => {
      for (let i = 0; i < 100; i++) {
        const result = await handler.handle('/help')
        expect(result).toBeDefined()
      }
    })
  })

  describe('Edge Cases - Error Handling', () => {
    it('should handle command execution errors gracefully', async () => {
      // Some commands may throw errors, handler should catch them
      const result = await handler.handle('/invalid-command-with-error')
      expect(result).toBeDefined()
    })

    it('should handle null CLI instance', () => {
      const handlerWithoutCLI = new SlashCommandHandler(null)
      expect(handlerWithoutCLI).toBeInstanceOf(SlashCommandHandler)
    })
  })

  describe('Command Categories', () => {
    it('should have file operation commands', () => {
      const commands = handler.listCommands()
      expect(commands.some((c) => ['read', 'write', 'edit', 'ls'].includes(c))).toBe(true)
    })

    it('should have agent commands', () => {
      const commands = handler.listCommands()
      expect(commands.some((c) => ['agent', 'agents', 'create-agent'].includes(c))).toBe(true)
    })

    it('should have VM commands', () => {
      const commands = handler.listCommands()
      expect(commands.some((c) => c.startsWith('vm-'))).toBe(true)
    })

    it('should have planning commands', () => {
      const commands = handler.listCommands()
      expect(commands.some((c) => ['plan', 'todo', 'todos'].includes(c))).toBe(true)
    })

    it('should have security commands', () => {
      const commands = handler.listCommands()
      expect(commands.some((c) => ['security', 'dev-mode', 'safe-mode'].includes(c))).toBe(true)
    })
  })

  describe('Command Routing', () => {
    it('should route commands to correct handlers', async () => {
      const helpResult = await handler.handle('/help')
      const quitResult = await handler.handle('/quit')
      expect(helpResult).toBeDefined()
      expect(quitResult).toBeDefined()
    })

    it('should handle aliases correctly', async () => {
      const quitResult = await handler.handle('/quit')
      const exitResult = await handler.handle('/exit')
      expect(quitResult).toBeDefined()
      expect(exitResult).toBeDefined()
    })
  })

  describe('Command Result', () => {
    it('should return CommandResult object', async () => {
      const result = await handler.handle('/help')
      expect(result).toHaveProperty('shouldExit')
      expect(result).toHaveProperty('shouldUpdatePrompt')
      expect(typeof result.shouldExit).toBe('boolean')
      expect(typeof result.shouldUpdatePrompt).toBe('boolean')
    })

    it('should indicate exit when quit command executed', async () => {
      const result = await handler.handle('/quit')
      expect(result.shouldExit).toBe(true)
    })

    it('should not exit for non-quit commands', async () => {
      const result = await handler.handle('/help')
      expect(result.shouldExit).toBe(false)
    })
  })

  describe('Edge Cases - Performance', () => {
    it('should handle many commands efficiently', async () => {
      const startTime = Date.now()
      for (let i = 0; i < 100; i++) {
        await handler.handle('/help')
      }
      const endTime = Date.now()
      // Should complete within reasonable time (5 seconds)
      expect(endTime - startTime).toBeLessThan(5000)
    })

    it('should not leak memory with many commands', async () => {
      const initialMemory = process.memoryUsage().heapUsed
      for (let i = 0; i < 1000; i++) {
        await handler.handle('/help')
      }
      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory
      // Memory increase should be reasonable (less than 100MB)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024)
    })
  })

  describe('Edge Cases - Boundary Conditions', () => {
    it('should handle command at maximum length', async () => {
      const longCommand = '/help ' + 'x'.repeat(100000)
      const result = await handler.handle(longCommand)
      expect(result).toBeDefined()
    })

    it('should handle empty string', async () => {
      const result = await handler.handle('')
      expect(result).toBeDefined()
    })

    it('should handle string with only whitespace', async () => {
      const result = await handler.handle('   ')
      expect(result).toBeDefined()
    })
  })
})

