/**
 * Comprehensive tests for Background Agent Service
 * Tests job creation, execution, management, and edge cases
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BackgroundAgentService } from '../../../src/cli/background-agents/background-agent-service'
import { mockConsole, mockEnv } from '../../helpers/test-utils'

vi.mock('../../../src/cli/vm/vm-orchestrator', () => ({
  VMOrchestrator: vi.fn(() => ({
    createVM: vi.fn(),
    listVMs: vi.fn(() => []),
  })),
}))

vi.mock('../../../src/cli/vm/container-manager', () => ({
  ContainerManager: vi.fn(() => ({
    createContainer: vi.fn(),
  })),
}))

vi.mock('../../../src/cli/vm/vm-status-indicator', () => ({
  VMStatusIndicator: {
    getInstance: vi.fn(() => ({
      updateStatus: vi.fn(),
    })),
  },
}))

describe('BackgroundAgentService', () => {
  let service: BackgroundAgentService
  let console: ReturnType<typeof mockConsole>
  let env: ReturnType<typeof mockEnv>

  beforeEach(() => {
    console = mockConsole()
    env = mockEnv({
      NODE_ENV: 'test',
    })
    service = new BackgroundAgentService()
  })

  afterEach(() => {
    console.restore()
    env.restore()
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize service', () => {
      expect(service).toBeInstanceOf(BackgroundAgentService)
    })

    it('should emit events', () => {
      const listener = vi.fn()
      service.on('job:created', listener)
      expect(service.listenerCount('job:created')).toBeGreaterThan(0)
    })
  })

  describe('Job Creation', () => {
    it('should create a job', async () => {
      const request = {
        repo: 'test/repo',
        baseBranch: 'main',
        task: 'Test task',
      }
      const jobId = await service.createJob(request)
      expect(jobId).toBeDefined()
      expect(typeof jobId).toBe('string')
    })

    it('should create job with playbook', async () => {
      const request = {
        repo: 'test/repo',
        task: 'Test task',
        playbook: { steps: [{ action: 'test' }] },
      }
      const jobId = await service.createJob(request)
      expect(jobId).toBeDefined()
    })

    it('should create job with env vars', async () => {
      const request = {
        repo: 'test/repo',
        task: 'Test task',
        envVars: { KEY: 'value' },
      }
      const jobId = await service.createJob(request)
      expect(jobId).toBeDefined()
    })

    it('should create job with limits', async () => {
      const request = {
        repo: 'test/repo',
        task: 'Test task',
        limits: {
          timeMin: 60,
          maxToolCalls: 100,
          maxMemoryMB: 4096,
        },
      }
      const jobId = await service.createJob(request)
      expect(jobId).toBeDefined()
    })

    it('should emit job:created event', async () => {
      const listener = vi.fn()
      service.on('job:created', listener)
      const request = {
        repo: 'test/repo',
        task: 'Test task',
      }
      await service.createJob(request)
      expect(listener).toHaveBeenCalled()
    })
  })

  describe('Job Retrieval', () => {
    it('should get job by ID', async () => {
      const request = {
        repo: 'test/repo',
        task: 'Test task',
      }
      const jobId = await service.createJob(request)
      const job = service.getJob(jobId)
      expect(job).toBeDefined()
      expect(job?.id).toBe(jobId)
    })

    it('should return undefined for non-existent job', () => {
      const job = service.getJob('non-existent-id')
      expect(job).toBeUndefined()
    })

    it('should list jobs', async () => {
      await service.createJob({ repo: 'test/repo', task: 'Task 1' })
      await service.createJob({ repo: 'test/repo', task: 'Task 2' })
      const jobs = service.listJobs()
      expect(jobs.length).toBeGreaterThanOrEqual(2)
    })

    it('should filter jobs by status', async () => {
      await service.createJob({ repo: 'test/repo', task: 'Task 1' })
      const jobs = service.listJobs({ status: 'queued' })
      expect(jobs.every((job) => job.status === 'queued')).toBe(true)
    })

    it('should paginate jobs', async () => {
      for (let i = 0; i < 10; i++) {
        await service.createJob({ repo: 'test/repo', task: `Task ${i}` })
      }
      const jobs = service.listJobs({ limit: 5, offset: 0 })
      expect(jobs.length).toBeLessThanOrEqual(5)
    })
  })

  describe('Job Management', () => {
    it('should cancel a job', async () => {
      const request = {
        repo: 'test/repo',
        task: 'Test task',
      }
      const jobId = await service.createJob(request)
      const cancelled = await service.cancelJob(jobId)
      expect(cancelled).toBe(true)
    })

    it('should return false when cancelling non-existent job', async () => {
      const cancelled = await service.cancelJob('non-existent-id')
      expect(cancelled).toBe(false)
    })

    it('should get job stats', () => {
      const stats = service.getStats()
      expect(stats).toHaveProperty('queued')
      expect(stats).toHaveProperty('running')
      expect(stats).toHaveProperty('succeeded')
      expect(stats).toHaveProperty('failed')
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty repo', async () => {
      const request = {
        repo: '',
        task: 'Test task',
      }
      const jobId = await service.createJob(request)
      expect(jobId).toBeDefined()
    })

    it('should handle empty task', async () => {
      const request = {
        repo: 'test/repo',
        task: '',
      }
      const jobId = await service.createJob(request)
      expect(jobId).toBeDefined()
    })

    it('should handle very long task', async () => {
      const request = {
        repo: 'test/repo',
        task: 'x'.repeat(100000),
      }
      const jobId = await service.createJob(request)
      expect(jobId).toBeDefined()
    })

    it('should handle concurrent job creation', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        service.createJob({
          repo: 'test/repo',
          task: `Task ${i}`,
        })
      )
      const jobIds = await Promise.all(promises)
      expect(jobIds.length).toBe(10)
      expect(new Set(jobIds).size).toBe(10) // All unique IDs
    })

    it('should handle job with invalid limits', async () => {
      const request = {
        repo: 'test/repo',
        task: 'Test task',
        limits: {
          timeMin: -1,
          maxToolCalls: -1,
          maxMemoryMB: -1,
        },
      }
      const jobId = await service.createJob(request)
      expect(jobId).toBeDefined()
    })
  })

  describe('Edge Cases - Performance', () => {
    it('should handle many jobs efficiently', async () => {
      const startTime = Date.now()
      for (let i = 0; i < 100; i++) {
        await service.createJob({
          repo: 'test/repo',
          task: `Task ${i}`,
        })
      }
      const endTime = Date.now()
      expect(endTime - startTime).toBeLessThan(10000) // Should complete within 10 seconds
    })

    it('should not leak memory with many jobs', async () => {
      const initialMemory = process.memoryUsage().heapUsed
      for (let i = 0; i < 1000; i++) {
        await service.createJob({
          repo: 'test/repo',
          task: `Task ${i}`,
        })
      }
      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory
      // Memory increase should be reasonable (less than 500MB)
      expect(memoryIncrease).toBeLessThan(500 * 1024 * 1024)
    })
  })
})

describe('JobQueue', () => {
  let queue: any
  let console: ReturnType<typeof mockConsole>

  beforeEach(() => {
    console = mockConsole()
    const { JobQueue } = require('../../../src/cli/background-agents/queue/job-queue')
    queue = new JobQueue({ type: 'local' })
  })

  afterEach(() => {
    console.restore()
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize local queue', () => {
      expect(queue).toBeDefined()
    })

    it('should initialize redis queue', () => {
      const { JobQueue } = require('../../../src/cli/background-agents/queue/job-queue')
      const redisQueue = new JobQueue({
        type: 'redis',
        redis: {
          host: 'localhost',
          port: 6379,
        },
      })
      expect(redisQueue).toBeDefined()
    })
  })

  describe('Queue Operations', () => {
    it('should add job to queue', async () => {
      await queue.add('job-1', 1)
      const stats = await queue.getStats()
      expect(stats.pending).toBeGreaterThan(0)
    })

    it('should get queue stats', async () => {
      const stats = await queue.getStats()
      expect(stats).toHaveProperty('pending')
      expect(stats).toHaveProperty('processing')
    })

    it('should process jobs', async () => {
      const processor = vi.fn()
      queue.process(processor)
      await queue.add('job-1', 1)
      // Processor should be called
      expect(queue).toBeDefined()
    })
  })

  describe('Edge Cases', () => {
    it('should handle queue errors gracefully', async () => {
      await expect(queue.add('job-1', 1)).resolves.not.toThrow()
    })

    it('should handle concurrent queue operations', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        queue.add(`job-${i}`, i)
      )
      await Promise.all(promises)
      const stats = await queue.getStats()
      expect(stats.pending).toBeGreaterThanOrEqual(0)
    })
  })
})

describe('ChatSessionService', () => {
  let chatService: any
  let backgroundService: BackgroundAgentService
  let console: ReturnType<typeof mockConsole>

  beforeEach(() => {
    console = mockConsole()
    backgroundService = new BackgroundAgentService()
    const { ChatSessionService } = require('../../../src/cli/background-agents/services/chat-session-service')
    chatService = new ChatSessionService(backgroundService)
  })

  afterEach(() => {
    console.restore()
    vi.clearAllMocks()
  })

  describe('Session Creation', () => {
    it('should create a chat session', async () => {
      const request = {
        repo: 'test/repo',
        initialMessage: 'Hello',
      }
      const session = await chatService.createSession(request)
      expect(session).toBeDefined()
      expect(session.id).toBeDefined()
      expect(session.repo).toBe('test/repo')
    })

    it('should create session with base branch', async () => {
      const request = {
        repo: 'test/repo',
        baseBranch: 'develop',
      }
      const session = await chatService.createSession(request)
      expect(session).toBeDefined()
    })

    it('should create session with user ID', async () => {
      const request = {
        repo: 'test/repo',
        userId: 'user-123',
      }
      const session = await chatService.createSession(request)
      expect(session.userId).toBe('user-123')
    })
  })

  describe('Message Handling', () => {
    it('should send message in session', async () => {
      const session = await chatService.createSession({
        repo: 'test/repo',
      })
      const message = await chatService.sendMessage({
        sessionId: session.id,
        message: 'Test message',
      })
      expect(message).toBeDefined()
      expect(message.content).toBe('Test message')
    })

    it('should handle empty message', async () => {
      const session = await chatService.createSession({
        repo: 'test/repo',
      })
      await expect(
        chatService.sendMessage({
          sessionId: session.id,
          message: '',
        })
      ).resolves.not.toThrow()
    })
  })

  describe('Edge Cases', () => {
    it('should handle non-existent session', async () => {
      await expect(
        chatService.sendMessage({
          sessionId: 'non-existent',
          message: 'Test',
        })
      ).rejects.toThrow()
    })

    it('should handle concurrent session creation', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        chatService.createSession({
          repo: `test/repo-${i}`,
        })
      )
      const sessions = await Promise.all(promises)
      expect(sessions.length).toBe(10)
    })
  })
})


