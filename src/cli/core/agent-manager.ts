import { nanoid } from 'nanoid';
import chalk from 'chalk';
import { EventEmitter } from 'events';

import {
  Agent,
  AgentTask,
  AgentTodo,
  AgentTaskResult,
  AgentMetrics,
  AgentContext,
  AgentConfig,
  AgentStatus,
  TaskStatus,
  AgentRegistryEntry,
  AgentMetadata,
  AgentEvent
} from '../types/types';

import { logger } from '../utils/logger';
import { GuidanceManager } from '../guidance/guidance-manager';
import { ConfigManager, CliConfig } from './config-manager';
import { SimpleConfigManager } from '../core/config-manager';

/**
 * Enterprise Agent Manager
 * Unifies agent lifecycle, task management, and coordination
 */
export class AgentManager extends EventEmitter {
  private agents = new Map<string, Agent>();
  private taskQueues = new Map<string, AgentTask[]>();
  private agentRegistry = new Map<string, AgentRegistryEntry>();
  private guidanceManager: GuidanceManager;
  private configManager: SimpleConfigManager;
  private config: CliConfig;
  private activeTaskCount = 0;
  private taskHistory = new Map<string, AgentTaskResult>();

  constructor(
    configManager: SimpleConfigManager,
    guidanceManager?: GuidanceManager
  ) {
    super();
    this.configManager = configManager;
    this.guidanceManager = guidanceManager || new GuidanceManager(process.cwd());
    this.config = this.configManager.getConfig() as any;

    this.setupEventHandlers();
  }

  /**
   * Initialize the agent manager
   */
  async initialize(): Promise<void> {
    await logger.info('Initializing AgentManager', {
      maxConcurrentAgents: this.config.maxConcurrentAgents,
      enableGuidanceSystem: this.config.enableGuidanceSystem
    });

    // Initialize guidance system if enabled
    if (this.config.enableGuidanceSystem) {
      await this.guidanceManager.initialize((context) => {
        this.onGuidanceUpdated(context);
      });
    }

    await logger.info('AgentManager initialized successfully');
  }

  /**
   * Register an agent in the system
   */
  async registerAgent(agent: Agent): Promise<void> {
    await logger.logAgent('info', agent.id, 'Registering agent', {
      name: agent.name,
      specialization: agent.specialization,
      capabilities: agent.capabilities
    });

    // Initialize agent with context
    const context = await this.buildAgentContext(agent);
    await agent.initialize(context);

    // Store agent
    this.agents.set(agent.id, agent);
    this.taskQueues.set(agent.id, []);

    // Emit registration event
    this.emit('agent.registered', {
      id: nanoid(),
      type: 'agent.initialized',
      agentId: agent.id,
      timestamp: new Date(),
      data: { agent: this.getAgentInfo(agent) }
    } as AgentEvent);

    await logger.logAgent('info', agent.id, 'Agent registered successfully');
  }

  /**
   * Register an agent class in the registry
   */
  registerAgentClass(
    agentClass: new (...args: any[]) => Agent,
    metadata: AgentMetadata
  ): void {
    this.agentRegistry.set(metadata.id, {
      agentClass,
      metadata,
      isEnabled: true
    });

    logger.info('Agent class registered', {
      agentId: metadata.id,
      name: metadata.name,
      specialization: metadata.specialization
    });
  }

  /**
   * Create and register an agent from registry
   */
  async createAgent(agentId: string, config?: Partial<AgentConfig>): Promise<Agent> {
    const registryEntry = this.agentRegistry.get(agentId);
    if (!registryEntry) {
      throw new Error(`Agent class not found in registry: ${agentId}`);
    }

    if (!registryEntry.isEnabled) {
      throw new Error(`Agent class is disabled: ${agentId}`);
    }

    // Create agent instance
    const agent = new registryEntry.agentClass(process.cwd());

    // Configure agent
    if (config) {
      agent.updateConfiguration(config);
    }

    // Register the agent
    await this.registerAgent(agent);

    return agent;
  }

  /**
   * Get an agent by ID
   */
  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all registered agents
   */
  listAgents(): Array<{
    id: string;
    name: string;
    status: string;
    specialization: string;
    description: string;
    capabilities: string[];
    currentTasks: number;
    metrics: AgentMetrics;
  }> {
    return Array.from(this.agents.values()).map(agent => ({
      id: agent.id,
      name: agent.name,
      status: agent.status,
      specialization: agent.specialization,
      description: agent.description,
      capabilities: agent.capabilities,
      currentTasks: agent.currentTasks,
      metrics: agent.getMetrics()
    }));
  }

