/**
 * NikCLI Enterprise SDK - Agents Module
 * Programmatic access to all AI agents
 */

import type {
  SDKResponse,
  AgentDefinition,
  AgentTask,
  AgentResult,
  AgentBlueprint,
  ParallelAgentConfig,
  ExecutionPlan,
} from './types';

export class AgentsSDK {
  private agentManager: any;
  private config: any;

  constructor(agentManager: any, config: any) {
    this.agentManager = agentManager;
    this.config = config;
  }

  // ============================================================================
  // Core Agent Operations
  // ============================================================================

  /**
   * List all available agents
   */
  async listAgents(): Promise<SDKResponse<AgentDefinition[]>> {
    try {
      const agents = await this.agentManager.listAgents();
      return { success: true, data: agents };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get agent by ID or name
   */
  async getAgent(idOrName: string): Promise<SDKResponse<AgentDefinition>> {
    try {
      const agent = await this.agentManager.getAgent(idOrName);
      return { success: true, data: agent };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Create a new agent
   */
  async createAgent(blueprint: AgentBlueprint): Promise<SDKResponse<AgentDefinition>> {
    try {
      const agent = await this.agentManager.createAgent(blueprint);
      return { success: true, data: agent };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Delete an agent
   */
  async deleteAgent(idOrName: string): Promise<SDKResponse<void>> {
    try {
      await this.agentManager.deleteAgent(idOrName);
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Update agent configuration
   */
  async updateAgent(
    idOrName: string,
    updates: Partial<AgentDefinition>
  ): Promise<SDKResponse<AgentDefinition>> {
    try {
      const agent = await this.agentManager.updateAgent(idOrName, updates);
      return { success: true, data: agent };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Agent Execution
  // ============================================================================

  /**
   * Execute a task with an agent
   */
  async executeTask(
    agentIdOrName: string,
    task: AgentTask
  ): Promise<SDKResponse<AgentResult>> {
    try {
      const result = await this.agentManager.executeTask(agentIdOrName, task);
      return { success: true, data: result };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Execute a simple task with an agent (convenience method)
   */
  async run(agentName: string, taskDescription: string): Promise<SDKResponse<AgentResult>> {
    try {
      const task: AgentTask = {
        id: this.generateTaskId(),
        description: taskDescription,
      };
      const result = await this.agentManager.executeTask(agentName, task);
      return { success: true, data: result };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Execute task in background
   */
  async executeTaskAsync(
    agentIdOrName: string,
    task: AgentTask
  ): Promise<SDKResponse<string>> {
    try {
      const taskId = await this.agentManager.executeTaskAsync(agentIdOrName, task);
      return { success: true, data: taskId };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get task result
   */
  async getTaskResult(taskId: string): Promise<SDKResponse<AgentResult>> {
    try {
      const result = await this.agentManager.getTaskResult(taskId);
      return { success: true, data: result };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Cancel running task
   */
  async cancelTask(taskId: string): Promise<SDKResponse<void>> {
    try {
      await this.agentManager.cancelTask(taskId);
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Parallel Agent Execution
  // ============================================================================

  /**
   * Run multiple agents in parallel
   */
  async runParallel(config: ParallelAgentConfig): Promise<SDKResponse<AgentResult[]>> {
    try {
      const results = await this.agentManager.runParallel(config);
      return { success: true, data: results };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Run agents with different strategies
   */
  async runWithStrategy(
    agents: string[],
    task: string,
    strategy: 'first' | 'all' | 'best' | 'race'
  ): Promise<SDKResponse<AgentResult | AgentResult[]>> {
    try {
      const config: ParallelAgentConfig = {
        agents,
        task,
        mergeStrategy: strategy === 'race' ? 'first' : strategy,
      };
      const results = await this.agentManager.runParallel(config);

      if (strategy === 'first' || strategy === 'race') {
        return { success: true, data: results[0] };
      }

      return { success: true, data: results };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Specialized Agents
  // ============================================================================

  /**
   * Universal Agent - All-in-one enterprise agent
   */
  async universal(task: string, context?: Record<string, any>): Promise<SDKResponse<AgentResult>> {
    try {
      const result = await this.run('UniversalAgent', task);
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Cognitive Agent - Intelligent code generation
   */
  async cognitive(task: string): Promise<SDKResponse<AgentResult>> {
    try {
      const result = await this.run('CognitiveAgentBase', task);
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Secure Virtualized Agent - VM-based development
   */
  async virtualized(
    task: string,
    repository?: string
  ): Promise<SDKResponse<AgentResult>> {
    try {
      const taskWithRepo = repository
        ? `${task} (repository: ${repository})`
        : task;
      const result = await this.run('SecureVirtualizedAgent', taskWithRepo);
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Polymarket Agent - Prediction market trading
   */
  async polymarket(operation: string, params?: any): Promise<SDKResponse<AgentResult>> {
    try {
      const task = JSON.stringify({ operation, params });
      const result = await this.run('PolymarketAgent', task);
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Autonomous Orchestrator - Multi-agent coordination
   */
  async orchestrate(goal: string, agents?: string[]): Promise<SDKResponse<AgentResult>> {
    try {
      const task = agents
        ? `${goal} (agents: ${agents.join(', ')})`
        : goal;
      const result = await this.run('AutonomousOrchestrator', task);
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Frontend Agent - Frontend specialization
   */
  async frontend(task: string): Promise<SDKResponse<AgentResult>> {
    try {
      const result = await this.run('FrontendAgent', task);
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Backend Agent - Backend specialization
   */
  async backend(task: string): Promise<SDKResponse<AgentResult>> {
    try {
      const result = await this.run('BackendAgent', task);
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * DevOps Agent - DevOps operations
   */
  async devops(task: string): Promise<SDKResponse<AgentResult>> {
    try {
      const result = await this.run('DevOpsAgent', task);
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Code Review Agent - Code review
   */
  async codeReview(filePath: string, context?: string): Promise<SDKResponse<AgentResult>> {
    try {
      const task = context
        ? `Review ${filePath}: ${context}`
        : `Review ${filePath}`;
      const result = await this.run('CodeReviewAgent', task);
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Optimization Agent - Performance optimization
   */
  async optimize(target: string, metrics?: string[]): Promise<SDKResponse<AgentResult>> {
    try {
      const task = metrics
        ? `Optimize ${target} for: ${metrics.join(', ')}`
        : `Optimize ${target}`;
      const result = await this.run('OptimizationAgent', task);
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * React Agent - React-specific tasks
   */
  async react(task: string): Promise<SDKResponse<AgentResult>> {
    try {
      const result = await this.run('ReactAgent', task);
      return result;
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Agent Factory
  // ============================================================================

  /**
   * Get agent factory status
   */
  async getFactoryStatus(): Promise<SDKResponse<any>> {
    try {
      const status = await this.agentManager.getFactoryStatus();
      return { success: true, data: status };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * List agent blueprints
   */
  async listBlueprints(): Promise<SDKResponse<AgentBlueprint[]>> {
    try {
      const blueprints = await this.agentManager.listBlueprints();
      return { success: true, data: blueprints };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Save agent as blueprint
   */
  async saveAsBlueprint(
    agentIdOrName: string,
    blueprintName: string
  ): Promise<SDKResponse<AgentBlueprint>> {
    try {
      const blueprint = await this.agentManager.saveAsBlueprint(
        agentIdOrName,
        blueprintName
      );
      return { success: true, data: blueprint };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Create agent from blueprint
   */
  async createFromBlueprint(
    blueprintName: string,
    instanceName?: string
  ): Promise<SDKResponse<AgentDefinition>> {
    try {
      const agent = await this.agentManager.createFromBlueprint(
        blueprintName,
        instanceName
      );
      return { success: true, data: agent };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Agent Learning & Optimization
  // ============================================================================

  /**
   * Get agent learning statistics
   */
  async getLearningStats(agentIdOrName: string): Promise<SDKResponse<any>> {
    try {
      const stats = await this.agentManager.getLearningStats(agentIdOrName);
      return { success: true, data: stats };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Train agent on examples
   */
  async train(
    agentIdOrName: string,
    examples: Array<{ input: string; output: string }>
  ): Promise<SDKResponse<void>> {
    try {
      await this.agentManager.train(agentIdOrName, examples);
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Enable agent learning
   */
  async enableLearning(agentIdOrName: string): Promise<SDKResponse<void>> {
    try {
      await this.agentManager.enableLearning(agentIdOrName);
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Disable agent learning
   */
  async disableLearning(agentIdOrName: string): Promise<SDKResponse<void>> {
    try {
      await this.agentManager.disableLearning(agentIdOrName);
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Agent Monitoring
  // ============================================================================

  /**
   * Get agent performance metrics
   */
  async getMetrics(agentIdOrName: string): Promise<SDKResponse<any>> {
    try {
      const metrics = await this.agentManager.getMetrics(agentIdOrName);
      return { success: true, data: metrics };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get agent execution history
   */
  async getHistory(
    agentIdOrName: string,
    limit?: number
  ): Promise<SDKResponse<AgentResult[]>> {
    try {
      const history = await this.agentManager.getHistory(agentIdOrName, limit);
      return { success: true, data: history };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get active agents
   */
  async getActiveAgents(): Promise<SDKResponse<AgentDefinition[]>> {
    try {
      const agents = await this.agentManager.getActiveAgents();
      return { success: true, data: agents };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get agent status
   */
  async getStatus(agentIdOrName: string): Promise<SDKResponse<any>> {
    try {
      const status = await this.agentManager.getStatus(agentIdOrName);
      return { success: true, data: status };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Agent Planning
  // ============================================================================

  /**
   * Generate execution plan for task
   */
  async generatePlan(
    agentIdOrName: string,
    task: string
  ): Promise<SDKResponse<ExecutionPlan>> {
    try {
      const plan = await this.agentManager.generatePlan(agentIdOrName, task);
      return { success: true, data: plan };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Execute plan
   */
  async executePlan(
    agentIdOrName: string,
    plan: ExecutionPlan
  ): Promise<SDKResponse<AgentResult>> {
    try {
      const result = await this.agentManager.executePlan(agentIdOrName, plan);
      return { success: true, data: result };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Validate plan
   */
  async validatePlan(plan: ExecutionPlan): Promise<SDKResponse<any>> {
    try {
      const validation = await this.agentManager.validatePlan(plan);
      return { success: true, data: validation };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private handleError(error: any): SDKResponse<any> {
    return {
      success: false,
      error: {
        code: error.code || 'AGENT_ERROR',
        message: error.message || 'Agent operation failed',
        details: error,
        stack: error.stack,
      },
    };
  }
}
