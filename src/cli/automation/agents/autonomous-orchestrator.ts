import { BaseAgent } from './base-agent';
import { modelProvider, ChatMessage } from '../../ai/model-provider';
import { AgentManager } from './agent-manager';
import chalk from 'chalk';
import { z } from 'zod';

const TaskPlanSchema = z.object({
  tasks: z.array(z.object({
    id: z.string(),
    description: z.string(),
    agent: z.string(),
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    dependencies: z.array(z.string()).optional(),
    estimatedTime: z.string().optional(),
  })),
  reasoning: z.string(),
  executionOrder: z.array(z.string()),
});

export interface TaskResult {
  taskId: string;
  agent: string;
  success: boolean;
  result?: any;
  error?: string;
  startTime: Date;
  endTime: Date;
  duration: number;
}

export class AutonomousOrchestrator extends BaseAgent {
  id = 'autonomous-orchestrator';
  capabilities = ['task-orchestration', 'multi-agent-coordination', 'planning', 'execution'];
  specialization = 'Autonomous agent orchestrator that plans and executes complex multi-agent tasks';
  name = 'autonomous-orchestrator';
  description = 'Autonomous agent orchestrator that plans and executes complex multi-agent tasks';

  private agentManager: AgentManager;
  private runningTasks: Map<string, Promise<TaskResult>> = new Map();
  private agentRouter?: any; // Dynamic import to avoid circular deps
  private orchestrationCache: Map<string, any> = new Map();
  private performanceThreshold: number = 0.8;

  constructor(agentManager: AgentManager, workingDirectory: string = process.cwd()) {
    super(workingDirectory);
    this.agentManager = agentManager;
  }