  /**
   * Get available agent names for command-line usage
   */
  getAvailableAgentNames(): string[] {
    return Array.from(this.agents.values()).map(agent => agent.name);
  }

  /**
   * Get agents by capability
   */
  getAgentsByCapability(capability: string): Agent[] {
    return Array.from(this.agents.values())
      .filter(agent => agent.capabilities.includes(capability));
  }

  /**
   * Find the best agent for a task
   */
  findBestAgentForTask(task: AgentTask): Agent | null {
    let bestAgent: Agent | null = null;
    let bestScore = 0;

    for (const agent of this.agents.values()) {
      if (agent.status !== 'ready' && agent.status !== 'busy') {
        continue;
      }

      if (agent.currentTasks >= agent.maxConcurrentTasks) {
        continue;
      }

      if (!agent.canHandle(task)) {
        continue;
      }

      // Calculate score based on capabilities match
      let score = 0;

      // Check required capabilities
      if (task.requiredCapabilities) {
        const matchingCapabilities = task.requiredCapabilities.filter((cap: any) =>
          agent.capabilities.includes(cap)
        );
        score += matchingCapabilities.length * 10;
      }

      // Prefer less busy agents
      score += (agent.maxConcurrentTasks - agent.currentTasks) * 5;

      // Prefer agents with better metrics
      const metrics = agent.getMetrics();
      score += metrics.successRate * 2;

      if (score > bestScore) {
        bestScore = score;
        bestAgent = agent;
      }
    }

    return bestAgent;
  }

  /**
   * Schedule a task for execution
   */
  async scheduleTask(task: AgentTask, preferredAgentId?: string): Promise<string> {
    await logger.logTask('info', task.id, preferredAgentId || 'auto', 'Scheduling task', {
      title: task.title,
      priority: task.priority,
      requiredCapabilities: task.requiredCapabilities
    });

    let agent: Agent | null = null;

    // Use preferred agent if specified
    if (preferredAgentId) {
      agent = this.getAgent(preferredAgentId) || null;
      if (!agent || !agent.canHandle(task)) {
        throw new Error(`Preferred agent ${preferredAgentId} cannot handle this task`);
      }
    } else {
      // Find best agent automatically
      agent = this.findBestAgentForTask(task);
      if (!agent) {
        throw new Error('No suitable agent available for this task');
      }
    }

    // Add to agent's task queue
    const queue = this.taskQueues.get(agent.id) || [];
    queue.push(task);
    this.taskQueues.set(agent.id, queue);

    await logger.logTask('info', task.id, agent.id, 'Task scheduled', {
      queueLength: queue.length
    });

    // Start execution if agent is available
    if (agent.currentTasks < agent.maxConcurrentTasks) {
      setImmediate(() => this.processAgentQueue(agent.id));
    }

    return agent.id;
  }

  /**
   * Execute a task on a specific agent
   */
  async executeTask(agentId: string, task: AgentTask): Promise<AgentTaskResult> {
    const agent = this.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    if (!agent.canHandle(task)) {
      throw new Error(`Agent ${agentId} cannot handle this task`);
    }

    await logger.logTask('info', task.id, agentId, 'Starting task execution');

    try {
      this.activeTaskCount++;
      task.status = 'in_progress';
      task.startedAt = new Date();

      const result = await agent.executeTask(task);

      // Store result
      this.taskHistory.set(task.id, result);

      await logger.logTask('info', task.id, agentId, 'Task completed successfully', {
        duration: result.duration,
        status: result.status
      });

      return result;

    } catch (error: any) {
      const result: AgentTaskResult = {
        taskId: task.id,
        agentId,
        status: 'failed',
        startTime: task.startedAt!,
        endTime: new Date(),
        error: error.message,
        errorDetails: error
      };

      this.taskHistory.set(task.id, result);

      await logger.logTask('error', task.id, agentId, 'Task failed', {
        error: error.message
      });

      throw error;

    } finally {
      this.activeTaskCount--;
    }
  }

