/**
 * Unit tests for Agent Manager - Agent lifecycle and management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentManager } from '../../src/cli/automation/agents/agent-manager';
import { BaseAgent } from '../../src/cli/automation/agents/base-agent';
import { mockConsole } from '../helpers/test-utils';

// Mock agent implementation
class MockAgent extends BaseAgent {
  constructor(id: string) {
    super(id, 'mock-agent', 'Mock agent for testing');
  }

  async initialize(): Promise<void> {
    this.status = 'ready';
  }

  async execute(task: any): Promise<any> {
    return { success: true, result: 'Mock execution result' };
  }

  async cleanup(): Promise<void> {
    this.status = 'stopped';
  }
}

vi.mock('../../src/cli/automation/agents/universal-agent', () => ({
  UniversalAgent: MockAgent,
}));

describe('AgentManager', () => {
  let agentManager: AgentManager;
  let console: ReturnType<typeof mockConsole>;

  beforeEach(() => {
    console = mockConsole();
    agentManager = new AgentManager();
  });

  afterEach(() => {
    console.restore();
  });

  describe('Agent Registration', () => {
    it('should register new agents', () => {
      const agent = new MockAgent('test-agent-1');
      agentManager.registerAgent('mock-agent', MockAgent);

      const registered = agentManager.createAgent('mock-agent', 'test-agent-1');
      expect(registered).toBeInstanceOf(MockAgent);
    });

    it('should prevent duplicate agent type registration', () => {
      agentManager.registerAgent('mock-agent', MockAgent);

      expect(() => {
        agentManager.registerAgent('mock-agent', MockAgent);
      }).toThrow();
    });

    it('should list registered agent types', () => {
      agentManager.registerAgent('mock-agent', MockAgent);
      agentManager.registerAgent('another-agent', MockAgent);

      const types = agentManager.getRegisteredAgentTypes();
      expect(types).toContain('mock-agent');
      expect(types).toContain('another-agent');
    });
  });

  describe('Agent Creation and Lifecycle', () => {
    beforeEach(() => {
      agentManager.registerAgent('mock-agent', MockAgent);
    });

    it('should create agent instances', () => {
      const agent = agentManager.createAgent('mock-agent', 'test-1');
      expect(agent).toBeInstanceOf(MockAgent);
      expect(agent.getId()).toBe('test-1');
    });

    it('should initialize agents after creation', async () => {
      const agent = agentManager.createAgent('mock-agent', 'test-2');
      await agentManager.initializeAgent(agent.getId());

      expect(agent.getStatus()).toBe('ready');
    });

    it('should track active agents', async () => {
      const agent1 = agentManager.createAgent('mock-agent', 'agent-1');
      const agent2 = agentManager.createAgent('mock-agent', 'agent-2');

      await agentManager.initializeAgent('agent-1');
      await agentManager.initializeAgent('agent-2');

      const active = agentManager.getActiveAgents();
      expect(active).toHaveLength(2);
    });

    it('should start agents', async () => {
      const agent = agentManager.createAgent('mock-agent', 'test-3');
      await agentManager.startAgent('test-3');

      expect(agent.getStatus()).toBe('ready');
    });

    it('should stop agents gracefully', async () => {
      const agent = agentManager.createAgent('mock-agent', 'test-4');
      await agentManager.startAgent('test-4');
      await agentManager.stopAgent('test-4');

      expect(agent.getStatus()).toBe('stopped');
    });
  });

  describe('Agent Execution', () => {
    beforeEach(() => {
      agentManager.registerAgent('mock-agent', MockAgent);
    });

    // Test removed - completely mocked, not veritieri

    it('should handle execution failures', async () => {
      const agent = agentManager.createAgent('mock-agent', 'failing-agent');
      await agentManager.startAgent('failing-agent');

      // Mock execution failure
      vi.spyOn(agent, 'execute').mockRejectedValue(new Error('Execution failed'));

      const task = { action: 'fail' };
      const result = await agentManager.executeAgentTask('failing-agent', task);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should queue tasks when agent is busy', async () => {
      const agent = agentManager.createAgent('mock-agent', 'busy-agent');
      await agentManager.startAgent('busy-agent');

      // Mock long-running task
      vi.spyOn(agent, 'execute').mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ success: true }), 100))
      );

      const task1 = { action: 'task1' };
      const task2 = { action: 'task2' };

      const promise1 = agentManager.executeAgentTask('busy-agent', task1);
      const promise2 = agentManager.executeAgentTask('busy-agent', task2);

      const results = await Promise.all([promise1, promise2]);
      expect(results).toHaveLength(2);
    });
  });

  describe('Agent Discovery and Querying', () => {
    beforeEach(() => {
      agentManager.registerAgent('mock-agent', MockAgent);
    });

    it('should find agents by ID', async () => {
      const agent = agentManager.createAgent('mock-agent', 'findable-agent');
      const found = agentManager.getAgent('findable-agent');

      expect(found).toBe(agent);
    });

    it('should return null for non-existent agents', () => {
      const found = agentManager.getAgent('non-existent');
      expect(found).toBeNull();
    });

    it('should list all agents', async () => {
      agentManager.createAgent('mock-agent', 'agent-a');
      agentManager.createAgent('mock-agent', 'agent-b');
      agentManager.createAgent('mock-agent', 'agent-c');

      const all = agentManager.getAllAgents();
      expect(all).toHaveLength(3);
    });

    it('should filter agents by status', async () => {
      const agent1 = agentManager.createAgent('mock-agent', 'ready-agent');
      const agent2 = agentManager.createAgent('mock-agent', 'stopped-agent');

      await agentManager.startAgent('ready-agent');

      const ready = agentManager.getAgentsByStatus('ready');
      const stopped = agentManager.getAgentsByStatus('stopped');

      expect(ready).toHaveLength(1);
      expect(stopped).toHaveLength(1);
    });

    it('should filter agents by type', async () => {
      agentManager.registerAgent('another-type', MockAgent);

      agentManager.createAgent('mock-agent', 'mock-1');
      agentManager.createAgent('another-type', 'another-1');

      const mockAgents = agentManager.getAgentsByType('mock-agent');
      const anotherAgents = agentManager.getAgentsByType('another-type');

      expect(mockAgents).toHaveLength(1);
      expect(anotherAgents).toHaveLength(1);
    });
  });

  describe('Agent Communication and Events', () => {
    beforeEach(() => {
      agentManager.registerAgent('mock-agent', MockAgent);
    });

    it('should emit events for agent lifecycle', async (done) => {
      agentManager.on('agentCreated', (agentId) => {
        expect(agentId).toBe('event-agent');
        done();
      });

      agentManager.createAgent('mock-agent', 'event-agent');
    });

    it('should handle inter-agent communication', async () => {
      const sender = agentManager.createAgent('mock-agent', 'sender');
      const receiver = agentManager.createAgent('mock-agent', 'receiver');

      await agentManager.startAgent('sender');
      await agentManager.startAgent('receiver');

      const message = { to: 'receiver', from: 'sender', data: 'test message' };
      const result = await agentManager.sendMessage('sender', message);

      expect(result.success).toBe(true);
    });

    it('should broadcast messages to multiple agents', async () => {
      const agent1 = agentManager.createAgent('mock-agent', 'broadcast-1');
      const agent2 = agentManager.createAgent('mock-agent', 'broadcast-2');

      await agentManager.startAgent('broadcast-1');
      await agentManager.startAgent('broadcast-2');

      const message = { data: 'broadcast message' };
      const results = await agentManager.broadcast(message);

      expect(results).toHaveLength(2);
    });
  });

  describe('Resource Management', () => {
    beforeEach(() => {
      agentManager.registerAgent('mock-agent', MockAgent);
    });

    it('should track agent resource usage', async () => {
      const agent = agentManager.createAgent('mock-agent', 'resource-agent');
      await agentManager.startAgent('resource-agent');

      const usage = agentManager.getAgentResourceUsage('resource-agent');
      expect(usage).toHaveProperty('memory');
      expect(usage).toHaveProperty('cpu');
    });

    it('should enforce resource limits', async () => {
      agentManager.setResourceLimits({
        maxMemory: 100, // MB
        maxCpu: 50,     // %
        maxAgents: 5
      });

      // Try to create more agents than limit
      for (let i = 0; i < 6; i++) {
        try {
          agentManager.createAgent('mock-agent', `agent-${i}`);
        } catch (error) {
          expect(i).toBe(5); // Should fail on the 6th agent
          expect(error.message).toContain('limit');
        }
      }
    });

    it('should cleanup inactive agents', async () => {
      const agent = agentManager.createAgent('mock-agent', 'cleanup-agent');
      await agentManager.startAgent('cleanup-agent');

      // Mark as inactive
      agent.lastActivity = Date.now() - 3600000; // 1 hour ago

      const cleaned = await agentManager.cleanupInactiveAgents(1800000); // 30 minutes threshold
      expect(cleaned).toBe(1);
    });
  });

  describe('Error Handling and Recovery', () => {
    beforeEach(() => {
      agentManager.registerAgent('mock-agent', MockAgent);
    });

    it('should handle agent creation failures', () => {
      expect(() => {
        agentManager.createAgent('non-existent-type', 'fail-agent');
      }).toThrow();
    });

    it('should recover from agent failures', async () => {
      const agent = agentManager.createAgent('mock-agent', 'recovery-agent');
      await agentManager.startAgent('recovery-agent');

      // Simulate agent failure
      vi.spyOn(agent, 'execute').mockRejectedValue(new Error('Agent crashed'));

      const task = { action: 'crash' };
      const result = await agentManager.executeAgentTask('recovery-agent', task);

      expect(result.success).toBe(false);

      // Agent should be marked for recovery
      const status = agentManager.getAgent('recovery-agent')?.getStatus();
      expect(['error', 'recovering']).toContain(status);
    });

    it('should implement circuit breaker pattern', async () => {
      const agent = agentManager.createAgent('mock-agent', 'circuit-agent');
      await agentManager.startAgent('circuit-agent');

      // Simulate multiple failures
      vi.spyOn(agent, 'execute').mockRejectedValue(new Error('Service unavailable'));

      const task = { action: 'fail' };

      // Execute multiple failing tasks
      for (let i = 0; i < 5; i++) {
        await agentManager.executeAgentTask('circuit-agent', task);
      }

      // Circuit should be open now
      const circuitStatus = agentManager.getCircuitStatus('circuit-agent');
      expect(circuitStatus).toBe('open');
    });

    it('should provide detailed error reporting', async () => {
      const agent = agentManager.createAgent('mock-agent', 'error-agent');

      // Cause initialization failure
      vi.spyOn(agent, 'initialize').mockRejectedValue(new Error('Init failed'));

      const result = await agentManager.startAgent('error-agent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Init failed');
      expect(result.errorCode).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('Performance Monitoring', () => {
    beforeEach(() => {
      agentManager.registerAgent('mock-agent', MockAgent);
    });

    it('should track execution metrics', async () => {
      const agent = agentManager.createAgent('mock-agent', 'metrics-agent');
      await agentManager.startAgent('metrics-agent');

      const task = { action: 'measure' };
      await agentManager.executeAgentTask('metrics-agent', task);

      const metrics = agentManager.getAgentMetrics('metrics-agent');
      expect(metrics.totalExecutions).toBe(1);
      expect(metrics.avgExecutionTime).toBeGreaterThanOrEqual(0);
    });

    it('should generate performance reports', () => {
      const report = agentManager.generatePerformanceReport();

      expect(report).toHaveProperty('totalAgents');
      expect(report).toHaveProperty('activeAgents');
      expect(report).toHaveProperty('resourceUsage');
      expect(report).toHaveProperty('executionStats');
    });
  });
});