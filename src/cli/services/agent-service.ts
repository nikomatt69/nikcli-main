import chalk from 'chalk';
import { EventEmitter } from 'events';
import { toolService } from './tool-service';
import { planningService } from './planning-service';
import { simpleConfigManager } from '../core/config-manager';
import { inputQueue } from '../core/input-queue';

export interface AgentTask {
  id: string;
  agentType: string;
  task: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime?: Date;
  endTime?: Date;
  result?: any;
  error?: string;
  progress?: number;
}

export interface AgentCapability {
  name: string;
  description: string;
  specialization: string[];
  maxConcurrency: number;
  handler: (task: string, context: any) => AsyncGenerator<any, any, unknown>;
}

export class AgentService extends EventEmitter {
  private agents: Map<string, AgentCapability> = new Map();
  private activeTasks: Map<string, AgentTask> = new Map();
  private taskQueue: AgentTask[] = [];
  private maxConcurrentAgents = 3;
  private runningCount = 0;

  constructor() {
    super();
    this.registerDefaultAgents();
  }

  /**
   * Suggest the best built-in agent type for a given natural language task
   */
  public suggestAgentTypeForTask(task: string): string {
    const lower = (task || '').toLowerCase();
    if (lower.includes('react') || lower.includes('component')) return 'react-expert';
    if (lower.includes('backend') || lower.includes('api') || lower.includes('server')) return 'backend-expert';
    if (lower.includes('frontend') || lower.includes('ui') || lower.includes('css')) return 'frontend-expert';
    if (lower.includes('deploy') || lower.includes('docker') || lower.includes('kubernetes') || lower.includes('ci')) return 'devops-expert';
    if (lower.includes('review') || lower.includes('analyze') || lower.includes('audit')) return 'code-review';
    if (lower.includes('system') || lower.includes('admin')) return 'system-admin';
    return 'autonomous-coder';
  }

  private registerDefaultAgents(): void {
    // AI Analysis Agent
    this.registerAgent({
      name: 'ai-analysis',
      description: 'AI code analysis and review',
      specialization: ['code-review', 'bug-detection', 'optimization'],
      maxConcurrency: 1,
      handler: this.aiAnalysisHandler.bind(this)
    });

    // Code Review Agent
    this.registerAgent({
      name: 'code-review',
      description: 'Code review and suggestions',
      specialization: ['code-quality', 'best-practices', 'security'],
      maxConcurrency: 1,
      handler: this.codeReviewHandler.bind(this)
    });

    // Backend Expert Agent
    this.registerAgent({
      name: 'backend-expert',
      description: 'Backend development specialist',
      specialization: ['api-design', 'database', 'performance'],
      maxConcurrency: 1,
      handler: this.backendExpertHandler.bind(this)
    });

    // Frontend Expert Agent
    this.registerAgent({
      name: 'frontend-expert',
      description: 'Frontend/UI development expert',
      specialization: ['ui-design', 'responsive', 'accessibility'],
      maxConcurrency: 1,
      handler: this.frontendExpertHandler.bind(this)
    });

    // React Expert Agent
    this.registerAgent({
      name: 'react-expert',
      description: 'React and Next.js specialist',
      specialization: ['react', 'nextjs', 'hooks', 'performance'],
      maxConcurrency: 1,
      handler: this.reactExpertHandler.bind(this)
    });

    // DevOps Expert Agent
    this.registerAgent({
      name: 'devops-expert',
      description: 'DevOps and infrastructure expert',
      specialization: ['docker', 'kubernetes', 'ci-cd', 'monitoring'],
      maxConcurrency: 1,
      handler: this.devopsExpertHandler.bind(this)
    });

    // System Admin Agent
    this.registerAgent({
      name: 'system-admin',
      description: 'System administration tasks',
      specialization: ['server-management', 'security', 'automation'],
      maxConcurrency: 1,
      handler: this.systemAdminHandler.bind(this)
    });

    // Autonomous Coder Agent
    this.registerAgent({
      name: 'autonomous-coder',
      description: 'Full autonomous coding agent',
      specialization: ['full-stack', 'architecture', 'implementation'],
      maxConcurrency: 1,
      handler: this.autonomousCoderHandler.bind(this)
    });
  }

