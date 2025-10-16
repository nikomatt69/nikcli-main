/**
 * Tests for AgentManager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AgentManager } from '../core/agent-manager'
import type { AgentConfig, CreateAgentTask } from '../types'

describe('AgentManager', () => {
  let agentManager: AgentManager

  beforeEach(() => {
    agentManager = new AgentManager({ maxConcurrentTasks: 3 })
  })

  describe('Agent Registration', () => {
    it('should register an agent successfully', async () => {
      const agent: AgentConfig = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'A test agent',
        specialization: 'testing',
        capabilities: [
          {
            name: 'test-capability',
            description: 'Test capability',
            version: '1.0.0',
            supportedTasks: ['test'],
            performanceScore: 90,
            isActive: true,
          },
        ],
        maxConcurrentTasks: 2,
        timeout: 300000,
        retryAttempts: 3,
        autonomyLevel: 'semi-autonomous',
      }

      await agentManager.registerAgent(agent)

      const registeredAgent = agentManager.getAgent('test-agent')
      expect(registeredAgent).toBeDefined()
      expect(registeredAgent?.name).toBe('Test Agent')
    })

    it('should throw error when registering agent with duplicate ID', async () => {
      const agent: AgentConfig = {
        id: 'duplicate-agent',
        name: 'Duplicate Agent',
        description: 'A duplicate agent',
        specialization: 'testing',
        capabilities: [],
        maxConcurrentTasks: 1,
        timeout: 300000,
        retryAttempts: 3,
        autonomyLevel: 'supervised',
      }

      await agentManager.registerAgent(agent)

      await expect(agentManager.registerAgent(agent)).rejects.toThrow(
        'Agent with id duplicate-agent already exists'
      )
    })

    it('should throw error when registering agent without required fields', async () => {
      const invalidAgent = {
        id: '',
        name: 'Invalid Agent',
      } as AgentConfig

      await expect(agentManager.registerAgent(invalidAgent)).rejects.toThrow(
        'Agent must have id, name, and specialization'
      )
    })
  })

  describe('Agent Management', () => {
    beforeEach(async () => {
      const agent: AgentConfig = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'A test agent',
        specialization: 'testing',
        capabilities: [
          {
            name: 'test-capability',
            description: 'Test capability',
            version: '1.0.0',
            supportedTasks: ['test'],
            performanceScore: 90,
            isActive: true,
          },
        ],
        maxConcurrentTasks: 2,
        timeout: 300000,
        retryAttempts: 3,
        autonomyLevel: 'semi-autonomous',
      }

      await agentManager.registerAgent(agent)
    })

    it('should get agent by ID', () => {
      const agent = agentManager.getAgent('test-agent')
      expect(agent).toBeDefined()
      expect(agent?.name).toBe('Test Agent')
    })

    it('should return undefined for non-existent agent', () => {
      const agent = agentManager.getAgent('non-existent')
      expect(agent).toBeUndefined()
    })

    it('should list all agents', () => {
      const agents = agentManager.listAgents()
      expect(agents).toHaveLength(1)
      expect(agents[0].name).toBe('Test Agent')
    })

    it('should get agents by capability', () => {
      const agents = agentManager.getAgentsByCapability('test-capability')
      expect(agents).toHaveLength(1)
      expect(agents[0].name).toBe('Test Agent')
    })
  })

  describe('Task Management', () => {
    beforeEach(async () => {
      const agent: AgentConfig = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'A test agent',
        specialization: 'testing',
        capabilities: [
          {
            name: 'test-capability',
            description: 'Test capability',
            version: '1.0.0',
            supportedTasks: ['test'],
            performanceScore: 90,
            isActive: true,
          },
        ],
        maxConcurrentTasks: 2,
        timeout: 300000,
        retryAttempts: 3,
        autonomyLevel: 'semi-autonomous',
      }

      await agentManager.registerAgent(agent)
    })

    it('should schedule a task successfully', async () => {
      const task: CreateAgentTask = {
        type: 'user_request',
        title: 'Test Task',
        description: 'A test task',
        priority: 'medium',
        data: { test: 'data' },
        requiredCapabilities: ['test-capability'],
        estimatedDuration: 1000,
      }

      const agentId = await agentManager.scheduleTask(task)
      expect(agentId).toBe('test-agent')
    })

    it('should throw error when no suitable agent available', async () => {
      const task: CreateAgentTask = {
        type: 'user_request',
        title: 'Test Task',
        description: 'A test task',
        priority: 'medium',
        data: { test: 'data' },
        requiredCapabilities: ['non-existent-capability'],
        estimatedDuration: 1000,
      }

      await expect(agentManager.scheduleTask(task)).rejects.toThrow(
        'No suitable agent available for this task'
      )
    })

    it('should throw error when preferred agent cannot handle task', async () => {
      const task: CreateAgentTask = {
        type: 'user_request',
        title: 'Test Task',
        description: 'A test task',
        priority: 'medium',
        data: { test: 'data' },
        requiredCapabilities: ['non-existent-capability'],
        estimatedDuration: 1000,
      }

      await expect(agentManager.scheduleTask(task, 'test-agent')).rejects.toThrow(
        'Preferred agent test-agent cannot handle this task'
      )
    })
  })

  describe('Statistics', () => {
    it('should return correct statistics', () => {
      const stats = agentManager.getStats()
      expect(stats).toHaveProperty('totalAgents')
      expect(stats).toHaveProperty('activeAgents')
      expect(stats).toHaveProperty('totalTasks')
      expect(stats).toHaveProperty('pendingTasks')
      expect(stats).toHaveProperty('completedTasks')
      expect(stats).toHaveProperty('failedTasks')
      expect(stats).toHaveProperty('averageTaskDuration')
    })
  })

  describe('Cleanup', () => {
    it('should cleanup successfully', async () => {
      await expect(agentManager.cleanup()).resolves.not.toThrow()
    })
  })
})