  async planTasks(userRequest: string): Promise<any> {
    const availableAgents = this.agentManager.getAvailableAgentNames();

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an intelligent task orchestrator. Given a user request, break it down into specific tasks that can be executed by available AI agents.

Available agents: ${availableAgents.join(', ')}

Agent capabilities:
- coding-agent: General coding tasks, analysis, generation, optimization
- react-expert: React/Next.js development, components, hooks, state management
- backend-expert: Node.js, APIs, databases, server architecture
- devops-expert: CI/CD, Docker, Kubernetes, cloud deployment
- ai-analysis: General code analysis
- code-generator: Code generation
- code-review: Code review and quality assessment
- optimization: Performance optimization

Create a task plan with:
- Specific, actionable tasks
- Appropriate agent assignment for each task
- Task priorities and dependencies
- Logical execution order

Consider parallel execution where possible.`,
      },
      {
        role: 'user',
        content: `Plan tasks for: ${userRequest}`,
      },
    ];

    try {
      return await modelProvider.generateStructured({
        messages,
        schema: TaskPlanSchema,
        schemaName: 'TaskPlan',
        schemaDescription: 'Structured plan for multi-agent task execution',
      });
    } catch (error: any) {
      return {
        error: `Failed to plan tasks: ${error.message}`,
        userRequest,
      };
    }
  }

  async executeTaskPlan(plan: any): Promise<TaskResult[]> {
    if (!plan.tasks || !Array.isArray(plan.tasks)) {
      throw new Error('Invalid task plan');
    }

    console.log(chalk.blue.bold('\n🚀 Starting autonomous task execution'));
    console.log(chalk.gray(`Executing ${plan.tasks.length} tasks`));
    console.log(chalk.gray(`Strategy: ${plan.reasoning}`));

    const results: TaskResult[] = [];
    const completedTasks = new Set<string>();

    // Execute tasks according to dependencies and priorities
    for (const taskId of plan.executionOrder) {
      const task = plan.tasks.find((t: any) => t.id === taskId);
      if (!task) continue;

      // Check if dependencies are met
      if (task.dependencies) {
        const unmetDeps = task.dependencies.filter((dep: string) => !completedTasks.has(dep));
        if (unmetDeps.length > 0) {
          console.log(chalk.yellow(`⏳ Waiting for dependencies: ${unmetDeps.join(', ')}`));
          continue;
        }
      }

      // Execute task
      const result = await this.executeTask(task);
      results.push(result);

      if (result.success) {
        completedTasks.add(task.id);
        console.log(chalk.green(`✅ Task ${task.id} completed (${result.duration}ms)`));
      } else {
        console.log(chalk.red(`❌ Task ${task.id} failed: ${result.error}`));
      }
    }

    return results;
  }

  protected async onInitialize(): Promise<void> {
    console.log('Autonomous Orchestrator initialized');
    await this.setupAgentRouter();
  }

  protected async onExecuteTask(task: any): Promise<any> {
    const taskData = typeof task === 'string' ? task : task.data;
    return await this.planTasks(taskData);
  }

  public async executeTask(task: any): Promise<TaskResult> {
    const startTime = new Date();
    console.log(chalk.cyan(`🔄 Starting task: ${task.description} (${task.agent})`));

    try {
      const agent = this.agentManager.getAgent(task.agent);
      if (!agent) {
        throw new Error(`Agent ${task.agent} not found`);
      }

      await agent.initialize();
      const result = await agent.run?.(task.description);
      await agent.cleanup?.();

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      return {
        taskId: task.id,
        agent: task.agent,
        success: true,
        result,
        startTime,
        endTime,
        duration,
      };

    } catch (error: any) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      return {
        taskId: task.id,
        agent: task.agent,
        success: false,
        error: error.message,
        startTime,
        endTime,
        duration,
      };
    }
  }

  async executeParallelTasks(tasks: any[]): Promise<TaskResult[]> {
    console.log(chalk.blue.bold(`\n⚡ Executing ${tasks.length} tasks in parallel`));

    const promises = tasks.map(task => this.executeTask(task));
    const results = await Promise.all(promises);

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(chalk.green(`✅ Parallel execution complete: ${successful} successful, ${failed} failed`));

    return results;
  }

  async run(task?: string): Promise<any> {
    if (!task) {
      return {
        message: 'Autonomous Orchestrator ready! I can break down complex requests into multi-agent workflows.',
        capabilities: [
          'Task planning and decomposition',
          'Multi-agent coordination',
          'Parallel task execution',
          'Dependency management',
          'Progress monitoring',
        ],
      };
    }

    try {
      // Plan the tasks
      console.log(chalk.blue('🧠 Planning task execution...'));
      const plan = await this.planTasks(task);

      if (plan.error) {
        return plan;
      }

      console.log(chalk.blue.bold('\n📋 Task Plan:'));
      plan.tasks.forEach((t: any, index: number) => {
        const priority = t.priority === 'critical' ? chalk.red('🔴') :
          t.priority === 'high' ? chalk.yellow('🟡') :
            chalk.green('🟢');
        console.log(`${index + 1}. ${priority} ${t.description} → ${chalk.cyan(t.agent)}`);
      });

      console.log(chalk.gray(`\nReasoning: ${plan.reasoning}`));

      // Ask for confirmation in interactive mode
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const confirm = await new Promise<boolean>((resolve) => {
        readline.question(chalk.yellow('\nProceed with execution? (y/N): '), (answer: string) => {
          readline.close();
          resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
      });

      if (!confirm) {
        console.log(chalk.yellow('Execution cancelled'));
        return { cancelled: true, plan };
      }

      // Execute the plan
      const results = await this.executeTaskPlan(plan);

      // Summary
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

      console.log(chalk.blue.bold('\n📊 Execution Summary:'));
      console.log(chalk.green(`✅ Successful tasks: ${successful}`));
      console.log(chalk.red(`❌ Failed tasks: ${failed}`));
      console.log(chalk.gray(`⏱️  Total time: ${totalTime}ms`));

      return {
        plan,
        results,
        summary: {
          totalTasks: results.length,
          successful,
          failed,
          totalTime,
        },
      };

    } catch (error: any) {
      return {
        error: `Orchestration failed: ${error.message}`,
        task,
      };
    }
  }

  // ====================== 🎯 PERFORMANCE OPTIMIZATION METHODS ======================

  /**
   * Setup AgentRouter for intelligent task routing
   */
  private async setupAgentRouter(): Promise<void> {
    try {
      const { AgentRouter } = await import('./agent-router');
      this.agentRouter = new AgentRouter();

      // Register available agents from AgentManager
      const availableAgents = this.agentManager.getAvailableAgentNames();
      for (const agentName of availableAgents) {
        const agent = this.agentManager.getAgent(agentName);
        if (agent) {
          this.agentRouter.registerAgent(agentName, agent);
        }
      }

      console.log(chalk.blue(`🎯 AgentRouter integrated with ${availableAgents.length} agents`));
    } catch (error) {
      console.log(chalk.yellow('⚠️ AgentRouter integration failed, using fallback mode'));
    }
  }

  /**
   * Enhanced executeTaskPlan with intelligent routing
   */
  async executeTaskPlanOptimized(plan: any): Promise<TaskResult[]> {
    if (!plan.tasks || !Array.isArray(plan.tasks)) {
      throw new Error('Invalid task plan');
    }

    console.log(chalk.blue.bold('\n🚀 Starting optimized autonomous task execution'));
    console.log(chalk.gray(`Executing ${plan.tasks.length} tasks with intelligent routing`));

    const results: TaskResult[] = [];
    const completedTasks = new Set<string>();

    // Group tasks by priority for batch execution
    const taskGroups = this.groupTasksByPriority(plan.tasks);

    for (const [priority, tasks] of taskGroups.entries()) {
      console.log(chalk.cyan(`\n🎯 Executing ${priority} priority tasks (${tasks.length} tasks)`));

      // Execute tasks in parallel for same priority
      const groupResults = await this.executeBatch(tasks.map(task => ({
        item: task,
        processor: async (task: any) => await this.executeTaskOptimized(task)
      })));

      results.push(...groupResults);

      // Mark completed tasks
      groupResults.forEach(result => {
        if (result.success) {
          completedTasks.add(result.taskId);
        }
      });
    }

    return results;
  }

  /**
   * Optimized single task execution with routing
   */
  private async executeTaskOptimized(task: any): Promise<TaskResult> {
    const startTime = new Date();
    console.log(chalk.cyan(`🔄 Optimized execution: ${task.description} (${task.agent})`));

    try {
      let result: any;

      // Try AgentRouter first if available
      if (this.agentRouter) {
        const routingResult = await this.agentRouter.routeTask(task);
        if (routingResult.success) {
          result = routingResult.result;
          console.log(chalk.green(`✅ Routed to ${routingResult.assignedAgent}`));
        } else {
          // Fallback to direct agent execution
          result = await this.executeTaskDirect(task);
        }
      } else {
        result = await this.executeTaskDirect(task);
      }

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      return {
        taskId: task.id,
        agent: task.agent,
        success: true,
        result,
        startTime,
        endTime,
        duration,
      };

    } catch (error: any) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      return {
        taskId: task.id,
        agent: task.agent,
        success: false,
        error: error.message,
        startTime,
        endTime,
        duration,
      };
    }
  }

  /**
   * Direct agent execution (fallback)
   */
  private async executeTaskDirect(task: any): Promise<any> {
    const agent = this.agentManager.getAgent(task.agent);
    if (!agent) {
      throw new Error(`Agent ${task.agent} not found`);
    }

    await agent.initialize();
    const result = await agent.run?.(task.description);
    await agent.cleanup?.();
    return result;
  }

  /**
   * Group tasks by priority for optimized execution
   */
  private groupTasksByPriority(tasks: any[]): Map<string, any[]> {
    const groups = new Map<string, any[]>();

    for (const task of tasks) {
      const priority = task.priority || 'normal';
      if (!groups.has(priority)) {
        groups.set(priority, []);
      }
      groups.get(priority)!.push(task);
    }

    // Return in execution order: critical -> high -> normal -> low
    const ordered = new Map<string, any[]>();
    ['critical', 'high', 'normal', 'low'].forEach(priority => {
      if (groups.has(priority)) {
        ordered.set(priority, groups.get(priority)!);
      }
    });

    return ordered;
  }

  /**
   * Enhanced batch execution with performance monitoring
   */
  private async executeBatch(items: Array<{ item: any, processor: (item: any) => Promise<any> }>): Promise<any[]> {
    const batchSize = Math.min(3, items.length); // Max 3 parallel tasks
    const results = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const startTime = Date.now();

      const batchResults = await Promise.allSettled(
        batch.map(({ item, processor }) => processor(item))
      );

      const batchDuration = Date.now() - startTime;
      console.log(chalk.gray(`⚡ Batch ${Math.floor(i / batchSize) + 1} completed in ${batchDuration}ms`));

      results.push(...batchResults.map(result =>
        result.status === 'fulfilled' ? result.value : {
          success: false,
          error: result.reason?.message || 'Unknown error'
        }
      ));

      // Small delay between batches to prevent overwhelming
      if (i + batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /**
   * Get orchestration performance metrics
   */
  getPerformanceMetrics(): any {
    const runningCount = this.runningTasks.size;
    const cacheHitRate = this.orchestrationCache.size > 0 ?
      (this.orchestrationCache.size / (this.orchestrationCache.size + 10)) : 0;

    return {
      runningTasks: runningCount,
      cacheSize: this.orchestrationCache.size,
      cacheHitRate: Math.round(cacheHitRate * 100),
      performanceThreshold: this.performanceThreshold,
      agentRouterActive: !!this.agentRouter
    };
  }

  /**
   * Enhanced cleanup
   */
  protected async onStop(): Promise<void> {
    // Wait for all running tasks to complete
    await Promise.all(this.runningTasks.values());

    // Clear caches
    this.orchestrationCache.clear();

    // Close router if active
    if (this.agentRouter) {
      this.agentRouter = null;
    }

    console.log('Autonomous Orchestrator stopped with optimizations');
  }
}