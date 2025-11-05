/**
 * Comprehensive tests for TaskMaster Service
 * Tests task management, PRD parsing, dependencies, and edge cases
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskMasterService } from '../../../src/cli/services/taskmaster-service'
import { mockConsole, mockEnv } from '../../helpers/test-utils'

vi.mock('task-master-ai', () => ({
  initProject: vi.fn(),
  runInitCLI: vi.fn(),
  version: '1.0.0',
  devScriptPath: '/path/to/dev',
}))

vi.mock('../../../src/cli/ui/advanced-cli-ui', () => ({
  advancedUI: {
    logFunctionUpdate: vi.fn(),
    logFunctionCall: vi.fn(),
    logSuccess: vi.fn(),
    logWarning: vi.fn(),
  },
}))

vi.mock('../../../src/cli/core/config-manager', () => ({
  simpleConfigManager: {
    getConfig: vi.fn(() => ({ apiKey: 'test-key', model: 'claude-3' })),
    getNotificationConfig: vi.fn(() => ({ enabled: false })),
  },
}))

vi.mock('../../../src/cli/services/notification-service', () => ({
  getNotificationService: vi.fn(() => ({
    sendTaskCompletion: vi.fn(),
  })),
}))

vi.mock('../../../src/cli/ai/advanced-ai-provider', () => ({
  advancedAIProvider: {
    generateText: vi.fn().mockResolvedValue({
      text: JSON.stringify([
        {
          id: 'test-task-1',
          title: 'Test Task',
          description: 'Test description',
          status: 'pending',
          priority: 'medium',
        },
      ]),
    }),
  },
}))

describe('TaskMasterService', () => {
  let service: TaskMasterService
  let console: ReturnType<typeof mockConsole>
  let env: ReturnType<typeof mockEnv>

  beforeEach(() => {
    console = mockConsole()
    env = mockEnv({
      NODE_ENV: 'test',
      OPENROUTER_API_KEY: 'test-key',
    })
    service = new TaskMasterService({
      workspacePath: process.cwd(),
      apiKey: 'test-key',
    })
  })

  afterEach(async () => {
    await service.dispose()
    console.restore()
    env.restore()
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize service', async () => {
      await service.initialize()
      expect(service).toBeInstanceOf(TaskMasterService)
    })

    it('should initialize with custom config', () => {
      const customService = new TaskMasterService({
        workspacePath: '/custom/path',
        apiKey: 'custom-key',
        model: 'gpt-4',
      })
      expect(customService).toBeInstanceOf(TaskMasterService)
    })

    it('should handle initialization errors gracefully', async () => {
      vi.mock('task-master-ai', () => {
        throw new Error('Module not found')
      })
      const failingService = new TaskMasterService()
      await expect(failingService.initialize()).resolves.not.toThrow()
    })

    it('should emit initialized event', async () => {
      const listener = vi.fn()
      service.on('initialized', listener)
      await service.initialize()
      expect(listener).toHaveBeenCalled()
    })
  })

  describe('Plan Creation', () => {
    it('should create a plan', async () => {
      await service.initialize()
      const plan = await service.createPlan('Test user request')
      expect(plan).toBeDefined()
      expect(plan.id).toBeDefined()
      expect(plan.title).toBeDefined()
      expect(plan.todos).toBeDefined()
      expect(Array.isArray(plan.todos)).toBe(true)
    })

    it('should create plan with context', async () => {
      await service.initialize()
      const context = {
        projectPath: '/test/path',
        relevantFiles: ['file1.ts', 'file2.ts'],
        projectType: 'typescript',
      }
      const plan = await service.createPlan('Test request', context)
      expect(plan).toBeDefined()
    })

    it('should generate todos for plan', async () => {
      await service.initialize()
      const plan = await service.createPlan('Create a new feature')
      expect(plan.todos.length).toBeGreaterThan(0)
    })

    it('should store plan in active plans', async () => {
      await service.initialize()
      const plan = await service.createPlan('Test request')
      const plans = service.listPlans()
      expect(plans).toContain(plan)
    })

    it('should create plan with unique ID', async () => {
      await service.initialize()
      const plan1 = await service.createPlan('Request 1')
      const plan2 = await service.createPlan('Request 2')
      expect(plan1.id).not.toBe(plan2.id)
    })
  })

  describe('Plan Execution', () => {
    it('should execute a plan', async () => {
      await service.initialize()
      const plan = await service.createPlan('Test request')
      const result = await service.executePlan(plan.id)
      expect(result).toBeDefined()
      expect(result.planId).toBe(plan.id)
    })

    it('should throw error for non-existent plan', async () => {
      await service.initialize()
      await expect(service.executePlan('non-existent-id')).rejects.toThrow()
    })

    it('should handle execution errors gracefully', async () => {
      await service.initialize()
      const plan = await service.createPlan('Test request')
      // Mock execution failure
      vi.mocked(require('task-master-ai')).initProject.mockRejectedValue(new Error('Execution failed'))
      const result = await service.executePlan(plan.id)
      expect(result).toBeDefined()
    })
  })

  describe('Plan Status', () => {
    it('should get plan status', async () => {
      await service.initialize()
      const plan = await service.createPlan('Test request')
      const status = await service.getPlanStatus(plan.id)
      expect(status).toBeDefined()
      expect(status?.planId).toBe(plan.id)
    })

    it('should return null for non-existent plan', async () => {
      await service.initialize()
      const status = await service.getPlanStatus('non-existent-id')
      expect(status).toBeNull()
    })

    it('should track plan progress', async () => {
      await service.initialize()
      const plan = await service.createPlan('Test request')
      const status = await service.getPlanStatus(plan.id)
      expect(status).toHaveProperty('progress')
      expect(status).toHaveProperty('completedTasks')
      expect(status).toHaveProperty('totalTasks')
    })
  })

  describe('Plan Updates', () => {
    it('should update plan', async () => {
      await service.initialize()
      const plan = await service.createPlan('Test request')
      const updates = { status: 'in_progress' as const }
      await service.updatePlan(plan.id, updates)
      const updatedPlan = service.listPlans().find((p) => p.id === plan.id)
      expect(updatedPlan?.status).toBe('in_progress')
    })

    it('should handle update for non-existent plan', async () => {
      await service.initialize()
      await expect(service.updatePlan('non-existent-id', {})).resolves.not.toThrow()
    })

    it('should emit planUpdated event', async () => {
      await service.initialize()
      const plan = await service.createPlan('Test request')
      const listener = vi.fn()
      service.on('planUpdated', listener)
      await service.updatePlan(plan.id, { status: 'completed' })
      expect(listener).toHaveBeenCalled()
    })
  })

  describe('Plan Listing', () => {
    it('should list all plans', async () => {
      await service.initialize()
      await service.createPlan('Request 1')
      await service.createPlan('Request 2')
      const plans = service.listPlans()
      expect(plans.length).toBeGreaterThanOrEqual(2)
    })

    it('should return empty array when no plans', () => {
      const plans = service.listPlans()
      expect(Array.isArray(plans)).toBe(true)
      expect(plans.length).toBe(0)
    })
  })

  describe('Edge Cases - PRD Parsing', () => {
    it('should handle PRD-like requests', async () => {
      await service.initialize()
      const prdRequest = `
        Feature: User Authentication
        Requirements:
        1. Login page
        2. Registration page
        3. Password reset
      `
      const plan = await service.createPlan(prdRequest)
      expect(plan).toBeDefined()
      expect(plan.todos.length).toBeGreaterThan(0)
    })

    it('should handle empty PRD', async () => {
      await service.initialize()
      const plan = await service.createPlan('')
      expect(plan).toBeDefined()
    })

    it('should handle very long PRD', async () => {
      await service.initialize()
      const longPRD = 'x'.repeat(100000)
      const plan = await service.createPlan(longPRD)
      expect(plan).toBeDefined()
    })

    it('should handle PRD with special characters', async () => {
      await service.initialize()
      const prd = '🚀 Feature: Test !@#$%^&*() 中文 🎉'
      const plan = await service.createPlan(prd)
      expect(plan).toBeDefined()
    })
  })

  describe('Edge Cases - Dependencies', () => {
    it('should handle tasks with dependencies', async () => {
      await service.initialize()
      const plan = await service.createPlan('Create feature with dependencies')
      // Plan should have todos with proper ordering
      expect(plan.todos.length).toBeGreaterThan(0)
    })

    it('should handle circular dependencies gracefully', async () => {
      await service.initialize()
      const plan = await service.createPlan('Task with circular dependencies')
      expect(plan).toBeDefined()
    })

    it('should handle orphaned tasks', async () => {
      await service.initialize()
      const plan = await service.createPlan('Create standalone tasks')
      expect(plan.todos.length).toBeGreaterThan(0)
    })
  })

  describe('Edge Cases - Task Management', () => {
    it('should handle tasks with missing fields', async () => {
      await service.initialize()
      const plan = await service.createPlan('Test request')
      expect(plan.todos.every((todo) => todo.id && todo.title)).toBe(true)
    })

    it('should handle tasks with invalid status', async () => {
      await service.initialize()
      const plan = await service.createPlan('Test request')
      const updates = { status: 'invalid-status' as any }
      await service.updatePlan(plan.id, updates)
      // Should handle gracefully
      expect(service.listPlans().find((p) => p.id === plan.id)).toBeDefined()
    })

    it('should handle concurrent plan creation', async () => {
      await service.initialize()
      const promises = Array.from({ length: 10 }, (_, i) =>
        service.createPlan(`Request ${i}`)
      )
      const plans = await Promise.all(promises)
      expect(plans.length).toBe(10)
      expect(new Set(plans.map((p) => p.id)).size).toBe(10) // All unique IDs
    })

    it('should handle concurrent plan updates', async () => {
      await service.initialize()
      const plan = await service.createPlan('Test request')
      const promises = Array.from({ length: 10 }, (_, i) =>
        service.updatePlan(plan.id, { status: `status-${i}` as any })
      )
      await Promise.all(promises)
      // Should handle gracefully
      expect(service.listPlans().find((p) => p.id === plan.id)).toBeDefined()
    })
  })

  describe('Edge Cases - Error Handling', () => {
    it('should handle AI generation failures', async () => {
      await service.initialize()
      vi.mocked(require('../../../src/cli/ai/advanced-ai-provider').advancedAIProvider.generateText).mockRejectedValue(
        new Error('AI service unavailable')
      )
      const plan = await service.createPlan('Test request')
      // Should fallback to rule-based planning
      expect(plan).toBeDefined()
      expect(plan.todos.length).toBeGreaterThan(0)
    })

    it('should handle file system errors', async () => {
      await service.initialize()
      // Mock fs errors
      const originalMkdir = require('node:fs/promises').mkdir
      vi.mocked(require('node:fs/promises')).mkdir = vi.fn().mockRejectedValue(new Error('Permission denied'))
      const plan = await service.createPlan('Test request')
      expect(plan).toBeDefined()
    })

    it('should handle invalid plan IDs', async () => {
      await service.initialize()
      await expect(service.executePlan('')).rejects.toThrow()
      await expect(service.getPlanStatus('')).resolves.toBeNull()
    })

    it('should handle null/undefined inputs', async () => {
      await service.initialize()
      const plan = await service.createPlan(null as any)
      expect(plan).toBeDefined()
    })
  })

  describe('Edge Cases - Performance', () => {
    it('should handle many plans efficiently', async () => {
      await service.initialize()
      const startTime = Date.now()
      for (let i = 0; i < 100; i++) {
        await service.createPlan(`Request ${i}`)
      }
      const endTime = Date.now()
      expect(endTime - startTime).toBeLessThan(30000) // Should complete within 30 seconds
    })

    it('should not leak memory with many plans', async () => {
      await service.initialize()
      const initialMemory = process.memoryUsage().heapUsed
      for (let i = 0; i < 1000; i++) {
        await service.createPlan(`Request ${i}`)
      }
      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory
      // Memory increase should be reasonable (less than 500MB)
      expect(memoryIncrease).toBeLessThan(500 * 1024 * 1024)
    })
  })

  describe('Disposal', () => {
    it('should dispose service properly', async () => {
      await service.initialize()
      await service.createPlan('Test request')
      await service.dispose()
      // Should clean up resources
      expect(service.listPlans().length).toBe(0)
    })

    it('should handle disposal errors gracefully', async () => {
      await service.initialize()
      vi.mocked(require('task-master-ai')).initProject.mockRejectedValue(new Error('Disposal failed'))
      await expect(service.dispose()).resolves.not.toThrow()
    })

    it('should remove all listeners on disposal', async () => {
      await service.initialize()
      const listener = vi.fn()
      service.on('planUpdated', listener)
      await service.dispose()
      // Listeners should be removed
      expect(service.listenerCount('planUpdated')).toBe(0)
    })
  })

  describe('Edge Cases - Context Handling', () => {
    it('should handle empty context', async () => {
      await service.initialize()
      const plan = await service.createPlan('Test request', {})
      expect(plan).toBeDefined()
    })

    it('should handle context with many files', async () => {
      await service.initialize()
      const context = {
        projectPath: '/test',
        relevantFiles: Array.from({ length: 1000 }, (_, i) => `file${i}.ts`),
        projectType: 'typescript',
      }
      const plan = await service.createPlan('Test request', context)
      expect(plan).toBeDefined()
    })

    it('should handle context with very long file paths', async () => {
      await service.initialize()
      const context = {
        projectPath: '/test',
        relevantFiles: [`file${'x'.repeat(1000)}.ts`],
        projectType: 'typescript',
      }
      const plan = await service.createPlan('Test request', context)
      expect(plan).toBeDefined()
    })
  })

  describe('Edge Cases - Request Types', () => {
    it('should handle code generation requests', async () => {
      await service.initialize()
      const plan = await service.createPlan('Create a React component')
      expect(plan).toBeDefined()
      expect(plan.todos.length).toBeGreaterThan(0)
    })

    it('should handle refactoring requests', async () => {
      await service.initialize()
      const plan = await service.createPlan('Refactor the authentication module')
      expect(plan).toBeDefined()
    })

    it('should handle bug fix requests', async () => {
      await service.initialize()
      const plan = await service.createPlan('Fix the login bug')
      expect(plan).toBeDefined()
    })

    it('should handle documentation requests', async () => {
      await service.initialize()
      const plan = await service.createPlan('Write documentation for the API')
      expect(plan).toBeDefined()
    })
  })
})


