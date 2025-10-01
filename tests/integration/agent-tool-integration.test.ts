/**
 * Integration tests for Agent and Tool systems working together
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { createMockAgent, createMockTool, createMockConfigManager } from '../helpers/mock-factory'

describe('Agent-Tool Integration', () => {
  let mockAgent: ReturnType<typeof createMockAgent>
  let mockTool: ReturnType<typeof createMockTool>
  let mockConfig: ReturnType<typeof createMockConfigManager>

  beforeEach(() => {
    mockAgent = createMockAgent('integration-agent')
    mockTool = createMockTool('integration-tool')
    mockConfig = createMockConfigManager()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Agent with Tool Execution', () => {
    it('should allow agent to execute tools', async () => {
      // Simulate agent calling a tool
      mockAgent.execute.mockImplementation(async () => {
        const toolResult = await mockTool.execute({ param1: 'test-value' })
        return {
          success: true,
          result: `Agent used tool: ${toolResult.data}`,
        }
      })

      const result = await mockAgent.execute()

      expect(result.success).toBe(true)
      expect(mockTool.execute).toHaveBeenCalledWith({ param1: 'test-value' })
      expect(result.result).toContain('Agent used tool')
    })

    it('should handle tool execution failures in agent', async () => {
      mockTool.execute.mockRejectedValue(new Error('Tool execution failed'))

      mockAgent.execute.mockImplementation(async () => {
        try {
          await mockTool.execute({ param1: 'test' })
          return { success: false, error: 'Should not reach here' }
        } catch (error: any) {
          return { success: false, error: error.message }
        }
      })

      const result = await mockAgent.execute()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Tool execution failed')
    })

    it('should chain multiple tool executions', async () => {
      const tool1 = createMockTool('tool-1')
      const tool2 = createMockTool('tool-2')
      const tool3 = createMockTool('tool-3')

      tool1.execute.mockResolvedValue({ success: true, data: 'result-1' })
      tool2.execute.mockResolvedValue({ success: true, data: 'result-2' })
      tool3.execute.mockResolvedValue({ success: true, data: 'result-3' })

      mockAgent.execute.mockImplementation(async () => {
        const r1 = await tool1.execute({})
        const r2 = await tool2.execute({ input: r1.data })
        const r3 = await tool3.execute({ input: r2.data })

        return {
          success: true,
          result: [r1.data, r2.data, r3.data],
        }
      })

      const result = await mockAgent.execute()

      expect(result.success).toBe(true)
      expect(result.result).toEqual(['result-1', 'result-2', 'result-3'])
      expect(tool1.execute).toHaveBeenCalled()
      expect(tool2.execute).toHaveBeenCalled()
      expect(tool3.execute).toHaveBeenCalled()
    })
  })

  describe('Tool Selection by Agent', () => {
    it('should select appropriate tool based on task', async () => {
      const readTool = createMockTool('read-file')
      const writeTool = createMockTool('write-file')

      readTool.execute.mockResolvedValue({ success: true, data: 'file content' })
      writeTool.execute.mockResolvedValue({ success: true, data: 'written' })

      mockAgent.execute.mockImplementation(async (params: any) => {
        const { action } = params || {}

        if (action === 'read') {
          return await readTool.execute({})
        }
        if (action === 'write') {
          return await writeTool.execute({})
        }

        return { success: false, error: 'Unknown action' }
      })

      const readResult = await mockAgent.execute({ action: 'read' })
      expect(readResult.success).toBe(true)
      expect(readTool.execute).toHaveBeenCalled()

      const writeResult = await mockAgent.execute({ action: 'write' })
      expect(writeResult.success).toBe(true)
      expect(writeTool.execute).toHaveBeenCalled()
    })

    it('should handle unavailable tools gracefully', async () => {
      mockAgent.execute.mockImplementation(async () => {
        const toolAvailable = false

        if (!toolAvailable) {
          return {
            success: false,
            error: 'Required tool not available',
          }
        }

        return { success: true, result: 'executed' }
      })

      const result = await mockAgent.execute()

      expect(result.success).toBe(false)
      expect(result.error).toContain('not available')
    })
  })

  describe('Configuration Integration', () => {
    it('should use configuration in agent and tool execution', async () => {
      mockConfig.setConfig('maxRetries', 3)
      mockConfig.setConfig('timeout', 5000)

      let attemptCount = 0
      mockTool.execute.mockImplementation(async () => {
        attemptCount++
        if (attemptCount < 3) {
          throw new Error('Temporary failure')
        }
        return { success: true, data: 'success after retries' }
      })

      mockAgent.execute.mockImplementation(async () => {
        const maxRetries = mockConfig.getConfig('maxRetries')
        let lastError: any

        for (let i = 0; i < maxRetries; i++) {
          try {
            return await mockTool.execute({})
          } catch (error) {
            lastError = error
          }
        }

        return { success: false, error: lastError.message }
      })

      const result = await mockAgent.execute()

      expect(result.success).toBe(true)
      expect(attemptCount).toBe(3)
    })

    it('should respect timeout configurations', async () => {
      mockConfig.setConfig('timeout', 100)

      mockTool.execute.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200))
        return { success: true, data: 'slow response' }
      })

      mockAgent.execute.mockImplementation(async () => {
        const timeout = mockConfig.getConfig('timeout')

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), timeout)
        )

        try {
          return await Promise.race([mockTool.execute({}), timeoutPromise])
        } catch (error: any) {
          return { success: false, error: error.message }
        }
      })

      const result = await mockAgent.execute()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Timeout')
    })
  })

  describe('Data Flow Between Agent and Tools', () => {
    it('should transform data through agent-tool pipeline', async () => {
      const transformTool = createMockTool('transform')
      const validateTool = createMockTool('validate')
      const saveTool = createMockTool('save')

      transformTool.execute.mockImplementation(async (data: any) => ({
        success: true,
        data: data.input.toUpperCase(),
      }))

      validateTool.execute.mockImplementation(async (data: any) => ({
        success: true,
        data: { valid: data.input.length > 0, processed: data.input },
      }))

      saveTool.execute.mockImplementation(async (data: any) => ({
        success: true,
        data: `Saved: ${data.input}`,
      }))

      mockAgent.execute.mockImplementation(async (params: any) => {
        // Transform
        const transformed = await transformTool.execute({ input: params.text })

        // Validate
        const validated = await validateTool.execute({ input: transformed.data })

        if (!validated.data.valid) {
          return { success: false, error: 'Validation failed' }
        }

        // Save
        const saved = await saveTool.execute({ input: validated.data.processed })

        return { success: true, result: saved.data }
      })

      const result = await mockAgent.execute({ text: 'hello world' })

      expect(result.success).toBe(true)
      expect(result.result).toBe('Saved: HELLO WORLD')
      expect(transformTool.execute).toHaveBeenCalled()
      expect(validateTool.execute).toHaveBeenCalled()
      expect(saveTool.execute).toHaveBeenCalled()
    })

    it('should handle data validation failures', async () => {
      const validateTool = createMockTool('validate')

      validateTool.execute.mockResolvedValue({
        success: true,
        data: { valid: false, errors: ['Invalid format'] },
      })

      mockAgent.execute.mockImplementation(async (params: any) => {
        const validation = await validateTool.execute(params)

        if (!validation.data.valid) {
          return {
            success: false,
            error: `Validation errors: ${validation.data.errors.join(', ')}`,
          }
        }

        return { success: true, result: 'processed' }
      })

      const result = await mockAgent.execute({ data: 'invalid' })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid format')
    })
  })

  describe('Concurrent Tool Execution', () => {
    it('should execute multiple tools in parallel', async () => {
      const tools = [
        createMockTool('tool-1'),
        createMockTool('tool-2'),
        createMockTool('tool-3'),
        createMockTool('tool-4'),
      ]

      tools.forEach((tool, index) => {
        tool.execute.mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 50))
          return { success: true, data: `result-${index}` }
        })
      })

      mockAgent.execute.mockImplementation(async () => {
        const startTime = Date.now()
        const results = await Promise.all(tools.map((tool) => tool.execute({})))
        const duration = Date.now() - startTime

        return {
          success: true,
          result: {
            results: results.map((r) => r.data),
            duration,
          },
        }
      })

      const result = await mockAgent.execute()

      expect(result.success).toBe(true)
      expect(result.result.results).toHaveLength(4)
      // Parallel execution should be faster than sequential (4 * 50ms)
      expect(result.result.duration).toBeLessThan(200)
    })

    it('should handle partial failures in concurrent execution', async () => {
      const tools = [
        createMockTool('success-1'),
        createMockTool('failure'),
        createMockTool('success-2'),
      ]

      tools[0].execute.mockResolvedValue({ success: true, data: 'result-1' })
      tools[1].execute.mockRejectedValue(new Error('Tool failed'))
      tools[2].execute.mockResolvedValue({ success: true, data: 'result-2' })

      mockAgent.execute.mockImplementation(async () => {
        const results = await Promise.allSettled(tools.map((tool) => tool.execute({})))

        const successful = results.filter((r) => r.status === 'fulfilled')
        const failed = results.filter((r) => r.status === 'rejected')

        return {
          success: true,
          result: {
            successful: successful.length,
            failed: failed.length,
          },
        }
      })

      const result = await mockAgent.execute()

      expect(result.success).toBe(true)
      expect(result.result.successful).toBe(2)
      expect(result.result.failed).toBe(1)
    })
  })

  describe('State Management', () => {
    it('should maintain state across tool executions', async () => {
      const state = { counter: 0, results: [] as string[] }

      mockAgent.execute.mockImplementation(async (params: any) => {
        for (let i = 0; i < params.iterations; i++) {
          const result = await mockTool.execute({ iteration: i })
          state.counter++
          state.results.push(result.data)
        }

        return {
          success: true,
          result: {
            finalCount: state.counter,
            allResults: state.results,
          },
        }
      })

      mockTool.execute.mockImplementation(async (params: any) => ({
        success: true,
        data: `iteration-${params.iteration}`,
      }))

      const result = await mockAgent.execute({ iterations: 5 })

      expect(result.success).toBe(true)
      expect(result.result.finalCount).toBe(5)
      expect(result.result.allResults).toHaveLength(5)
    })
  })
})