  /**
   * Schedule a todo item (legacy compatibility)
   */
  scheduleTodo(agentId: string, todo: AgentTodo): void {
    const task: AgentTask = {
      id: todo.id,
      type: 'internal',
      title: todo.title,
      description: todo.description,
      priority: todo.priority,
      status: todo.status,
      data: { todo },
      createdAt: todo.createdAt,
      updatedAt: todo.updatedAt,
      estimatedDuration: todo.estimatedDuration,
      progress: todo.progress
    };

    this.scheduleTask(task, agentId);
  }

  /**
   * Run all scheduled tasks sequentially
   */
  async runSequential(): Promise<void> {
    await logger.info('Starting sequential task execution');

    for (const [agentId, tasks] of this.taskQueues.entries()) {
      if (tasks.length === 0) continue;

      const agent = this.getAgent(agentId);
      if (!agent) continue;

      await logger.logAgent('info', agentId, `Executing ${tasks.length} tasks sequentially`);

      for (const task of tasks) {
        try {
          await this.executeTask(agentId, task);
        } catch (error: any) {
          await logger.logTask('error', task.id, agentId, 'Sequential execution failed', { error: error.message });
        }
      }

      // Clear completed tasks
      this.taskQueues.set(agentId, []);
    }

    await logger.info('Sequential task execution completed');
  }

  /**
   * Run tasks in parallel with concurrency limit
   */
  async runParallel(concurrency?: number): Promise<void> {
    const maxConcurrency = concurrency || this.config.maxConcurrentAgents;

    await logger.info('Starting parallel task execution', {
      maxConcurrency,
      totalTasks: this.getTotalPendingTasks()
    });

    const promises: Promise<void>[] = [];

    for (const agentId of this.taskQueues.keys()) {
      if (promises.length >= (maxConcurrency || 5)) {
        await Promise.race(promises);
      }

      promises.push(this.processAgentQueue(agentId));
    }

    await Promise.all(promises);

    await logger.info('Parallel task execution completed');
  }

  /**
   * Process task queue for a specific agent
   */
  private async processAgentQueue(agentId: string): Promise<void> {
    const agent = this.getAgent(agentId);
    const queue = this.taskQueues.get(agentId);

    if (!agent || !queue || queue.length === 0) {
      return;
    }

    while (queue.length > 0 && agent.currentTasks < agent.maxConcurrentTasks) {
      const task = queue.shift()!;

      try {
        await this.executeTask(agentId, task);
      } catch (error: any) {
        await logger.logTask('error', task.id, agentId, 'Queue processing failed', { error: error.message });
      }
    }
  }

  /**
   * Build agent context with guidance and configuration
   */
  private async buildAgentContext(agent: Agent): Promise<AgentContext> {
    const guidance = this.config.enableGuidanceSystem ?
      this.guidanceManager.getContextForAgent(agent.specialization, process.cwd()) : '';

    return {
      workingDirectory: process.cwd(),
      projectPath: process.cwd(),
      guidance,
      configuration: {
        autonomyLevel: 'semi-autonomous',
        maxConcurrentTasks: agent.maxConcurrentTasks,
        defaultTimeout: this.config.defaultAgentTimeout || 300000,
        retryPolicy: {
          maxAttempts: 3,
          backoffMs: 1000,
          backoffMultiplier: 2,
          retryableErrors: ['NetworkError', 'TimeoutError']
        },
        enabledTools: [],
        guidanceFiles: [],
        logLevel: (this.config.logLevel as any) || 'info',
        permissions: {
          canReadFiles: true,
          canWriteFiles: this.config.sandbox.allowFileSystem,
          canDeleteFiles: this.config.sandbox.allowFileSystem,
          allowedPaths: [process.cwd()],
          forbiddenPaths: ['/etc', '/usr', '/var'],
          canExecuteCommands: this.config.sandbox.allowCommands,
          allowedCommands: ['npm', 'git', 'ls', 'cat'],
          forbiddenCommands: ['rm -rf', 'sudo', 'su'],
          canAccessNetwork: this.config.sandbox.allowNetwork,
          allowedDomains: [],
          canInstallPackages: this.config.sandbox.allowFileSystem,
          canModifyConfig: false,
          canAccessSecrets: false
        },
        sandboxRestrictions: this.getSandboxRestrictions()
      },
      executionPolicy: {
        approval: 'moderate' as any,
        sandbox: 'workspace-write' as any,
        timeoutMs: this.config.defaultAgentTimeout || 300000,
        maxRetries: 3
      },
      approvalRequired: this.config.approvalPolicy === 'strict'
    };
  }

