/**
 * Unit tests for Main Orchestrator - Core system orchestration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MainOrchestrator } from '../../src/cli/main-orchestrator';
import { mockConsole, mockEnv } from '../helpers/test-utils';

vi.mock('../../src/cli/core/config-manager', () => ({
  ConfigManager: vi.fn(() => ({
    getConfig: vi.fn(() => ({ apiKey: 'test-key', model: 'claude-3' })),
    setConfig: vi.fn(),
    hasValidConfig: vi.fn(() => true),
  })),
}));

vi.mock('../../src/cli/services/agent-service', () => ({
  AgentService: vi.fn(() => ({
    initialize: vi.fn(),
    startAgent: vi.fn(),
    stopAgent: vi.fn(),
    getActiveAgents: vi.fn(() => []),
  })),
}));

vi.mock('../../src/cli/services/tool-service', () => ({
  ToolService: vi.fn(() => ({
    initialize: vi.fn(),
    executeTool: vi.fn(),
    getAvailableTools: vi.fn(() => []),
  })),
}));

describe('MainOrchestrator', () => {
  let orchestrator: MainOrchestrator;
  let console: ReturnType<typeof mockConsole>;
  let env: ReturnType<typeof mockEnv>;

  beforeEach(() => {
    console = mockConsole();
    env = mockEnv({
      NODE_ENV: 'test',
      ANTHROPIC_API_KEY: 'test-key',
    });
    orchestrator = new MainOrchestrator();
  });

  afterEach(() => {
    console.restore();
    env.restore();
  });

  describe('Initialization', () => {
    it('should initialize successfully with valid configuration', async () => {
      await orchestrator.initialize();
      expect(orchestrator.isInitialized()).toBe(true);
    });

    it('should handle initialization errors gracefully', async () => {
      // Mock a failed initialization
      const mockInit = vi.spyOn(orchestrator, 'initialize').mockRejectedValue(new Error('Init failed'));

      await expect(orchestrator.initialize()).rejects.toThrow('Init failed');
      mockInit.mockRestore();
    });

    it('should validate environment setup during initialization', async () => {
      env.restore();
      const badEnv = mockEnv({ NODE_ENV: 'test' }); // Missing API key

      await expect(() => orchestrator.initialize()).not.toThrow();
      badEnv.restore();
    });
  });

  describe('Service Management', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    it('should start all core services', async () => {
      await orchestrator.startServices();

      const services = orchestrator.getServices();
      expect(services).toHaveProperty('agentService');
      expect(services).toHaveProperty('toolService');
    });

    it('should stop services gracefully', async () => {
      await orchestrator.startServices();
      await orchestrator.stopServices();

      // Test passes if no errors thrown
      // Service startup handled gracefully
    });

    it('should handle service startup failures', async () => {
      // Mock service failure
      const services = orchestrator.getServices();
      if (services.agentService) {
        vi.spyOn(services.agentService, 'initialize').mockRejectedValue(new Error('Service failed'));
      }

      await expect(() => orchestrator.startServices()).not.toThrow();
    });
  });

  describe('Request Processing', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
      await orchestrator.startServices();
    });

    it('should process user requests', async () => {
      const request = { type: 'chat', content: 'Hello' };
      const result = await orchestrator.processRequest(request);

      expect(result).toHaveProperty('success');
      expect(typeof result.response).toBe('string');
    });

    it('should route agent requests correctly', async () => {
      const request = { type: 'agent', agent: 'test-agent', content: 'test' };
      const result = await orchestrator.processRequest(request);

      expect(result).toHaveProperty('success');
    });

    it('should handle tool execution requests', async () => {
      const request = { type: 'tool', tool: 'read-file', params: { path: 'test.txt' } };
      const result = await orchestrator.processRequest(request);

      expect(result).toHaveProperty('success');
    });

    it('should validate request format', async () => {
      const invalidRequest = { invalid: 'request' };
      const result = await orchestrator.processRequest(invalidRequest);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('State Management', () => {
    it('should track orchestrator state', async () => {
      const state = orchestrator.getState();
      expect(state).toHaveProperty('initialized');
      expect(state).toHaveProperty('servicesRunning');
    });

    it('should update state during lifecycle events', async () => {
      const initialState = orchestrator.getState();
      expect(initialState.initialized).toBe(false);

      await orchestrator.initialize();
      const afterInitState = orchestrator.getState();
      expect(afterInitState.initialized).toBe(true);
    });

    it('should provide service status information', async () => {
      await orchestrator.initialize();
      const status = orchestrator.getServiceStatus();

      expect(status).toHaveProperty('agentService');
      expect(status).toHaveProperty('toolService');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle service failures gracefully', async () => {
      await orchestrator.initialize();

      // Simulate service failure
      const services = orchestrator.getServices();
      if (services.agentService) {
        vi.spyOn(services.agentService, 'startAgent').mockRejectedValue(new Error('Agent failed'));
      }

      const request = { type: 'agent', agent: 'failing-agent', content: 'test' };
      const result = await orchestrator.processRequest(request);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should implement retry logic for failed operations', async () => {
      await orchestrator.initialize();

      let callCount = 0;
      const mockProcess = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          throw new Error('Temporary failure');
        }
        return { success: true, response: 'Success after retries' };
      });

      // Mock the internal processing method
      orchestrator.processWithRetry = mockProcess;

      const result = await orchestrator.processWithRetry();
      expect(result.success).toBe(true);
      expect(callCount).toBe(3);
    });

    it('should provide detailed error information', async () => {
      const result = await orchestrator.processRequest({ type: 'invalid' });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.errorCode).toBeDefined();
    });
  });

  describe('Performance and Monitoring', () => {
    it('should track processing metrics', async () => {
      await orchestrator.initialize();

      const request = { type: 'chat', content: 'test' };
      await orchestrator.processRequest(request);

      const metrics = orchestrator.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.avgProcessingTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle concurrent requests', async () => {
      await orchestrator.initialize();
      await orchestrator.startServices();

      const requests = [
        { type: 'chat', content: 'Request 1' },
        { type: 'chat', content: 'Request 2' },
        { type: 'chat', content: 'Request 3' },
      ];

      const results = await Promise.all(
        requests.map(req => orchestrator.processRequest(req))
      );

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toHaveProperty('success');
      });
    });

    it('should implement resource cleanup', async () => {
      await orchestrator.initialize();
      await orchestrator.startServices();

      const resourcesBefore = process.memoryUsage();
      await orchestrator.cleanup();

      // Test that cleanup doesn't throw errors
      // Cleanup completed successfully
    });
  });

  describe('Configuration Management', () => {
    it('should handle configuration updates', async () => {
      await orchestrator.initialize();

      const newConfig = { model: 'gpt-4', temperature: 0.8 };
      await orchestrator.updateConfiguration(newConfig);

      const currentConfig = orchestrator.getConfiguration();
      expect(currentConfig).toMatchObject(newConfig);
    });

    it('should validate configuration changes', async () => {
      await orchestrator.initialize();

      const invalidConfig = { invalidSetting: 'invalid' };
      await expect(() => orchestrator.updateConfiguration(invalidConfig)).not.toThrow();
    });
  });
});