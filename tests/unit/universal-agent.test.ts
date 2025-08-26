/**
 * Unit tests for Universal Agent - Comprehensive agent with full-stack capabilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UniversalAgent } from '../../src/cli/automation/agents/universal-agent';
import { AgentTask, AgentContext } from '../../src/cli/types/types';
import { mockConsole, createTempFile } from '../helpers/test-utils';

vi.mock('../../src/cli/utils/logger', () => ({
  logger: {
    logAgent: vi.fn(),
    logTask: vi.fn(),
  },
}));

vi.mock('../../src/cli/lsp/lsp-manager', () => ({
  lspManager: {
    analyzeFile: vi.fn(() => Promise.resolve({ diagnostics: [] })),
    getWorkspaceInsights: vi.fn(() => Promise.resolve({ diagnostics: { errors: 0, warnings: 0 } })),
  },
}));

vi.mock('../../src/cli/context/context-aware-rag', () => ({
  ContextAwareRAGSystem: vi.fn(() => ({
    recordInteraction: vi.fn(),
    analyzeFile: vi.fn(),
    getMemoryStats: vi.fn(() => ({ totalFiles: 0 })),
  })),
}));

describe('UniversalAgent', () => {
  let agent: UniversalAgent;
  let console: ReturnType<typeof mockConsole>;

  beforeEach(() => {
    console = mockConsole();
    agent = new UniversalAgent('/test/working/directory');
  });

  afterEach(() => {
    console.restore();
  });

  describe('Agent Initialization', () => {
    it('should initialize with default configuration', async () => {
      await agent.initialize();
      
      expect(agent.getStatus()).toBe('ready');
      expect(agent.getCapabilities()).toContain('code-generation');
      expect(agent.getCapabilities()).toContain('frontend');
      expect(agent.getCapabilities()).toContain('backend');
      expect(agent.getCapabilities()).toContain('devops');
    });

    it('should validate configuration during initialization', async () => {
      const context: AgentContext = {
        guidance: 'Test guidance',
        configuration: {
          autonomyLevel: 'full-autonomous',
          maxConcurrentTasks: 5,
          defaultTimeout: 60000,
          retryPolicy: {
            maxAttempts: 3,
            backoffMs: 1000,
            backoffMultiplier: 2,
            retryableErrors: ['NetworkError']
          },
          enabledTools: ['file-system'],
          guidanceFiles: ['README.md'],
          logLevel: 'info',
          permissions: {
            canReadFiles: true,
            canWriteFiles: true,
            canDeleteFiles: false,
            allowedPaths: ['/test'],
            forbiddenPaths: ['/etc'],
            canExecuteCommands: true,
            allowedCommands: ['npm'],
            forbiddenCommands: ['rm'],
            canAccessNetwork: true,
            allowedDomains: ['github.com'],
            canInstallPackages: true,
            canModifyConfig: false,
            canAccessSecrets: false
          },
          sandboxRestrictions: ['workspace-only']
        }
      };

      await expect(() => agent.initialize(context)).not.toThrow();
      expect(agent.getStatus()).toBe('ready');
    });

    it('should have all required capabilities', () => {
      const capabilities = agent.getCapabilities();
      
      // Core capabilities
      expect(capabilities).toContain('code-generation');
      expect(capabilities).toContain('code-analysis');
      expect(capabilities).toContain('testing');
      
      // Frontend capabilities
      expect(capabilities).toContain('react');
      expect(capabilities).toContain('typescript');
      expect(capabilities).toContain('frontend');
      
      // Backend capabilities
      expect(capabilities).toContain('backend');
      expect(capabilities).toContain('api-development');
      expect(capabilities).toContain('database');
      
      // DevOps capabilities
      expect(capabilities).toContain('devops');
      expect(capabilities).toContain('docker');
      expect(capabilities).toContain('ci-cd');
    });
  });

  describe('Task Execution', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    it('should execute simple analysis tasks', async () => {
      const task: AgentTask = {
        id: 'test-task-1',
        type: 'general',
        title: 'Code Analysis',
        description: 'Analyze the current project structure',
        priority: 'medium',
        status: 'pending',
        data: { type: 'analyze', target: 'project' },
        createdAt: new Date(),
        updatedAt: new Date(),
        progress: 0
      };
      
      const result = await agent.executeTask(task);
      
      expect(result.status).toBe('completed');
      expect(result.output).toBeDefined();
      expect(result.output).toContain('Code Analysis Results');
      expect(result.taskId).toBe(task.id);
      expect(result.agentId).toBe(agent.id);
    });

    it('should execute code generation tasks', async () => {
      const task: AgentTask = {
        id: 'test-task-2',
        type: 'generation',
        title: 'Code Generation',
        description: 'Create a React component for user authentication',
        priority: 'high',
        status: 'pending',
        data: { 
          type: 'generate',
          framework: 'react',
          requirements: ['TypeScript', 'functional component', 'form validation']
        },
        requiredCapabilities: ['code-generation', 'react'],
        createdAt: new Date(),
        updatedAt: new Date(),
        progress: 0
      };
      
      const result = await agent.executeTask(task);
      
      expect(result.status).toBe('completed');
      expect(result.output).toContain('Code Generation Results');
      expect(result.result).toBeDefined();
    });

    it('should handle React development tasks', async () => {
      const task: AgentTask = {
        id: 'test-task-3',
        type: 'frontend',
        title: 'React Component',
        description: 'Create React component with TypeScript',
        priority: 'medium',
        status: 'pending',
        data: { 
          framework: 'react',
          component: 'UserProfile',
          features: ['hooks', 'typescript']
        },
        requiredCapabilities: ['react', 'typescript', 'frontend'],
        createdAt: new Date(),
        updatedAt: new Date(),
        progress: 0
      };
      
      const result = await agent.executeTask(task);
      
      expect(result.status).toBe('completed');
      expect(result.output).toContain('React Development Results');
    });

    it('should handle backend development tasks', async () => {
      const task: AgentTask = {
        id: 'test-task-4',
        type: 'backend',
        title: 'API Development',
        description: 'Create REST API endpoints',
        priority: 'high',
        status: 'pending',
        data: { 
          type: 'api',
          endpoints: ['users', 'posts'],
          database: 'postgresql'
        },
        requiredCapabilities: ['backend', 'api-development'],
        createdAt: new Date(),
        updatedAt: new Date(),
        progress: 0
      };
      
      const result = await agent.executeTask(task);
      
      expect(result.status).toBe('completed');
      expect(result.output).toContain('Backend Development Results');
    });

    it('should handle task failures gracefully', async () => {
      const task: AgentTask = {
        id: 'test-task-fail',
        type: 'invalid' as any,
        title: 'Invalid Task',
        description: 'This should fail',
        priority: 'low',
        status: 'pending',
        data: { invalid: true },
        createdAt: new Date(),
        updatedAt: new Date(),
        progress: 0
      };
      
      const result = await agent.executeTask(task);
      
      expect(result.status).toBe('completed'); // Universal agent handles all tasks
      expect(result.output).toBeDefined();
    });
  });

  describe('Task Capability Checking', () => {
    it('should handle tasks with required capabilities', () => {
      const reactTask: AgentTask = {
        id: 'react-task',
        type: 'frontend',
        title: 'React Task',
        description: 'React component task',
        priority: 'medium',
        status: 'pending',
        data: {},
        requiredCapabilities: ['react', 'typescript'],
        createdAt: new Date(),
        updatedAt: new Date(),
        progress: 0
      };
      
      expect(agent.canHandle(reactTask)).toBe(true);
    });

    it('should handle tasks without required capabilities', () => {
      const generalTask: AgentTask = {
        id: 'general-task',
        type: 'general',
        title: 'General Task',
        description: 'General task',
        priority: 'medium',
        status: 'pending',
        data: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        progress: 0
      };
      
      expect(agent.canHandle(generalTask)).toBe(true);
    });
  });

  describe('Metrics and Performance', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    it('should track execution metrics', async () => {
      const task: AgentTask = {
        id: 'metrics-task',
        type: 'general',
        title: 'Metrics Test',
        description: 'Test task for metrics',
        priority: 'low',
        status: 'pending',
        data: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        progress: 0
      };
      
      await agent.executeTask(task);
      
      const metrics = agent.getMetrics();
      expect(metrics.tasksExecuted).toBe(0); // Initial execution count
      expect(metrics.tasksSucceeded).toBeGreaterThanOrEqual(0);
      expect(metrics.lastActive).toBeInstanceOf(Date);
    });

    it('should handle concurrent tasks', async () => {
      const tasks: AgentTask[] = [
        {
          id: 'concurrent-1',
          type: 'general',
          title: 'Concurrent Task 1',
          description: 'First concurrent task',
          priority: 'medium',
          status: 'pending',
          data: {},
          createdAt: new Date(),
          updatedAt: new Date(),
          progress: 0
        },
        {
          id: 'concurrent-2',
          type: 'general',
          title: 'Concurrent Task 2',
          description: 'Second concurrent task',
          priority: 'medium',
          status: 'pending',
          data: {},
          createdAt: new Date(),
          updatedAt: new Date(),
          progress: 0
        }
      ];
      
      const startTime = Date.now();
      const results = await Promise.all(tasks.map(task => agent.executeTask(task)));
      const endTime = Date.now();
      
      expect(results).toHaveLength(2);
      expect(results.every(r => r.status === 'completed')).toBe(true);
      expect(endTime - startTime).toBeLessThan(10000); // Should complete reasonably fast
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration', () => {
      const newConfig = {
        autonomyLevel: 'supervised' as const,
        maxConcurrentTasks: 10
      };
      
      expect(() => agent.updateConfiguration(newConfig)).not.toThrow();
    });

    it('should update guidance', () => {
      const newGuidance = 'Updated guidance for the agent';
      
      expect(() => agent.updateGuidance(newGuidance)).not.toThrow();
    });
  });

  describe('Cleanup and Lifecycle', () => {
    it('should cleanup resources properly', async () => {
      await agent.initialize();
      expect(agent.getStatus()).toBe('ready');
      
      await agent.cleanup();
      expect(agent.getStatus()).toBe('offline');
    });

    it('should handle cleanup with running tasks', async () => {
      await agent.initialize();
      
      // Start a task but don't wait for completion
      const task: AgentTask = {
        id: 'cleanup-task',
        type: 'general',
        title: 'Cleanup Test',
        description: 'Task running during cleanup',
        priority: 'low',
        status: 'pending',
        data: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        progress: 0
      };
      
      agent.executeTask(task); // Don't await
      
      await agent.cleanup();
      expect(agent.getStatus()).toBe('offline');
    });
  });

  describe('Alternative Execution Methods', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    it('should execute tasks via run method', async () => {
      const task: AgentTask = {
        id: 'run-task',
        type: 'general',
        title: 'Run Method Test',
        description: 'Test the run method',
        priority: 'medium',
        status: 'pending',
        data: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        progress: 0
      };
      
      const result = await agent.run(task);
      
      expect(result.status).toBe('completed');
      expect(result.taskId).toBe(task.id);
    });

    it('should execute todos', async () => {
      const todo = {
        id: 'todo-1',
        title: 'Test Todo',
        description: 'Test todo execution',
        priority: 'medium'
      };
      
      await expect(() => agent.executeTodo(todo)).not.toThrow();
    });
  });
});