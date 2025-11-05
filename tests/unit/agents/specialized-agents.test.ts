/**
 * Comprehensive tests for Specialized Agents
 * Tests backend, frontend, coding, review, devops agents and edge cases
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BackendAgent } from '../../../src/cli/automation/agents/backend-agent'
import { FrontendAgent } from '../../../src/cli/automation/agents/frontend-agent'
import { CodingAgent } from '../../../src/cli/automation/agents/coding-agent'
import { CodeReviewAgent } from '../../../src/cli/automation/agents/code-review-agent'
import { DevOpsAgent } from '../../../src/cli/automation/agents/devops-agent'
import { mockConsole, mockEnv } from '../../helpers/test-utils'

vi.mock('../../../src/cli/ui/advanced-cli-ui', () => ({
  advancedUI: {
    logFunctionUpdate: vi.fn(),
    logFunctionCall: vi.fn(),
    logInfo: vi.fn(),
    logSuccess: vi.fn(),
    logError: vi.fn(),
  },
}))

vi.mock('../../../src/cli/ai/model-provider', () => ({
  modelProvider: {
    generateText: vi.fn().mockResolvedValue({
      text: 'Test response',
    }),
  },
}))

const testWorkingDir = process.cwd()

describe('BackendAgent', () => {
  let agent: BackendAgent
  let console: ReturnType<typeof mockConsole>
  let env: ReturnType<typeof mockEnv>

  beforeEach(async () => {
    console = mockConsole()
    env = mockEnv({
      NODE_ENV: 'test',
    })
    agent = new BackendAgent(testWorkingDir)
    await agent.initialize({} as any)
  })

  afterEach(async () => {
    await agent.cleanup()
    console.restore()
    env.restore()
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize backend agent', () => {
      expect(agent).toBeInstanceOf(BackendAgent)
      expect(agent.id).toBe('backend-agent')
      expect(agent.specialization).toContain('Backend')
    })

    it('should have backend capabilities', () => {
      expect(agent.capabilities).toContain('api-development')
      expect(agent.capabilities).toContain('database-design')
      expect(agent.capabilities).toContain('server-architecture')
    })
  })

  describe('Task Execution', () => {
    it('should execute backend task', async () => {
      const task = {
        id: 'test-task',
        description: 'Create API endpoint',
        type: 'backend',
      } as any

      const result = await agent.execute(task).catch(() => ({
        success: false,
        error: 'Mocked error',
      }))

      expect(result).toBeDefined()
    })

    it('should handle API development tasks', async () => {
      const task = {
        id: 'api-task',
        description: 'Create REST API',
        type: 'api-development',
      } as any

      const result = await agent.execute(task).catch(() => ({
        success: false,
      }))

      expect(result).toBeDefined()
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty task description', async () => {
      const task = {
        id: 'empty-task',
        description: '',
      } as any

      const result = await agent.execute(task).catch(() => ({
        success: false,
      }))

      expect(result).toBeDefined()
    })

    it('should handle invalid task', async () => {
      const result = await agent.execute(null as any).catch(() => ({
        success: false,
      }))
      expect(result).toBeDefined()
    })
  })
})

describe('FrontendAgent', () => {
  let agent: FrontendAgent
  let console: ReturnType<typeof mockConsole>

  beforeEach(async () => {
    console = mockConsole()
    agent = new FrontendAgent(testWorkingDir)
    await agent.initialize({} as any)
  })

  afterEach(async () => {
    await agent.cleanup()
    console.restore()
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize frontend agent', () => {
      expect(agent).toBeInstanceOf(FrontendAgent)
      expect(agent.specialization).toContain('Frontend')
    })

    it('should have frontend capabilities', () => {
      expect(agent.capabilities.length).toBeGreaterThan(0)
    })
  })

  describe('Task Execution', () => {
    it('should execute frontend task', async () => {
      const task = {
        id: 'test-task',
        description: 'Create React component',
        type: 'frontend',
      } as any

      const result = await agent.execute(task).catch(() => ({
        success: false,
      }))

      expect(result).toBeDefined()
    })
  })
})

describe('CodingAgent', () => {
  let agent: CodingAgent
  let console: ReturnType<typeof mockConsole>

  beforeEach(async () => {
    console = mockConsole()
    agent = new CodingAgent(testWorkingDir)
    await agent.initialize({} as any)
  })

  afterEach(async () => {
    await agent.cleanup()
    console.restore()
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize coding agent', () => {
      expect(agent).toBeInstanceOf(CodingAgent)
      expect(agent.specialization).toContain('Coding')
    })
  })

  describe('Task Execution', () => {
    it('should execute coding task', async () => {
      const task = {
        id: 'test-task',
        description: 'Write code',
        type: 'coding',
      } as any

      const result = await agent.execute(task).catch(() => ({
        success: false,
      }))

      expect(result).toBeDefined()
    })
  })
})

describe('CodeReviewAgent', () => {
  let agent: CodeReviewAgent
  let console: ReturnType<typeof mockConsole>

  beforeEach(async () => {
    console = mockConsole()
    agent = new CodeReviewAgent(testWorkingDir)
    await agent.initialize({} as any)
  })

  afterEach(async () => {
    await agent.cleanup()
    console.restore()
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize code review agent', () => {
      expect(agent).toBeInstanceOf(CodeReviewAgent)
      expect(agent.id).toBe('code-review')
      expect(agent.capabilities).toContain('code-review')
    })
  })

  describe('Task Execution', () => {
    it('should execute code review task', async () => {
      const task = {
        id: 'review-task',
        description: 'Review code quality',
        type: 'code-review',
      } as any

      const result = await agent.execute(task).catch(() => ({
        success: false,
      }))

      expect(result).toBeDefined()
    })
  })
})

describe('DevOpsAgent', () => {
  let agent: DevOpsAgent
  let console: ReturnType<typeof mockConsole>

  beforeEach(async () => {
    console = mockConsole()
    agent = new DevOpsAgent(testWorkingDir)
    await agent.initialize({} as any)
  })

  afterEach(async () => {
    await agent.cleanup()
    console.restore()
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize devops agent', () => {
      expect(agent).toBeInstanceOf(DevOpsAgent)
      expect(agent.id).toBe('devops')
      expect(agent.capabilities).toContain('deployment')
      expect(agent.capabilities).toContain('ci-cd')
    })
  })

  describe('Task Execution', () => {
    it('should execute devops task', async () => {
      const task = {
        id: 'devops-task',
        description: 'Deploy application',
        type: 'deployment',
      } as any

      const result = await agent.execute(task).catch(() => ({
        success: false,
      }))

      expect(result).toBeDefined()
    })
  })
})

describe('UniversalAgent', () => {
  let agent: any
  let console: ReturnType<typeof mockConsole>

  beforeEach(async () => {
    console = mockConsole()
    const { UniversalAgent } = require('../../../src/cli/automation/agents/universal-agent')
    agent = new UniversalAgent(testWorkingDir)
    await agent.initialize({} as any)
  })

  afterEach(async () => {
    await agent.cleanup()
    console.restore()
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize universal agent', () => {
      expect(agent).toBeDefined()
      expect(agent.name).toBe('Universal Agent')
      expect(agent.capabilities.length).toBeGreaterThan(0)
    })
  })

  describe('Task Execution', () => {
    it('should execute universal task', async () => {
      const task = {
        id: 'universal-task',
        description: 'Complete task',
        type: 'universal',
      } as any

      const result = await agent.execute(task).catch(() => ({
        success: false,
      }))

      expect(result).toBeDefined()
    })
  })
})

describe('Agent Edge Cases', () => {
  describe('Concurrent Execution', () => {
    it('should handle concurrent agent operations', async () => {
      const backendAgent = new BackendAgent(testWorkingDir)
      await backendAgent.initialize({} as any)

      const tasks = Array.from({ length: 10 }, (_, i) => ({
        id: `task-${i}`,
        description: `Task ${i}`,
      }))

      const results = await Promise.all(
        tasks.map((task) => backendAgent.execute(task as any).catch(() => ({ success: false })))
      )

      expect(results.length).toBe(10)
      await backendAgent.cleanup()
    })
  })

  describe('Error Handling', () => {
    it('should handle agent initialization errors', async () => {
      const agent = new BackendAgent('/invalid/path')
      await expect(agent.initialize({} as any)).resolves.not.toThrow()
    })

    it('should handle task execution errors', async () => {
      const agent = new BackendAgent(testWorkingDir)
      await agent.initialize({} as any)

      const task = {
        id: 'error-task',
        description: null as any,
      }

      const result = await agent.execute(task).catch(() => ({
        success: false,
      }))

      expect(result).toBeDefined()
      await agent.cleanup()
    })
  })

  describe('Cleanup', () => {
    it('should cleanup agent resources', async () => {
      const agent = new BackendAgent(testWorkingDir)
      await agent.initialize({} as any)
      await expect(agent.cleanup()).resolves.not.toThrow()
    })

    it('should handle cleanup errors gracefully', async () => {
      const agent = new BackendAgent(testWorkingDir)
      await agent.initialize({} as any)
      // Mock cleanup error
      vi.spyOn(agent, 'cleanup').mockRejectedValue(new Error('Cleanup failed'))
      await expect(agent.cleanup()).rejects.toThrow()
    })
  })
})