  /**
   * Get sandbox restrictions based on configuration
   */
  private getSandboxRestrictions(): string[] {
    const restrictions: string[] = [];

    if (!this.config.sandbox.enabled) {
      return restrictions; // No restrictions if sandbox disabled
    }

    if (!this.config.sandbox.allowFileSystem) {
      restrictions.push('no-file-write', 'no-file-delete');
    }

    if (!this.config.sandbox.allowNetwork) {
      restrictions.push('no-network-access');
    }

    if (!this.config.sandbox.allowCommands) {
      restrictions.push('no-command-execution');
    }

    return restrictions;
  }

  /**
   * Event handlers setup
   */
  private setupEventHandlers(): void {
    this.on('agent.registered', (event: AgentEvent) => {
      logger.info('Agent registered event', event);
    });

    this.on('task.completed', (event: AgentEvent) => {
      logger.info('Task completed event', event);
    });

    this.on('task.failed', (event: AgentEvent) => {
      logger.warn('Task failed event', event);
    });
  }

  /**
   * Handle guidance system updates
   */
  private onGuidanceUpdated(context: any): void {
    logger.info('Guidance context updated, notifying agents');

    // Update all agents with new guidance
    for (const agent of this.agents.values()) {
      const guidance = this.guidanceManager.getContextForAgent(
        agent.specialization,
        process.cwd()
      );
      agent.updateGuidance(guidance);
    }
  }

  /**
   * Get agent info for events and logging
   */
  private getAgentInfo(agent: Agent): any {
    return {
      id: agent.id,
      name: agent.name,
      specialization: agent.specialization,
      capabilities: agent.capabilities,
      status: agent.status
    };
  }

  /**
   * Get total pending tasks across all agents
   */
  private getTotalPendingTasks(): number {
    return Array.from(this.taskQueues.values())
      .reduce((total, queue) => total + queue.length, 0);
  }

  /**
   * Get system statistics
   */
  getStats(): {
    totalAgents: number;
    activeAgents: number;
    totalTasks: number;
    pendingTasks: number;
    completedTasks: number;
    failedTasks: number;
    averageTaskDuration: number;
  } {
    const agents = Array.from(this.agents.values());
    const results = Array.from(this.taskHistory.values());

    const completedResults = results.filter(r => r.status === 'completed');
    const failedResults = results.filter(r => r.status === 'failed');

    const totalDuration = completedResults
      .filter(r => r.duration !== undefined)
      .reduce((sum, r) => sum + (r.duration || 0), 0);

    return {
      totalAgents: agents.length,
      activeAgents: agents.filter(a => a.status === 'ready' || a.status === 'busy').length,
      totalTasks: results.length,
      pendingTasks: this.getTotalPendingTasks(),
      completedTasks: completedResults.length,
      failedTasks: failedResults.length,
      averageTaskDuration: completedResults.length > 0 ?
        totalDuration / completedResults.length : 0
    };
  }

  /**
   * Cleanup and shutdown
   */
  async cleanup(): Promise<void> {
    await logger.info('Shutting down AgentManager');

    // Cleanup all agents
    for (const agent of this.agents.values()) {
      try {
        await agent.cleanup();
      } catch (error: any) {
        await logger.error(`Error cleaning up agent ${agent.id}`, { error: error.message });
      }
    }

    // Cleanup guidance system
    if (this.config.enableGuidanceSystem) {
      await this.guidanceManager.cleanup();
    }

    // Clear all data
    this.agents.clear();
    this.taskQueues.clear();
    this.taskHistory.clear();

    await logger.info('AgentManager shutdown complete');
  }

  /**
   * Execute multiple tasks in parallel (compatibility method)
   */
  async executeTasksParallel(tasks: AgentTask[]): Promise<AgentTaskResult[]> {
    const promises = tasks.map(async (task) => {
      try {
        // Auto-assign to the universal agent
        return await this.executeTask('universal-agent', task);
      } catch (error: any) {
        return {
          taskId: task.id,
          agentId: 'universal-agent',
          status: 'failed' as TaskStatus,
          startTime: task.createdAt,
          endTime: new Date(),
          error: error.message
        };
      }
    });

    return Promise.all(promises);
  }

  /**
   * List registered agents (compatibility method)
   */
  listRegisteredAgents(): { id: string; specialization: string }[] {
    return Array.from(this.agentRegistry.entries()).map(([id, entry]) => ({
      id,
      specialization: entry.metadata.specialization
    }));
  }
}