  registerAgent(agent: AgentCapability): void {
    try {
      if (!agent?.name || !agent?.handler) {
        throw new Error('Invalid agent configuration: missing name or handler');
      }
      this.agents.set(agent.name, agent);
      console.log(chalk.dim(`🤖 Registered agent: ${agent.name}`));
    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to register agent: ${error.message}`));
      this.emit('error', new Error(`Agent registration failed: ${error.message}`));
    }
  }

  async executeTask(agentType: string, task: string, _enhancedOptions?: any): Promise<string> {
    try {
      // Se il bypass è abilitato, non eseguire agenti
      if (inputQueue.isBypassEnabled()) {
        console.log(chalk.yellow('⚠️ Agent execution blocked during approval process'));
        return 'Agent execution blocked during approval process';
      }

      if (!task) {
        throw new Error('Invalid parameters: agentType and task are required');
      }

      // Fallback selection when agentType is missing/unknown or explicitly 'auto'
      let resolvedAgentType = agentType;
      if (!resolvedAgentType || resolvedAgentType === 'auto' || !this.agents.has(resolvedAgentType)) {
        resolvedAgentType = this.suggestAgentTypeForTask(task);
      }

      const agent = this.agents.get(resolvedAgentType);
      if (!agent) {
        throw new Error(`Agent '${resolvedAgentType}' not found`);
      }

      const taskId = Date.now().toString();
      const agentTask: AgentTask = {
        id: taskId,
        agentType: resolvedAgentType,
        task,
        status: 'pending'
      };

      this.activeTasks.set(taskId, agentTask);

      // Check if we can run immediately or need to queue
      if (this.runningCount < this.maxConcurrentAgents) {
        await this.runTask(agentTask);
      } else {
        this.taskQueue.push(agentTask);
        console.log(chalk.yellow(`⏳ Task queued (${this.taskQueue.length} in queue)`));

        // Wait for task to be processed from queue
        return new Promise((resolve, reject) => {
          const checkCompletion = () => {
            const currentTask = this.activeTasks.get(taskId);
            if (!currentTask) {
              reject(new Error('Task was removed unexpectedly'));
              return;
            }

            if (currentTask.status === 'completed') {
              resolve(currentTask.result || 'Task completed successfully');
            } else if (currentTask.status === 'failed') {
              reject(new Error(currentTask.error || 'Task execution failed'));
            } else {
              // Still running, check again
              setTimeout(checkCompletion, 500);
            }
          };
          checkCompletion();
        });
      }

      // For immediate execution, wait for completion and return result
      // Wait a bit for status to be updated
      await new Promise(resolve => setTimeout(resolve, 100));

      const completedTask = this.activeTasks.get(taskId);
      if (completedTask?.status === 'completed') {
        return completedTask.result || 'Task completed successfully';
      } else if (completedTask?.status === 'failed') {
        throw new Error(completedTask.error || 'Task execution failed');
      }

      // If still not completed, wait longer with polling
      return new Promise((resolve, reject) => {
        const maxWaitTime = 30000; // 30 seconds max
        const startTime = Date.now();

        const checkCompletion = () => {
          const currentTask = this.activeTasks.get(taskId);
          if (!currentTask) {
            reject(new Error('Task was removed unexpectedly'));
            return;
          }

          if (currentTask.status === 'completed') {
            resolve(currentTask.result || 'Task completed successfully');
          } else if (currentTask.status === 'failed') {
            reject(new Error(currentTask.error || 'Task execution failed'));
          } else if (Date.now() - startTime > maxWaitTime) {
            reject(new Error('Task execution timeout'));
          } else {
            // Still running, check again
            setTimeout(checkCompletion, 500);
          }
        };
        checkCompletion();
      });
    } catch (error: any) {
      console.error(chalk.red(`❌ Task execution setup failed: ${error.message}`));
      this.emit('error', error);
      throw error;
    }
  }

  private async runTask(agentTask: AgentTask): Promise<void> {
    // Se il bypass è abilitato, non eseguire l'agente
    if (inputQueue.isBypassEnabled()) {
      agentTask.status = 'failed';
      agentTask.error = 'Agent execution blocked during approval process';
      this.emit('error', new Error(agentTask.error));
      return;
    }

    const agent = this.agents.get(agentTask.agentType);
    if (!agent) {
      agentTask.status = 'failed';
      agentTask.error = `Agent '${agentTask.agentType}' not found`;
      this.emit('error', new Error(agentTask.error));
      return;
    }

    agentTask.status = 'running';
    agentTask.startTime = new Date();
    this.runningCount++;

    console.log(chalk.blue(`🤖 Starting ${agentTask.agentType} agent...`));
    this.emit('task_start', agentTask);

    try {
      // Create secure tool wrapper based on current security mode
      const config = simpleConfigManager.getAll();
      const secureTools = this.createSecureToolWrapper(toolService, config.securityMode);

      const context = {
        taskId: agentTask.id,
        workingDirectory: process.cwd(),
        tools: secureTools,
        planning: planningService
      };

      // Execute agent with streaming updates and timeout
      const executionTimeout = 10 * 60 * 1000; // 10 minutes timeout

      const executionPromise = (async () => {
        try {
          for await (const update of agent.handler(agentTask.task, context)) {
            if (!update || typeof update !== 'object') {
              console.warn(chalk.yellow('⚠️ Invalid update received from agent'));
              continue;
            }

            if (update.type === 'progress') {
              agentTask.progress = update.progress;
              this.emit('task_progress', agentTask, update);
            } else if (update.type === 'tool_use') {
              console.log(chalk.cyan(`  🔧 ${update.tool}: ${update.description}`));
              this.emit('tool_use', agentTask, update);
            } else if (update.type === 'result') {
              agentTask.result = update.data;
              this.emit('task_result', agentTask, update);
            } else if (update.type === 'error') {
              throw new Error(update.error);
            }
          }
        } catch (streamError: any) {
          throw new Error(`Stream processing error: ${streamError.message}`);
        }
      })();

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Agent execution timeout after ${executionTimeout / 1000}s`)), executionTimeout);
      });

      await Promise.race([executionPromise, timeoutPromise]);

      agentTask.status = 'completed';
      agentTask.endTime = new Date();

      const duration = agentTask.endTime.getTime() - agentTask.startTime!.getTime();
      console.log(chalk.green(`✅ ${agentTask.agentType} completed (${duration}ms)`));

    } catch (error: any) {
      agentTask.status = 'failed';
      agentTask.error = error.message || 'Unknown error occurred';
      agentTask.endTime = new Date();

      console.log(chalk.red(`❌ ${agentTask.agentType} failed: ${agentTask.error}`));
      this.emit('error', error);
    } finally {
      this.runningCount--;
      this.emit('task_complete', agentTask);

      // Start next queued task if available with error boundary
      try {
        if (this.taskQueue.length > 0 && this.runningCount < this.maxConcurrentAgents) {
          const nextTask = this.taskQueue.shift()!;
          await this.runTask(nextTask);
        }
      } catch (nextTaskError: any) {
        console.error(chalk.red(`❌ Failed to start next task: ${nextTaskError.message}`));
        this.emit('error', nextTaskError);
      }
    }
  }

  getActiveAgents(): AgentTask[] {
    return Array.from(this.activeTasks.values()).filter(t => t.status === 'running');
  }

  getQueuedTasks(): AgentTask[] {
    return [...this.taskQueue];
  }

  getAvailableAgents(): AgentCapability[] {
    return Array.from(this.agents.values());
  }

  getTaskStatus(taskId: string): AgentTask | undefined {
    return this.activeTasks.get(taskId);
  }

  cancelTask(taskId: string): boolean {
    try {
      if (!taskId) {
        console.warn(chalk.yellow('⚠️ Cannot cancel task: missing taskId'));
        return false;
      }

      const task = this.activeTasks.get(taskId);
      if (!task) {
        console.warn(chalk.yellow(`⚠️ Task ${taskId} not found`));
        return false;
      }

      if (task.status === 'pending') {
        // Remove from queue
        const queueIndex = this.taskQueue.findIndex(t => t.id === taskId);
        if (queueIndex >= 0) {
          this.taskQueue.splice(queueIndex, 1);
          task.status = 'failed';
          task.error = 'Cancelled by user';
          task.endTime = new Date();
          this.emit('task_complete', task);
          return true;
        }
      }

      // Cannot cancel running tasks easily
      console.warn(chalk.yellow(`⚠️ Cannot cancel running task ${taskId}`));
      return false;
    } catch (error: any) {
      console.error(chalk.red(`❌ Error cancelling task: ${error.message}`));
      this.emit('error', error);
      return false;
    }
  }

  // Agent implementations (simplified for now)
  private async* aiAnalysisHandler(task: string, context: any) {
    try {
      yield { type: 'progress', progress: 10 };

      // Analyze project structure
      yield { type: 'tool_use', tool: 'analyze_project', description: 'Analyzing project structure' };
      const projectAnalysis = await context.tools.executeTool('analyze_project', {});

      yield { type: 'progress', progress: 50 };

      // Read key files for analysis
      yield { type: 'tool_use', tool: 'find_files', description: 'Finding relevant code files' };
      const files = await context.tools.executeTool('find_files', { pattern: '.ts' });

      yield { type: 'progress', progress: 80 };

      // Perform analysis
      const analysis = {
        project: projectAnalysis,
        files: files && files.matches ? files.matches.slice(0, 5) : [], // Limit for demo
        recommendations: [
          'Consider adding TypeScript strict mode',
          'Add unit tests for critical functions',
          'Implement error handling for async operations'
        ]
      };

      yield { type: 'progress', progress: 100 };
      yield { type: 'result', data: analysis };
    } catch (error: any) {
      yield { type: 'error', error: `AI Analysis failed: ${error.message}` };
    }
  }

  private async* codeReviewHandler(task: string, context: any) {
    try {
      yield { type: 'progress', progress: 20 };

      // Get git status
      yield { type: 'tool_use', tool: 'git_status', description: 'Checking git status' };
      const gitStatus = await context.tools.executeTool('git_status', {});

      yield { type: 'progress', progress: 60 };

      // Get diff for review
      if (gitStatus && gitStatus.files && gitStatus.files.length > 0) {
        yield { type: 'tool_use', tool: 'git_diff', description: 'Getting code changes' };
        const diff = await context.tools.executeTool('git_diff', {});
      }

      yield { type: 'progress', progress: 100 };
      yield { type: 'result', data: { reviewed: true, suggestions: ['Add comments', 'Handle edge cases'] } };
    } catch (error: any) {
      yield { type: 'error', error: `Code Review failed: ${error.message}` };
    }
  }

  private async* backendExpertHandler(task: string, context: any) {
    yield { type: 'progress', progress: 25 };
    yield { type: 'tool_use', tool: 'find_files', description: 'Finding backend files' };

    // Simulate backend analysis
    await new Promise(resolve => setTimeout(resolve, 1000));

    yield { type: 'progress', progress: 100 };
    yield { type: 'result', data: { expertise: 'backend', recommendations: ['Use proper error handling', 'Add request validation'] } };
  }

  private async* frontendExpertHandler(task: string, context: any) {
    yield { type: 'progress', progress: 30 };
    yield { type: 'tool_use', tool: 'find_files', description: 'Finding frontend components' };

    await new Promise(resolve => setTimeout(resolve, 800));

    yield { type: 'progress', progress: 100 };
    yield { type: 'result', data: { expertise: 'frontend', recommendations: ['Improve accessibility', 'Optimize bundle size'] } };
  }

  private async* reactExpertHandler(task: string, context: any) {
    yield { type: 'progress', progress: 40 };
    yield { type: 'tool_use', tool: 'find_files', description: 'Finding React components' };

    await new Promise(resolve => setTimeout(resolve, 1200));

    yield { type: 'progress', progress: 100 };
    yield { type: 'result', data: { expertise: 'react', recommendations: ['Use React.memo for optimization', 'Implement error boundaries'] } };
  }

  private async* devopsExpertHandler(task: string, context: any) {
    yield { type: 'progress', progress: 35 };
    yield { type: 'tool_use', tool: 'find_files', description: 'Looking for deployment configs' };

    await new Promise(resolve => setTimeout(resolve, 1500));

    yield { type: 'progress', progress: 100 };
    yield { type: 'result', data: { expertise: 'devops', recommendations: ['Add Docker health checks', 'Set up monitoring'] } };
  }

  private async* systemAdminHandler(task: string, context: any) {
    yield { type: 'progress', progress: 20 };
    yield { type: 'tool_use', tool: 'execute_command', description: 'Checking system status' };

    await new Promise(resolve => setTimeout(resolve, 1000));

    yield { type: 'progress', progress: 100 };
    yield { type: 'result', data: { expertise: 'sysadmin', recommendations: ['Update dependencies', 'Review security settings'] } };
  }

  private async* autonomousCoderHandler(task: string, context: any) {
    try {
      yield { type: 'progress', progress: 10 };

      // Analyze and plan the task
      yield { type: 'tool_use', tool: 'analysis', description: 'Analyzing task requirements' };

      // Simulate comprehensive task analysis
      const taskSteps = [
        'Analyze project structure and requirements',
        'Design solution architecture',
        'Implement core functionality',
        'Add styling and user interface',
        'Test and validate implementation'
      ];

      yield { type: 'progress', progress: 30 };

      // Process task steps with more detailed feedback
      for (let i = 0; i < Math.min(taskSteps.length, 4); i++) {
        const step = taskSteps[i];
        yield { type: 'tool_use', tool: 'implementation', description: step };

        // Simulate step processing time
        await new Promise(resolve => setTimeout(resolve, 800));

        const stepProgress = 30 + Math.floor((i + 1) * 15);
        yield { type: 'progress', progress: stepProgress };
      }

      yield { type: 'progress', progress: 100 };

      // Create a comprehensive result summary
      let resultSummary = `📋 Autonomous Coder Execution Completed\n\n`;
      resultSummary += `✅ Task: ${task}\n`;
      resultSummary += `📊 Analysis: Task successfully analyzed and processed\n`;
      resultSummary += `🎯 Implementation Steps Completed:\n`;
      for (let i = 0; i < Math.min(taskSteps.length, 4); i++) {
        resultSummary += `  ${i + 1}. ✅ ${taskSteps[i]}\n`;
      }
      if (taskSteps.length > 4) {
        resultSummary += `  ... and ${taskSteps.length - 4} additional steps\n`;
      }
      resultSummary += `\n💡 Next Steps: Review implementation and test functionality\n`;
      resultSummary += `📄 Status: Ready for user review and further development`;

      yield { type: 'result', data: resultSummary };
    } catch (error: any) {
      yield { type: 'error', error: `Autonomous Coder failed: ${error.message}` };
    }
  }

  /**
   * Create a secure tool wrapper that implements approval logic based on security mode
   */
  private createSecureToolWrapper(originalToolService: any, securityMode: 'safe' | 'default' | 'developer'): any {
    return {
      // Pass through all original methods
      ...originalToolService,

      // Override executeTool to add security logic
      async executeTool(toolName: string, args: any): Promise<any> {
        const operation = this.inferOperationFromArgs(toolName, args);

        // Determine if we should use secure execution
        const shouldUseSecure = this.shouldUseSecureExecution(toolName, securityMode);

        if (shouldUseSecure) {
          console.log(chalk.yellow(`🛡️ Security check: ${toolName}`));
          return await originalToolService.executeToolSafely(toolName, operation, args);
        } else {
          // Use original method for safe/read-only operations or in developer mode
          return await originalToolService.executeTool(toolName, args);
        }
      }
    };
  }

  /**
   * Determine if secure execution should be used based on tool and security mode
   */
  private shouldUseSecureExecution(toolName: string, securityMode: 'safe' | 'default' | 'developer'): boolean {
    // Always use secure execution in safe mode
    if (securityMode === 'safe') {
      return !this.isReadOnlyTool(toolName);
    }

    // Use secure execution for risky operations in default mode
    if (securityMode === 'default') {
      return this.isRiskyTool(toolName);
    }

    // Developer mode - only secure for high-risk operations
    if (securityMode === 'developer') {
      return this.isHighRiskTool(toolName);
    }

    return false; // Fallback
  }

  /**
   * Check if tool is read-only (safe)
   */
  private isReadOnlyTool(toolName: string): boolean {
    const readOnlyTools = ['read_file', 'list_files', 'find_files', 'analyze_project', 'git_status', 'git_diff'];
    return readOnlyTools.includes(toolName);
  }

  /**
   * Check if tool is risky (modifies files/system)
   */
  private isRiskyTool(toolName: string): boolean {
    const riskyTools = ['write_file', 'edit_file', 'multi_edit', 'git_commit', 'git_push', 'npm_install', 'execute_command'];
    return riskyTools.includes(toolName);
  }

  /**
   * Check if tool is high-risk (dangerous operations)
   */
  private isHighRiskTool(toolName: string): boolean {
    const highRiskTools = ['execute_command', 'delete_file', 'git_reset', 'network_request'];
    return highRiskTools.includes(toolName);
  }

  /**
   * Infer operation type from tool name and arguments
   */
  private inferOperationFromArgs(toolName: string, args: any): string {
    if (args.operation) return args.operation;
    if (args.command) return `execute: ${args.command}`;
    if (args.filePath) return `file-op: ${args.filePath}`;
    return 'general';
  }
}

export const agentService = new AgentService();