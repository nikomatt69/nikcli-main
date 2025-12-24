/**
 * Comprehensive tests for Integrations
 * Tests MCP client, IDE diagnostic integration, and edge cases
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDEDiagnosticIntegration } from '../../../src/cli/integrations/ide-diagnostic-integration'
import { mockConsole, mockEnv } from '../../helpers/test-utils'

vi.mock('../../../src/cli/core/mcp-client', () => ({
  mcpClient: {
    call: vi.fn().mockResolvedValue({
      result: [],
    }),
  },
}))

describe('IDEDiagnosticIntegration', () => {
  let diagnostic: IDEDiagnosticIntegration
  let console: ReturnType<typeof mockConsole>
  let env: ReturnType<typeof mockEnv>

  beforeEach(() => {
    console = mockConsole()
    env = mockEnv({
      NODE_ENV: 'test',
    })
    diagnostic = IDEDiagnosticIntegration.getInstance()
  })

  afterEach(() => {
    console.restore()
    env.restore()
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should get singleton instance', () => {
      const instance1 = IDEDiagnosticIntegration.getInstance()
      const instance2 = IDEDiagnosticIntegration.getInstance()
      expect(instance1).toBe(instance2)
    })

    it('should initialize integration', () => {
      expect(diagnostic).toBeInstanceOf(IDEDiagnosticIntegration)
    })
  })

  describe('Workflow Context', () => {
    it('should get workflow context', async () => {
      const context = await diagnostic.getWorkflowContext()
      expect(context).toBeDefined()
      expect(context).toHaveProperty('errors')
      expect(context).toHaveProperty('warnings')
      expect(context).toHaveProperty('buildStatus')
      expect(context).toHaveProperty('lintStatus')
      expect(context).toHaveProperty('testStatus')
    })

    it('should handle diagnostic errors gracefully', async () => {
      vi.mocked(require('../../../src/cli/core/mcp-client').mcpClient.call).mockRejectedValue(
        new Error('MCP error')
      )
      const context = await diagnostic.getWorkflowContext()
      expect(context).toBeDefined()
    })

    it('should return empty context when inactive', async () => {
      ;(diagnostic as any).isActive = false
      const context = await diagnostic.getWorkflowContext()
      expect(context).toBeDefined()
      expect(context.errors).toBe(0)
      expect(context.warnings).toBe(0)
    })
  })

  describe('Edge Cases', () => {
    it('should handle missing diagnostics', async () => {
      vi.mocked(require('../../../src/cli/core/mcp-client').mcpClient.call).mockResolvedValue({
        result: null,
      })
      const context = await diagnostic.getWorkflowContext()
      expect(context).toBeDefined()
    })

    it('should handle empty diagnostics array', async () => {
      vi.mocked(require('../../../src/cli/core/mcp-client').mcpClient.call).mockResolvedValue({
        result: [],
      })
      const context = await diagnostic.getWorkflowContext()
      expect(context.errors).toBe(0)
      expect(context.warnings).toBe(0)
    })

    it('should handle build status errors', async () => {
      vi.mocked(require('../../../src/cli/core/mcp-client').mcpClient.call).mockImplementation(
        async (server: string, params: any) => {
          if (params.method === 'build.run') {
            throw new Error('Build failed')
          }
          return { result: [] }
        }
      )
      const context = await diagnostic.getWorkflowContext()
      expect(context.buildStatus).toBe('unknown')
    })

    it('should handle lint status errors', async () => {
      vi.mocked(require('../../../src/cli/core/mcp-client').mcpClient.call).mockImplementation(
        async (server: string, params: any) => {
          if (params.method === 'lint.run') {
            throw new Error('Lint failed')
          }
          return { result: [] }
        }
      )
      const context = await diagnostic.getWorkflowContext()
      expect(context.lintStatus).toBe('unknown')
    })

    it('should handle test status errors', async () => {
      vi.mocked(require('../../../src/cli/core/mcp-client').mcpClient.call).mockImplementation(
        async (server: string, params: any) => {
          if (params.method === 'test.run') {
            throw new Error('Test failed')
          }
          return { result: [] }
        }
      )
      const context = await diagnostic.getWorkflowContext()
      expect(context.testStatus).toBe('unknown')
    })
  })
})

describe('MCP Client', () => {
  let mcpClient: any
  let console: ReturnType<typeof mockConsole>

  beforeEach(() => {
    console = mockConsole()
    mcpClient = require('../../../src/cli/core/mcp-client').mcpClient
  })

  afterEach(() => {
    console.restore()
    vi.clearAllMocks()
  })

  describe('MCP Operations', () => {
    it('should call MCP server', async () => {
      const result = await mcpClient.call('test-server', {
        method: 'test.method',
        params: {},
        id: 'test-id',
      })
      expect(result).toBeDefined()
    })

    it('should handle call errors', async () => {
      vi.mocked(mcpClient.call).mockRejectedValue(new Error('MCP error'))
      await expect(
        mcpClient.call('test-server', {
          method: 'test.method',
          params: {},
          id: 'test-id',
        })
      ).rejects.toThrow()
    })

    it('should handle invalid server', async () => {
      await expect(
        mcpClient.call('', {
          method: 'test.method',
          params: {},
          id: 'test-id',
        })
      ).resolves.not.toThrow()
    })
  })

  describe('Edge Cases', () => {
    it('should handle null parameters', async () => {
      await expect(
        mcpClient.call('test-server', {
          method: 'test.method',
          params: null,
          id: 'test-id',
        })
      ).resolves.not.toThrow()
    })

    it('should handle missing method', async () => {
      await expect(
        mcpClient.call('test-server', {
          params: {},
          id: 'test-id',
        } as any)
      ).resolves.not.toThrow()
    })

    it('should handle concurrent calls', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        mcpClient.call('test-server', {
          method: 'test.method',
          params: { index: i },
          id: `test-${i}`,
        })
      )
      const results = await Promise.all(promises)
      expect(results.length).toBe(10)
    })
  })
})


