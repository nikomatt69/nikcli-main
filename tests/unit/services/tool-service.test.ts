/**
 * Unit tests for Tool Service - Core tool execution and management service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ToolService } from '../../../src/cli/services/tool-service';
import { mockConsole, createTempFile } from '../../helpers/test-utils';

vi.mock('../../../src/cli/tools/secure-tools-registry', () => ({
  SecureToolsRegistry: vi.fn(() => ({
    readFile: vi.fn(() => ({ success: true, data: { content: 'mock content' } })),
    writeFile: vi.fn(() => ({ success: true })),
    executeCommand: vi.fn(() => ({ success: true, data: { stdout: 'mock output' } })),
    listDirectory: vi.fn(() => ({ success: true, data: { files: ['file1.txt'] } })),
    findFiles: vi.fn(() => ({ success: true, data: ['found-file.txt'] })),
    getAvailableTools: vi.fn(() => ['read-file', 'write-file', 'run-command']),
  })),
}));

vi.mock('../../../src/cli/core/config-manager', () => ({
  ConfigManager: vi.fn(() => ({
    getConfig: vi.fn(() => ({ toolsConfig: { safeMode: true } })),
  })),
}));

describe('ToolService', () => {
  let toolService: ToolService;
  let console: ReturnType<typeof mockConsole>;

  beforeEach(() => {
    console = mockConsole();
    toolService = new ToolService();
  });

  afterEach(() => {
    console.restore();
  });

  describe('Service Initialization', () => {
    it('should initialize successfully', async () => {
      await toolService.initialize();
      expect(toolService.isInitialized()).toBe(true);
    });

    it('should setup tool registry during initialization', async () => {
      await toolService.initialize();
      const registry = toolService.getToolRegistry();
      expect(registry).toBeDefined();
    });

    it('should load available tools', async () => {
      await toolService.initialize();
      const tools = toolService.getAvailableTools();
      expect(tools.length).toBeGreaterThan(0);
    });

    it('should handle initialization failures', async () => {
      const mockInit = vi.spyOn(toolService, 'initialize').mockRejectedValue(new Error('Init failed'));

      await expect(toolService.initialize()).rejects.toThrow('Init failed');
      mockInit.mockRestore();
    });
  });

  describe('Tool Discovery and Registration', () => {
    beforeEach(async () => {
      await toolService.initialize();
    });

    it('should list available tools', () => {
      const tools = toolService.getAvailableTools();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools).toContain('read-file');
      expect(tools).toContain('write-file');
    });

    it('should get tool information', () => {
      const toolInfo = toolService.getToolInfo('read-file');
      expect(toolInfo).toHaveProperty('name');
      expect(toolInfo).toHaveProperty('description');
      expect(toolInfo).toHaveProperty('parameters');
    });

    it('should validate tool existence', () => {
      expect(toolService.isToolAvailable('read-file')).toBe(true);
      expect(toolService.isToolAvailable('non-existent-tool')).toBe(false);
    });

    it('should categorize tools by type', () => {
      const categories = toolService.getToolCategories();
      expect(categories).toHaveProperty('file');
      expect(categories).toHaveProperty('command');
      expect(categories.file).toContain('read-file');
    });
  });

  // Tests removed - completely mocked, not veritieri

  // Tests removed - completely mocked, not veritieri

  describe('Tool Parameter Validation', () => {
    beforeEach(async () => {
      await toolService.initialize();
    });

    it('should validate required parameters', async () => {
      const result = await toolService.executeTool('read-file', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should validate parameter types', async () => {
      const result = await toolService.executeTool('read-file', {
        path: 123 // Should be string
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('type');
    });

    it('should provide parameter suggestions', async () => {
      const suggestions = toolService.getParameterSuggestions('read-file');

      expect(suggestions).toHaveProperty('path');
      expect(suggestions.path).toContain('example');
    });

    it('should handle optional parameters', async () => {
      const result = await toolService.executeTool('list-directory', {
        path: '/test',
        recursive: true,
        pattern: '*.js'
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Tool Execution Policies', () => {
    beforeEach(async () => {
      await toolService.initialize();
    });

    it('should enforce security policies', async () => {
      toolService.setSecurityPolicy({
        allowDangerousCommands: false,
        restrictedPaths: ['/system', '/etc'],
        maxFileSize: 1024 * 1024 // 1MB
      });

      const result = await toolService.executeTool('read-file', {
        path: '/etc/passwd'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('restricted');
    });

    it('should handle permission requirements', async () => {
      const result = await toolService.executeTool('write-file', {
        path: '/protected/file.txt',
        content: 'test',
        requiresPermission: true
      });

      // Should require user confirmation or proper permissions
      expect(result).toHaveProperty('requiresConfirmation');
    });

    it('should apply rate limiting', async () => {
      toolService.setRateLimit('run-command', { maxCalls: 2, window: 1000 });

      // Execute commands rapidly
      const results = await Promise.all([
        toolService.executeTool('run-command', { command: 'echo 1' }),
        toolService.executeTool('run-command', { command: 'echo 2' }),
        toolService.executeTool('run-command', { command: 'echo 3' }),
      ]);

      // Third command should be rate limited
      expect(results[2].success).toBe(false);
      expect(results[2].error).toContain('rate limit');
    });
  });

  describe('Tool Execution Monitoring', () => {
    beforeEach(async () => {
      await toolService.initialize();
    });

    it('should track execution metrics', async () => {
      await toolService.executeTool('read-file', { path: 'test.txt' });

      const metrics = toolService.getExecutionMetrics();
      expect(metrics.totalExecutions).toBe(1);
      expect(metrics.toolUsage['read-file']).toBe(1);
    });

    it('should measure execution time', async () => {
      const result = await toolService.executeTool('read-file', { path: 'test.txt' });

      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should track success/failure rates', async () => {
      await toolService.executeTool('read-file', { path: 'exists.txt' });
      await toolService.executeTool('read-file', { path: 'missing.txt' });

      const stats = toolService.getToolStatistics('read-file');
      expect(stats.totalCalls).toBe(2);
      expect(stats.successRate).toBeDefined();
    });

    it('should generate execution reports', () => {
      const report = toolService.generateExecutionReport();

      expect(report).toHaveProperty('totalTools');
      expect(report).toHaveProperty('mostUsedTools');
      expect(report).toHaveProperty('errorRates');
      expect(report).toHaveProperty('performanceMetrics');
    });
  });

  describe('Tool Chaining and Workflows', () => {
    beforeEach(async () => {
      await toolService.initialize();
    });

    it('should execute tool chains', async () => {
      const workflow = [
        { tool: 'read-file', params: { path: 'input.txt' } },
        { tool: 'write-file', params: { path: 'output.txt', content: '${prev.content}' } }
      ];

      const result = await toolService.executeWorkflow(workflow);

      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(2);
    });

    it('should handle workflow failures', async () => {
      const workflow = [
        { tool: 'read-file', params: { path: 'missing.txt' } },
        { tool: 'write-file', params: { path: 'output.txt', content: '${prev.content}' } }
      ];

      const result = await toolService.executeWorkflow(workflow, {
        stopOnFailure: true
      });

      expect(result.success).toBe(false);
      expect(result.failedStep).toBe(0);
    });

    it('should support conditional execution', async () => {
      const workflow = [
        {
          tool: 'read-file',
          params: { path: 'config.json' },
          condition: 'exists'
        },
        {
          tool: 'write-file',
          params: { path: 'default-config.json', content: '{}' },
          condition: '!prev.success'
        }
      ];

      const result = await toolService.executeWorkflow(workflow);

      expect(result.success).toBe(true);
    });

    it('should provide workflow templates', () => {
      const templates = toolService.getWorkflowTemplates();

      expect(templates).toHaveProperty('file-processing');
      expect(templates).toHaveProperty('project-setup');
      expect(templates['file-processing']).toHaveLength(3);
    });
  });

  describe('Tool Configuration and Customization', () => {
    beforeEach(async () => {
      await toolService.initialize();
    });

    it('should configure tool defaults', async () => {
      toolService.setToolDefaults('read-file', {
        encoding: 'utf-8',
        maxSize: 1024 * 1024
      });

      const defaults = toolService.getToolDefaults('read-file');
      expect(defaults.encoding).toBe('utf-8');
      expect(defaults.maxSize).toBe(1024 * 1024);
    });

    it('should support tool aliases', () => {
      toolService.createAlias('rf', 'read-file');

      expect(toolService.isToolAvailable('rf')).toBe(true);
      expect(toolService.resolveAlias('rf')).toBe('read-file');
    });

    it('should allow custom tool registration', () => {
      const customTool = {
        name: 'custom-tool',
        execute: vi.fn(() => ({ success: true, data: 'custom result' })),
        parameters: { input: { type: 'string', required: true } }
      };

      toolService.registerCustomTool(customTool);

      expect(toolService.isToolAvailable('custom-tool')).toBe(true);
    });

    it('should support tool plugins', async () => {
      const plugin = {
        name: 'test-plugin',
        tools: [
          { name: 'plugin-tool', execute: vi.fn(() => ({ success: true })) }
        ],
        initialize: vi.fn()
      };

      await toolService.loadPlugin(plugin);

      expect(toolService.isToolAvailable('plugin-tool')).toBe(true);
    });
  });

  describe('Error Handling and Recovery', () => {
    beforeEach(async () => {
      await toolService.initialize();
    });

    it('should handle tool execution errors', async () => {
      const mockRegistry = toolService.getToolRegistry();
      if (mockRegistry) {
        vi.spyOn(mockRegistry, 'readFile').mockRejectedValue(new Error('IO Error'));
      }

      const result = await toolService.executeTool('read-file', { path: 'test.txt' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('IO Error');
      expect(result.errorCode).toBeDefined();
    });

    it('should implement retry logic', async () => {
      let callCount = 0;
      const mockRegistry = toolService.getToolRegistry();
      if (mockRegistry) {
        vi.spyOn(mockRegistry, 'readFile').mockImplementation(() => {
          callCount++;
          if (callCount < 3) {
            throw new Error('Transient error');
          }
          return { success: true, data: { content: 'success after retries' } };
        });
      }

      const result = await toolService.executeTool('read-file', {
        path: 'test.txt',
        retryPolicy: { maxRetries: 3, delay: 10 }
      });

      expect(result.success).toBe(true);
      expect(callCount).toBe(3);
    });

    it('should provide fallback mechanisms', async () => {
      const result = await toolService.executeTool('read-file', {
        path: 'primary.txt',
        fallbacks: ['backup.txt', 'default.txt']
      });

      expect(result.success).toBe(true);
    });

    it('should handle tool registry failures', async () => {
      const originalRegistry = toolService.getToolRegistry();

      // Simulate registry failure
      (toolService as any).toolRegistry = null;

      const result = await toolService.executeTool('read-file', { path: 'test.txt' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('registry');

      // Restore registry
      (toolService as any).toolRegistry = originalRegistry;
    });
  });

  describe('Performance Optimization', () => {
    beforeEach(async () => {
      await toolService.initialize();
    });

    it('should cache tool execution results', async () => {
      toolService.enableCaching({ ttl: 60000, maxSize: 100 });

      // Execute same tool twice
      const result1 = await toolService.executeTool('read-file', { path: 'cache-test.txt' });
      const result2 = await toolService.executeTool('read-file', { path: 'cache-test.txt' });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result2.cached).toBe(true);
    });

    it('should execute tools concurrently when possible', async () => {
      const startTime = Date.now();

      const results = await Promise.all([
        toolService.executeTool('read-file', { path: 'file1.txt' }),
        toolService.executeTool('read-file', { path: 'file2.txt' }),
        toolService.executeTool('read-file', { path: 'file3.txt' }),
      ]);

      const endTime = Date.now();

      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
      expect(endTime - startTime).toBeLessThan(1000); // Should be fast due to concurrency
    });

    it('should optimize tool loading', () => {
      const loadTime = toolService.getLoadTime();
      expect(loadTime).toBeLessThan(5000); // Should load quickly
    });

    it('should manage resource usage', () => {
      const usage = toolService.getResourceUsage();

      expect(usage).toHaveProperty('memoryUsage');
      expect(usage).toHaveProperty('activeTools');
      expect(usage).toHaveProperty('queueSize');
    });
  });
});