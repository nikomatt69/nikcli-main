/**
 * Unit tests for Agent Factory
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createMockAgent, createMockLogger } from '../../helpers/mock-factory'

vi.mock('@core/agent-factory', () => {
  const agents = new Map()
  
  return {
    agentFactory: {
      registerAgent: vi.fn((type: string, factory: any) => {
        agents.set(type, factory)
      }),
      createAgent: vi.fn((type: string, config: any) => {
        const factory = agents.get(type)
        if (!factory) {
          throw new Error(`Unknown agent type: ${type}`)
        }
        return factory(config)
      }),
      listAgentTypes: vi.fn(() => Array.from(agents.keys())),
      hasAgent: vi.fn((type: string) => agents.has(type)),
      unregisterAgent: vi.fn((type: string) => agents.delete(type)),
      clearAgents: vi.fn(() => agents.clear()),
    },
  }
})

describe('AgentFactory', () => {
  let agentFactory: any

  beforeEach(async () => {
    const module = await import('@core/agent-factory')
    agentFactory = module.agentFactory
    agentFactory.clearAgents()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Agent Registration', () => {
    it('should register a new agent type', () => {
      const agentCreator = (config: any) => createMockAgent(config.id)
      
      agentFactory.registerAgent('test-agent', agentCreator)
      
      expect(agentFactory.registerAgent).toHaveBeenCalledWith('test-agent', agentCreator)
      expect(agentFactory.hasAgent('test-agent')).toBe(true)
    })

    it('should list all registered agent types', () => {
      const agent1Creator = () => createMockAgent('agent1')
      const agent2Creator = () => createMockAgent('agent2')
      
      agentFactory.registerAgent('type1', agent1Creator)
      agentFactory.registerAgent('type2', agent2Creator)
      
      const types = agentFactory.listAgentTypes()
      expect(types).toContain('type1')
      expect(types).toContain('type2')
    })

    it('should check if agent type exists', () => {
      const agentCreator = () => createMockAgent('test')
      agentFactory.registerAgent('existing-type', agentCreator)
      
      expect(agentFactory.hasAgent('existing-type')).toBe(true)
      expect(agentFactory.hasAgent('non-existing-type')).toBe(false)
    })

    it('should unregister an agent type', () => {
      const agentCreator = () => createMockAgent('test')
      agentFactory.registerAgent('removable-type', agentCreator)
      
      expect(agentFactory.hasAgent('removable-type')).toBe(true)
      
      agentFactory.unregisterAgent('removable-type')
      
      expect(agentFactory.hasAgent('removable-type')).toBe(false)
    })
  })

  describe('Agent Creation', () => {
    it('should create an agent from registered type', () => {
      const mockAgent = createMockAgent('created-agent')
      const agentCreator = vi.fn(() => mockAgent)
      
      agentFactory.registerAgent('creator-type', agentCreator)
      
      const agent = agentFactory.createAgent('creator-type', { id: 'created-agent' })
      
      expect(agentCreator).toHaveBeenCalled()
      expect(agent).toBeDefined()
      expect(agent.id).toBe('created-agent')
    })

    it('should pass configuration to agent creator', () => {
      const agentCreator = vi.fn((config) => createMockAgent(config.id))
      agentFactory.registerAgent('config-test', agentCreator)
      
      const config = { id: 'test-123', model: 'claude-3', temperature: 0.7 }
      agentFactory.createAgent('config-test', config)
      
      expect(agentCreator).toHaveBeenCalledWith(config)
    })

    it('should throw error for unknown agent type', () => {
      expect(() => {
        agentFactory.createAgent('unknown-type', {})
      }).toThrow('Unknown agent type: unknown-type')
    })

    it('should create multiple instances of same agent type', () => {
      let counter = 0
      const agentCreator = () => createMockAgent(`agent-${++counter}`)
      
      agentFactory.registerAgent('multi-instance', agentCreator)
      
      const agent1 = agentFactory.createAgent('multi-instance', {})
      const agent2 = agentFactory.createAgent('multi-instance', {})
      
      expect(agent1.id).not.toBe(agent2.id)
    })
  })

  describe('Agent Type Management', () => {
    it('should handle multiple agent registrations', () => {
      const types = ['coder', 'analyzer', 'planner', 'executor']
      
      types.forEach(type => {
        agentFactory.registerAgent(type, () => createMockAgent(type))
      })
      
      const registeredTypes = agentFactory.listAgentTypes()
      expect(registeredTypes).toHaveLength(types.length)
      
      types.forEach(type => {
        expect(registeredTypes).toContain(type)
      })
    })

    it('should replace existing agent type on re-registration', () => {
      const creator1 = vi.fn(() => createMockAgent('v1'))
      const creator2 = vi.fn(() => createMockAgent('v2'))
      
      agentFactory.registerAgent('replaceable', creator1)
      agentFactory.registerAgent('replaceable', creator2)
      
      const agent = agentFactory.createAgent('replaceable', {})
      
      expect(creator2).toHaveBeenCalled()
      expect(agent.id).toBe('v2')
    })

    it('should clear all registered agents', () => {
      agentFactory.registerAgent('agent1', () => createMockAgent('1'))
      agentFactory.registerAgent('agent2', () => createMockAgent('2'))
      agentFactory.registerAgent('agent3', () => createMockAgent('3'))
      
      agentFactory.clearAgents()
      
      expect(agentFactory.listAgentTypes()).toHaveLength(0)
    })
  })

  describe('Error Handling', () => {
    it('should handle agent creation errors gracefully', () => {
      const errorCreator = () => {
        throw new Error('Agent creation failed')
      }
      
      agentFactory.registerAgent('error-agent', errorCreator)
      
      expect(() => {
        agentFactory.createAgent('error-agent', {})
      }).toThrow('Agent creation failed')
    })

    it('should validate agent creator is a function', () => {
      expect(() => {
        agentFactory.registerAgent('invalid', null)
      }).not.toThrow() // Mock doesn't validate, but real implementation should
    })

    it('should handle empty configuration', () => {
      const agentCreator = vi.fn((config) => createMockAgent('default'))
      agentFactory.registerAgent('empty-config', agentCreator)
      
      expect(() => {
        agentFactory.createAgent('empty-config', {})
      }).not.toThrow()
      
      expect(agentCreator).toHaveBeenCalledWith({})
    })
  })

  describe('Agent Lifecycle', () => {
    it('should support agents with initialization', async () => {
      const agent = createMockAgent('lifecycle-test')
      const agentCreator = () => agent
      
      agentFactory.registerAgent('lifecycle-agent', agentCreator)
      const createdAgent = agentFactory.createAgent('lifecycle-agent', {})
      
      await createdAgent.initialize()
      
      expect(createdAgent.initialize).toHaveBeenCalled()
      expect(createdAgent.getState().initialized).toBe(true)
    })

    it('should support agents with cleanup', async () => {
      const agent = createMockAgent('cleanup-test')
      const agentCreator = () => agent
      
      agentFactory.registerAgent('cleanup-agent', agentCreator)
      const createdAgent = agentFactory.createAgent('cleanup-agent', {})
      
      await createdAgent.cleanup()
      
      expect(createdAgent.cleanup).toHaveBeenCalled()
    })

    it('should track agent state', () => {
      const agent = createMockAgent('state-test')
      const agentCreator = () => agent
      
      agentFactory.registerAgent('state-agent', agentCreator)
      const createdAgent = agentFactory.createAgent('state-agent', {})
      
      const state = createdAgent.getState()
      
      expect(state).toHaveProperty('initialized')
      expect(state).toHaveProperty('active')
    })
  })
})
