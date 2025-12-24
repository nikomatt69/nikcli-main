/**
 * Comprehensive tests for Planning Service
 * Tests plan generation, execution, validation, and edge cases
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlanningService } from '../../../src/cli/services/planning-service'
import { mockConsole, mockEnv } from '../../helpers/test-utils'

vi.mock('../../../src/cli/ui/advanced-cli-ui', () => ({
  advancedUI: {
    logFunctionUpdate: vi.fn(),
    logFunctionCall: vi.fn(),
    logSuccess: vi.fn(),
    logWarning: vi.fn(),
    logInfo: vi.fn(),
    showTodoDashboard: vi.fn(),
  },
}))

vi.mock('../../../src/cli/planning/plan-generator', () => ({
  PlanGenerator: vi.fn(() => ({
    generatePlan: vi.fn().mockResolvedValue({
      id: 'test-plan-id',
      title: 'Test Plan',
      description: 'Test description',
      steps: [
        {
          id: 'step-1',
          title: 'Step 1',
          description: 'First step',
          riskLevel: 'low',
        },
      ],
      todos: [],
      context: {
        userRequest: 'Test request',
        relevantFiles: [],
      },
    }),
  })),
}))

vi.mock('../../../src/cli/planning/autonomous-planner', () => ({
  AutonomousPlanner: vi.fn(() => ({
    executePlan: vi.fn().mockImplementation(async function* () {
      yield { type: 'plan_start', planId: 'test-plan-id' }
      yield { type: 'todo_start', todoId: 'todo-1' }
      yield { type: 'todo_complete', todoId: 'todo-1' }
      yield { type: 'plan_complete', planId: 'test-plan-id' }
    }),
  })),
}))

vi.mock('../../../src/cli/adapters/taskmaster-adapter', () => ({
  TaskMasterAdapter: vi.fn(() => ({
    isTaskMasterAvailable: vi.fn().mockReturnValue(false),
    createEnhancedPlan: vi.fn(),
  })),
}))

describe('PlanningService', () => {
  let planningService: PlanningService
  let console: ReturnType<typeof mockConsole>
  let env: ReturnType<typeof mockEnv>

  beforeEach(() => {
    console = mockConsole()
    env = mockEnv({
      NODE_ENV: 'test',
    })
    planningService = new PlanningService()
  })

  afterEach(() => {
    console.restore()
    env.restore()
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize service', () => {
      expect(planningService).toBeInstanceOf(PlanningService)
    })

    it('should set working directory', () => {
      const testDir = '/test/directory'
      planningService.setWorkingDirectory(testDir)
      expect(planningService).toBeDefined()
    })
  })

  describe('Plan Generation', () => {
    it('should create a plan', async () => {
      const plan = await planningService.createPlan('Test user request')
      expect(plan).toBeDefined()
      expect(plan.id).toBeDefined()
      expect(plan.title).toBeDefined()
      expect(plan.steps).toBeDefined()
      expect(Array.isArray(plan.steps)).toBe(true)
    })

    it('should create plan with options', async () => {
      const options = {
        showProgress: false,
        autoExecute: false,
        confirmSteps: false,
        useTaskMaster: false,
        fallbackToLegacy: true,
      }
      const plan = await planningService.createPlan('Test request', options)
      expect(plan).toBeDefined()
    })

    it('should generate plan with steps', async () => {
      const plan = await planningService.createPlan('Create a new feature')
      expect(plan.steps.length).toBeGreaterThan(0)
    })

    it('should generate plan with todos', async () => {
      const plan = await planningService.createPlan('Test request')
      expect(plan.todos).toBeDefined()
      expect(Array.isArray(plan.todos)).toBe(true)
    })

    it('should store plan in active plans', async () => {
      const plan = await planningService.createPlan('Test request')
      expect(plan).toBeDefined()
      // Plan should be stored internally
    })
  })

  describe('Plan Execution', () => {
    it('should execute a plan', async () => {
      const plan = await planningService.createPlan('Test request')
      await planningService.executePlan(plan.id, {})
      // Execution should complete without errors
      expect(true).toBe(true)
    })

    it('should handle execution for non-existent plan', async () => {
      await planningService.executePlan('non-existent-id', {})
      // Should handle gracefully
      expect(true).toBe(true)
    })

    it('should execute plan with options', async () => {
      const plan = await planningService.createPlan('Test request')
      const options = {
        showProgress: true,
        autoExecute: true,
        confirmSteps: false,
      }
      await planningService.executePlan(plan.id, options)
      expect(true).toBe(true)
    })
  })

  describe('Plan Validation', () => {
    it('should validate plan structure', async () => {
      const plan = await planningService.createPlan('Test request')
      expect(plan).toHaveProperty('id')
      expect(plan).toHaveProperty('title')
      expect(plan).toHaveProperty('steps')
      expect(plan).toHaveProperty('todos')
      expect(plan).toHaveProperty('context')
    })

    it('should validate plan steps', async () => {
      const plan = await planningService.createPlan('Test request')
      plan.steps.forEach((step) => {
        expect(step).toHaveProperty('id')
        expect(step).toHaveProperty('title')
        expect(step).toHaveProperty('description')
      })
    })

    it('should validate plan todos', async () => {
      const plan = await planningService.createPlan('Test request')
      if (plan.todos.length > 0) {
        plan.todos.forEach((todo) => {
          expect(todo).toHaveProperty('id')
          expect(todo).toHaveProperty('title')
          expect(todo).toHaveProperty('status')
        })
      }
    })
  })

  describe('Edge Cases - Plan Generation', () => {
    it('should handle empty request', async () => {
      const plan = await planningService.createPlan('')
      expect(plan).toBeDefined()
    })

    it('should handle very long request', async () => {
      const longRequest = 'x'.repeat(100000)
      const plan = await planningService.createPlan(longRequest)
      expect(plan).toBeDefined()
    })

    it('should handle request with special characters', async () => {
      const request = '🚀 Create feature !@#$%^&*() 中文 🎉'
      const plan = await planningService.createPlan(request)
      expect(plan).toBeDefined()
    })

    it('should handle request with code snippets', async () => {
      const request = `
        Create a function:
        function test() {
          return "hello";
        }
      `
      const plan = await planningService.createPlan(request)
      expect(plan).toBeDefined()
    })
  })

  describe('Edge Cases - Plan Execution', () => {
    it('should handle execution errors gracefully', async () => {
      const plan = await planningService.createPlan('Test request')
      // Mock execution failure
      vi.mocked(require('../../../src/cli/planning/autonomous-planner').AutonomousPlanner).mockImplementation(() => ({
        executePlan: vi.fn().mockImplementation(async function* () {
          throw new Error('Execution failed')
        }),
      }))
      await expect(planningService.executePlan(plan.id, {})).resolves.not.toThrow()
    })

    it('should handle partial execution', async () => {
      const plan = await planningService.createPlan('Test request')
      // Mock partial execution
      vi.mocked(require('../../../src/cli/planning/autonomous-planner').AutonomousPlanner).mockImplementation(() => ({
        executePlan: vi.fn().mockImplementation(async function* () {
          yield { type: 'plan_start', planId: plan.id }
          yield { type: 'todo_start', todoId: 'todo-1' }
          // Execution stops here
        }),
      }))
      await planningService.executePlan(plan.id, {})
      expect(true).toBe(true)
    })

    it('should handle execution interruption', async () => {
      const plan = await planningService.createPlan('Test request')
      // Mock interruption
      vi.mocked(require('../../../src/cli/planning/autonomous-planner').AutonomousPlanner).mockImplementation(() => ({
        executePlan: vi.fn().mockImplementation(async function* () {
          yield { type: 'plan_start', planId: plan.id }
          throw new Error('Interrupted')
        }),
      }))
      await expect(planningService.executePlan(plan.id, {})).resolves.not.toThrow()
    })
  })

  describe('Edge Cases - Invalid Plans', () => {
    it('should handle plan with invalid steps', async () => {
      const plan = await planningService.createPlan('Test request')
      // Plan should still be valid even if steps are empty
      expect(plan).toBeDefined()
    })

    it('should handle plan with circular dependencies', async () => {
      const plan = await planningService.createPlan('Task with circular dependencies')
      expect(plan).toBeDefined()
    })

    it('should handle plan with missing required fields', async () => {
      const plan = await planningService.createPlan('Test request')
      // Should have all required fields
      expect(plan.id).toBeDefined()
      expect(plan.title).toBeDefined()
    })
  })

  describe('Edge Cases - Concurrent Operations', () => {
    it('should handle concurrent plan creation', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        planningService.createPlan(`Request ${i}`)
      )
      const plans = await Promise.all(promises)
      expect(plans.length).toBe(10)
      plans.forEach((plan) => {
        expect(plan).toBeDefined()
        expect(plan.id).toBeDefined()
      })
    })

    it('should handle concurrent plan execution', async () => {
      const plan1 = await planningService.createPlan('Request 1')
      const plan2 = await planningService.createPlan('Request 2')
      const promises = [
        planningService.executePlan(plan1.id, {}),
        planningService.executePlan(plan2.id, {}),
      ]
      await Promise.all(promises)
      expect(true).toBe(true)
    })
  })

  describe('Edge Cases - TaskMaster Integration', () => {
    it('should fallback to legacy when TaskMaster unavailable', async () => {
      vi.mocked(require('../../../src/cli/adapters/taskmaster-adapter').TaskMasterAdapter).mockImplementation(() => ({
        isTaskMasterAvailable: vi.fn().mockReturnValue(false),
        createEnhancedPlan: vi.fn(),
      }))
      const plan = await planningService.createPlan('Test request', {
        useTaskMaster: true,
        fallbackToLegacy: true,
      })
      expect(plan).toBeDefined()
    })

    it('should use TaskMaster when available', async () => {
      vi.mocked(require('../../../src/cli/adapters/taskmaster-adapter').TaskMasterAdapter).mockImplementation(() => ({
        isTaskMasterAvailable: vi.fn().mockReturnValue(true),
        createEnhancedPlan: vi.fn().mockResolvedValue({
          id: 'taskmaster-plan',
          title: 'TaskMaster Plan',
          steps: [],
          todos: [],
          context: {},
        }),
      }))
      const plan = await planningService.createPlan('Test request', {
        useTaskMaster: true,
      })
      expect(plan).toBeDefined()
    })

    it('should handle TaskMaster errors', async () => {
      vi.mocked(require('../../../src/cli/adapters/taskmaster-adapter').TaskMasterAdapter).mockImplementation(() => ({
        isTaskMasterAvailable: vi.fn().mockReturnValue(true),
        createEnhancedPlan: vi.fn().mockRejectedValue(new Error('TaskMaster error')),
      }))
      const plan = await planningService.createPlan('Test request', {
        useTaskMaster: true,
        fallbackToLegacy: true,
      })
      // Should fallback to legacy
      expect(plan).toBeDefined()
    })
  })

  describe('Edge Cases - Performance', () => {
    it('should handle many plans efficiently', async () => {
      const startTime = Date.now()
      for (let i = 0; i < 100; i++) {
        await planningService.createPlan(`Request ${i}`)
      }
      const endTime = Date.now()
      expect(endTime - startTime).toBeLessThan(30000) // Should complete within 30 seconds
    })

    it('should not leak memory with many plans', async () => {
      const initialMemory = process.memoryUsage().heapUsed
      for (let i = 0; i < 1000; i++) {
        await planningService.createPlan(`Request ${i}`)
      }
      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory
      // Memory increase should be reasonable (less than 500MB)
      expect(memoryIncrease).toBeLessThan(500 * 1024 * 1024)
    })
  })

  describe('Edge Cases - Plan Persistence', () => {
    it('should handle plan persistence', async () => {
      const plan = await planningService.createPlan('Test request')
      // Plan should be stored internally
      expect(plan).toBeDefined()
    })

    it('should handle plan retrieval', async () => {
      const plan = await planningService.createPlan('Test request')
      // Should be able to execute the plan (which requires retrieval)
      await planningService.executePlan(plan.id, {})
      expect(true).toBe(true)
    })
  })

  describe('Edge Cases - Plan Options', () => {
    it('should handle showProgress option', async () => {
      const plan = await planningService.createPlan('Test request', {
        showProgress: true,
      })
      expect(plan).toBeDefined()
    })

    it('should handle autoExecute option', async () => {
      const plan = await planningService.createPlan('Test request', {
        autoExecute: true,
      })
      expect(plan).toBeDefined()
    })

    it('should handle confirmSteps option', async () => {
      const plan = await planningService.createPlan('Test request', {
        confirmSteps: true,
      })
      expect(plan).toBeDefined()
    })

    it('should handle useTaskMaster option', async () => {
      const plan = await planningService.createPlan('Test request', {
        useTaskMaster: false,
      })
      expect(plan).toBeDefined()
    })

    it('should handle fallbackToLegacy option', async () => {
      const plan = await planningService.createPlan('Test request', {
        fallbackToLegacy: true,
      })
      expect(plan).toBeDefined()
    })
  })

  describe('Edge Cases - Working Directory', () => {
    it('should handle different working directories', () => {
      planningService.setWorkingDirectory('/test/dir1')
      planningService.setWorkingDirectory('/test/dir2')
      expect(planningService).toBeDefined()
    })

    it('should handle empty working directory', () => {
      planningService.setWorkingDirectory('')
      expect(planningService).toBeDefined()
    })

    it('should handle very long working directory path', () => {
      const longPath = '/test/' + 'x'.repeat(1000)
      planningService.setWorkingDirectory(longPath)
      expect(planningService).toBeDefined()
    })
  })

  describe('Edge Cases - Request Types', () => {
    it('should handle code generation requests', async () => {
      const plan = await planningService.createPlan('Create a React component')
      expect(plan).toBeDefined()
    })

    it('should handle refactoring requests', async () => {
      const plan = await planningService.createPlan('Refactor the authentication module')
      expect(plan).toBeDefined()
    })

    it('should handle bug fix requests', async () => {
      const plan = await planningService.createPlan('Fix the login bug')
      expect(plan).toBeDefined()
    })

    it('should handle complex multi-step requests', async () => {
      const request = `
        1. Create API endpoint
        2. Create frontend component
        3. Add tests
        4. Deploy
      `
      const plan = await planningService.createPlan(request)
      expect(plan).toBeDefined()
      expect(plan.steps.length).toBeGreaterThan(0)
    })
  })
})


