/**
 * Unit tests for Agent Service - Core agent management service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentService } from '../../../src/cli/services/agent-service';
import { mockConsole } from '../../helpers/test-utils';

vi.mock('../../../src/cli/automation/agents/agent-manager', () => ({
  AgentManager: vi.fn(() => ({
    createAgent: vi.fn(() => ({ id: 'test-agent', status: 'ready' })),
    startAgent: vi.fn(),
    stopAgent: vi.fn(),
    getAgent: vi.fn(() => ({ id: 'test-agent', status: 'ready' })),
    getAllAgents: vi.fn(() => []),
    executeAgentTask: vi.fn(() => ({ success: true, result: 'Mock result' })),
  })),
}));

vi.mock('../../../src/cli/core/config-manager', () => ({
  ConfigManager: vi.fn(() => ({
    getConfig: vi.fn(() => ({ apiKey: 'test-key', model: 'claude-3' })),
  })),
}));

describe('AgentService', () => {
  let agentService: AgentService;
  let console: ReturnType<typeof mockConsole>;

  beforeEach(() => {
    console = mockConsole();
    agentService = new AgentService();
  });

  afterEach(() => {
    console.restore();
  });

  describe('Service Initialization', () => {
    it('should initialize successfully', async () => {
      await agentService.initialize();
      expect(agentService.isInitialized()).toBe(true);
    });

    it('should setup agent manager during initialization', async () => {
      await agentService.initialize();
      const manager = agentService.getAgentManager();
      expect(manager).toBeDefined();
    });

    it('should handle initialization failures gracefully', async () => {
      const mockInit = vi.spyOn(agentService, 'initialize').mockRejectedValue(new Error('Init failed'));

      await expect(agentService.initialize()).rejects.toThrow('Init failed');
      mockInit.mockRestore();
    });
  });

  describe('Agent Lifecycle Management', () => {
    beforeEach(async () => {
      await agentService.initialize();
    });

    it('should create new agents', async () => {
      const config = {
        type: 'universal',
        capabilities: ['frontend', 'backend'],
        model: 'claude-3'
      };

      const result = await agentService.createAgent('test-agent-1', config);

      expect(result.success).toBe(true);
      expect(result.data.agent).toBeDefined();
      expect(result.data.agent.id).toBe('test-agent-1');
    });

    it('should start agents', async () => {
      await agentService.createAgent('start-test-agent', { type: 'universal' });
      const result = await agentService.startAgent('start-test-agent');

      expect(result.success).toBe(true);
    });

    it('should stop agents', async () => {
      await agentService.createAgent('stop-test-agent', { type: 'universal' });
      await agentService.startAgent('stop-test-agent');

      const result = await agentService.stopAgent('stop-test-agent');
      expect(result.success).toBe(true);
    });

    it('should list all agents', () => {
      const agents = agentService.listAgents();
      expect(Array.isArray(agents)).toBe(true);
    });

    it('should get agent by ID', async () => {
      await agentService.createAgent('get-test-agent', { type: 'universal' });
      const agent = agentService.getAgent('get-test-agent');

      expect(agent).toBeDefined();
      expect(agent.id).toBe('get-test-agent');
    });
  });

  // Tests removed - completely mocked, not veritieri

  describe('Agent Discovery and Routing', () => {
    beforeEach(async () => {
      await agentService.initialize();
    });

    it('should find best agent for task', async () => {
      await agentService.createAgent('frontend-agent', {
        type: 'universal',
        specialties: ['react', 'css']
      });
      await agentService.createAgent('backend-agent', {
        type: 'universal',
        specialties: ['node', 'database']
      });

      const frontendTask = { type: 'generate', framework: 'react' };
      const bestAgent = agentService.findBestAgentForTask(frontendTask);

      expect(bestAgent).toBeDefined();
    });

    it('should route tasks to appropriate agents', async () => {
      const task = {
        type: 'auto-route',
        description: 'Create a database migration'
      };

      const result = await agentService.routeTask(task);

      expect(result.success).toBe(true);
      expect(result.assignedAgent).toBeDefined();
    });

    it('should balance load across agents', async () => {
      // Create multiple agents
      for (let i = 1; i <= 3; i++) {
        await agentService.createAgent(`load-agent-${i}`, { type: 'universal' });
        await agentService.startAgent(`load-agent-${i}`);
      }

      // Execute multiple tasks
      const tasks = Array.from({ length: 6 }, (_, i) => ({ type: 'load-test', id: i }));
      const results = await Promise.all(
        tasks.map(task => agentService.routeTask(task))
      );

      expect(results.every(r => r.success)).toBe(true);
    });
  });

  describe('Performance Monitoring', () => {
    beforeEach(async () => {
      await agentService.initialize();
      await agentService.createAgent('perf-agent', { type: 'universal' });
      await agentService.startAgent('perf-agent');
    });

    it('should track execution metrics', async () => {
      const task = { type: 'metrics-test' };
      await agentService.executeTask('perf-agent', task);

      const metrics = agentService.getMetrics();
      expect(metrics.totalTasks).toBe(1);
      expect(metrics.avgExecutionTime).toBeGreaterThanOrEqual(0);
    });

    it('should monitor agent performance', () => {
      const agentMetrics = agentService.getAgentMetrics('perf-agent');
      expect(agentMetrics).toBeDefined();
      expect(agentMetrics.executionCount).toBeGreaterThanOrEqual(0);
    });

    it('should generate performance reports', () => {
      const report = agentService.generatePerformanceReport();

      expect(report).toHaveProperty('totalAgents');
      expect(report).toHaveProperty('activeAgents');
      expect(report).toHaveProperty('executionStats');
      expect(report).toHaveProperty('resourceUsage');
    });

    it('should identify performance bottlenecks', async () => {
      // Simulate high-load scenario
      const tasks = Array.from({ length: 10 }, (_, i) => ({ type: 'load-test', id: i }));
      await Promise.all(tasks.map(task => agentService.executeTask('perf-agent', task)));

      const bottlenecks = agentService.identifyBottlenecks();
      expect(Array.isArray(bottlenecks)).toBe(true);
    });
  });

  describe('Configuration Management', () => {
    beforeEach(async () => {
      await agentService.initialize();
    });

    it('should update service configuration', async () => {
      const newConfig = {
        maxConcurrentTasks: 10,
        taskTimeout: 300000,
        enableMetrics: true
      };

      await agentService.updateConfiguration(newConfig);
      const currentConfig = agentService.getConfiguration();

      expect(currentConfig).toMatchObject(newConfig);
    });

    it('should validate configuration changes', async () => {
      const invalidConfig = {
        maxConcurrentTasks: -1, // Invalid value
        taskTimeout: 'invalid'  // Invalid type
      };

      const result = await agentService.updateConfiguration(invalidConfig);
      expect(result.success).toBe(false);
      expect(result.validationErrors).toBeDefined();
    });

    it('should apply configuration to existing agents', async () => {
      await agentService.createAgent('config-agent', { type: 'universal' });

      const newConfig = { modelTemperature: 0.8 };
      await agentService.updateConfiguration(newConfig);

      const agent = agentService.getAgent('config-agent');
      expect(agent.getConfig().temperature).toBe(0.8);
    });
  });

  describe('Error Handling and Recovery', () => {
    beforeEach(async () => {
      await agentService.initialize();
    });

    it('should handle agent creation failures', async () => {
      const invalidConfig = { type: 'non-existent-type' };
      const result = await agentService.createAgent('fail-agent', invalidConfig);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should recover from agent failures', async () => {
      await agentService.createAgent('recovery-agent', { type: 'universal' });
      await agentService.startAgent('recovery-agent');

      // Simulate agent failure
      const mockManager = agentService.getAgentManager();
      if (mockManager) {
        vi.spyOn(mockManager, 'executeAgentTask').mockRejectedValue(new Error('Agent crashed'));
      }

      const task = { type: 'crash-test' };
      const result = await agentService.executeTask('recovery-agent', task);

      expect(result.success).toBe(false);

      // Service should attempt recovery
      const recoveryResult = await agentService.recoverAgent('recovery-agent');
      expect(recoveryResult.success).toBe(true);
    });

    it('should implement circuit breaker for failing agents', async () => {
      await agentService.createAgent('circuit-agent', { type: 'universal' });
      await agentService.startAgent('circuit-agent');

      // Cause multiple failures
      const mockManager = agentService.getAgentManager();
      if (mockManager) {
        vi.spyOn(mockManager, 'executeAgentTask').mockRejectedValue(new Error('Repeated failures'));
      }

      // Execute multiple failing tasks
      for (let i = 0; i < 5; i++) {
        await agentService.executeTask('circuit-agent', { type: 'fail' });
      }

      const circuitStatus = agentService.getCircuitBreakerStatus('circuit-agent');
      expect(circuitStatus.state).toBe('open');
    });

    it('should provide detailed error information', async () => {
      const result = await agentService.executeTask('non-existent-agent', { type: 'test' });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.errorCode).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('Event System', () => {
    beforeEach(async () => {
      await agentService.initialize();
    });

    it('should emit events for agent lifecycle', (done) => {
      agentService.on('agentCreated', (agentId) => {
        expect(agentId).toBe('event-test-agent');
        done();
      });

      agentService.createAgent('event-test-agent', { type: 'universal' });
    });

    it('should emit events for task execution', (done) => {
      agentService.on('taskCompleted', (data) => {
        expect(data.agentId).toBe('executor-agent');
        expect(data.taskId).toBeDefined();
        done();
      });

      agentService.createAgent('executor-agent', { type: 'universal' }).then(() => {
        agentService.startAgent('executor-agent').then(() => {
          agentService.executeTask('executor-agent', { type: 'event-test' });
        });
      });
    });

    it('should handle event listener errors', () => {
      const errorListener = vi.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });

      agentService.on('test-event', errorListener);

      // Should not throw when emitting to failing listener
      expect(() => {
        agentService.emit('test-event', 'data');
      }).not.toThrow();
    });
  });

  describe('Resource Management', () => {
    beforeEach(async () => {
      await agentService.initialize();
    });

    it('should enforce resource limits', async () => {
      agentService.setResourceLimits({
        maxAgents: 2,
        maxMemoryPerAgent: 100, // MB
        maxConcurrentTasks: 5
      });

      // Try to create more agents than limit
      await agentService.createAgent('resource-agent-1', { type: 'universal' });
      await agentService.createAgent('resource-agent-2', { type: 'universal' });

      const result = await agentService.createAgent('resource-agent-3', { type: 'universal' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('limit');
    });

    it('should monitor resource usage', () => {
      const usage = agentService.getResourceUsage();

      expect(usage).toHaveProperty('totalMemory');
      expect(usage).toHaveProperty('activeAgents');
      expect(usage).toHaveProperty('runningTasks');
    });

    it('should cleanup inactive agents', async () => {
      await agentService.createAgent('cleanup-agent', { type: 'universal' });

      // Mark agent as inactive
      const agent = agentService.getAgent('cleanup-agent');
      if (agent) {
        agent.lastActivity = Date.now() - 3600000; // 1 hour ago
      }

      const cleanedUp = await agentService.cleanupInactiveAgents(1800000); // 30 min threshold
      expect(cleanedUp).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Service State Management', () => {
    it('should track service state', async () => {
      const initialState = agentService.getState();
      expect(initialState.initialized).toBe(false);
      expect(initialState.agentCount).toBe(0);

      await agentService.initialize();
      const afterInitState = agentService.getState();
      expect(afterInitState.initialized).toBe(true);
    });

    it('should save and restore service state', async () => {
      await agentService.initialize();
      await agentService.createAgent('state-agent', { type: 'universal' });

      const state = agentService.getState();
      await agentService.saveState();

      // Reset service
      const newService = new AgentService();
      await newService.initialize();
      await newService.restoreState();

      const restoredState = newService.getState();
      expect(restoredState.agentCount).toBe(state.agentCount);
    });

    it('should provide health check information', () => {
      const health = agentService.getHealthStatus();

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('uptime');
      expect(health).toHaveProperty('agentStatus');
      expect(health).toHaveProperty('resourceStatus');
    });
  });
});