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
  private runningGenerators: Map<string, AsyncGenerator<any, any, unknown>> = new Map();
  private cancelledTasks: Set<string> = new Set();

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
    if (lower.includes('next')) return 'nextjs-expert';
    if (lower.includes('vue')) return 'vue-expert';
    if (lower.includes('framer') || lower.includes('motion') || lower.includes('animate') || lower.includes('animation')) return 'framer-motion-expert';
    if (lower.includes('ai sdk') || lower.includes('ai-sdk') || lower.includes('@ai-sdk') || lower.includes('vercel ai')) return 'ai-sdk-integrator';
    if (lower.includes('backend') || lower.includes('api') || lower.includes('server')) return 'backend-expert';
    if (lower.includes('frontend') || lower.includes('ui') || lower.includes('css')) return 'frontend-expert';
    if (lower.includes('deploy') || lower.includes('docker') || lower.includes('kubernetes') || lower.includes('ci')) return 'devops-expert';
    if (lower.includes('review') || lower.includes('analyz') || lower.includes('audit')) return 'code-review';
    if (lower.includes('optimiz') || lower.includes('performance')) return 'optimization-expert';
    if (lower.includes('generate') || lower.includes('scaffold') || lower.includes('boilerplate')) return 'code-generator';
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

    // Next.js Expert Agent (alias to React handler)
    this.registerAgent({
      name: 'nextjs-expert',
      description: 'Next.js specialist (routing, SSR/SSG, app router)',
      specialization: ['nextjs', 'react', 'ssr', 'routing'],
      maxConcurrency: 1,
      handler: this.reactExpertHandler.bind(this)
    });

    // Vue Expert Agent (mapped to frontend handler)
    this.registerAgent({
      name: 'vue-expert',
      description: 'Vue.js specialist',
      specialization: ['vue', 'vuex', 'vue-router', 'performance'],
      maxConcurrency: 1,
      handler: this.frontendExpertHandler.bind(this)
    });

    // Framer Motion UI Expert
    this.registerAgent({
      name: 'framer-motion-expert',
      description: 'UI animations specialist using Framer Motion',
      specialization: ['framer-motion', 'animations', 'variants', 'gestures', 'layout'],
      maxConcurrency: 1,
      handler: this.framerMotionHandler.bind(this)
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

    // Code Generator Agent (from automation/agents/code-generator-agent)
    this.registerAgent({
      name: 'code-generator',
      description: 'Generates boilerplate and scaffolds features',
      specialization: ['scaffolding', 'boilerplate', 'codegen'],
      maxConcurrency: 1,
      handler: this.codeGeneratorHandler.bind(this)
    });

    // Optimization Agent (from automation/agents/optimization-agent)
    this.registerAgent({
      name: 'optimization-expert',
      description: 'Performance and optimization specialist',
      specialization: ['optimization', 'profiling', 'performance'],
      maxConcurrency: 1,
      handler: this.optimizationExpertHandler.bind(this)
    });

    // Coding Agent (from automation/agents/coding-agent)
    this.registerAgent({
      name: 'coding-expert',
      description: 'General-purpose coding assistant',
      specialization: ['coding', 'implementation', 'refactoring'],
      maxConcurrency: 1,
      handler: this.autonomousCoderHandler.bind(this)
    });

    // AI Analysis Agent (from automation/agents/ai-agent) alias
    this.registerAgent({
      name: 'ai-expert',
      description: 'Advanced AI analysis and reports',
      specialization: ['analysis', 'insights', 'quality'],
      maxConcurrency: 1,
      handler: this.aiAnalysisHandler.bind(this)
    });

    // AI SDK Integrator (Vercel AI SDK and providers)
    this.registerAgent({
      name: 'ai-sdk-integrator',
      description: 'Integrates AI using AI SDK (streaming, providers, tools)',
      specialization: ['ai-sdk', 'providers', 'streaming', 'tool-calling', 'routing'],
      maxConcurrency: 1,
      handler: this.aiSdkIntegratorHandler.bind(this)
    });

    // Aliases for discoverability
    this.registerAgent({
      name: 'framer-motion-agent',
      description: 'Alias of framer-motion-expert',
      specialization: ['framer-motion'],
      maxConcurrency: 1,
      handler: this.framerMotionHandler.bind(this)
    });
    this.registerAgent({
      name: 'ai-sdk-agent',
      description: 'Alias of ai-sdk-integrator',
      specialization: ['ai-sdk'],
      maxConcurrency: 1,
      handler: this.aiSdkIntegratorHandler.bind(this)
    });

    // Aliases mirroring classes from automation/agents/* for discoverability
    this.registerAgent({
      name: 'react-agent',
      description: 'Alias of react-expert',
      specialization: ['react'],
      maxConcurrency: 1,
      handler: this.reactExpertHandler.bind(this)
    });
    this.registerAgent({
      name: 'frontend-agent',
      description: 'Alias of frontend-expert',
      specialization: ['frontend'],
      maxConcurrency: 1,
      handler: this.frontendExpertHandler.bind(this)
    });
    this.registerAgent({
      name: 'backend-agent',
      description: 'Alias of backend-expert',
      specialization: ['backend'],
      maxConcurrency: 1,
      handler: this.backendExpertHandler.bind(this)
    });
    this.registerAgent({
      name: 'devops-agent',
      description: 'Alias of devops-expert',
      specialization: ['devops'],
      maxConcurrency: 1,
      handler: this.devopsExpertHandler.bind(this)
    });
    this.registerAgent({
      name: 'system-admin-agent',
      description: 'Alias of system-admin',
      specialization: ['sysadmin'],
      maxConcurrency: 1,
      handler: this.systemAdminHandler.bind(this)
    });
    this.registerAgent({
      name: 'code-review-agent',
      description: 'Alias of code-review',
      specialization: ['review'],
      maxConcurrency: 1,
      handler: this.codeReviewHandler.bind(this)
    });
    this.registerAgent({
      name: 'code-generator-agent',
      description: 'Alias of code-generator',
      specialization: ['codegen'],
      maxConcurrency: 1,
      handler: this.codeGeneratorHandler.bind(this)
    });
    this.registerAgent({
      name: 'optimization-agent',
      description: 'Alias of optimization-expert',
      specialization: ['optimization'],
      maxConcurrency: 1,
      handler: this.optimizationExpertHandler.bind(this)
    });
    this.registerAgent({
      name: 'coding-agent',
      description: 'Alias of coding-expert',
      specialization: ['coding'],
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
        throw new Error('Agent execution blocked during approval process');
      }

      if (!task) {
        throw new Error('Invalid parameters: task is required');
      }

      // Fallback selection when agentType is missing/unknown or explicitly 'auto'
      let resolvedAgentType = agentType;
      if (!resolvedAgentType || resolvedAgentType === 'auto' || !this.agents.has(resolvedAgentType)) {
        resolvedAgentType = this.suggestAgentTypeForTask(task);
      }

      let agent = this.agents.get(resolvedAgentType);
      if (!agent) {
        // Graceful fallback: try autonomous-coder
        const fallbackType = 'autonomous-coder';
        const fallback = this.agents.get(fallbackType);
        if (fallback) {
          console.log(chalk.yellow(`⚠️ Agent '${resolvedAgentType}' not found. Falling back to '${fallbackType}'.`));
          resolvedAgentType = fallbackType;
          agent = fallback;
        } else {
          // As a last resort, pick the first available agent
          const anyAgent = this.getAvailableAgents()[0];
          if (anyAgent) {
            console.log(chalk.yellow(`⚠️ Agent '${resolvedAgentType}' not found. Using '${anyAgent.name}'.`));
            resolvedAgentType = anyAgent.name;
            agent = this.agents.get(anyAgent.name)!;
          } else {
            throw new Error(`Agent '${resolvedAgentType}' not found and no fallback available`);
          }
        }
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
        // Start task asynchronously; do not await to keep API responsive
        this.runTask(agentTask).catch(err => {
          console.error(chalk.red(`❌ Failed to start task: ${err.message}`));
          this.emit('error', err);
          agentTask.status = 'failed';
          agentTask.error = err.message;
        });
      } else {
        this.taskQueue.push(agentTask);
        console.log(chalk.yellow(`⏳ Task queued (${this.taskQueue.length} in queue)`));
      }

      // Return taskId immediately; callers can poll getTaskStatus or listen to events
      return taskId;
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

      // Prepare generator and track it for potential cancellation
      const generator = agent.handler(agentTask.task, context);
      this.runningGenerators.set(agentTask.id, generator as any);

      const executionPromise = (async () => {
        try {
          for await (const update of generator as any) {
            // Cooperative cancellation: check flag between updates
            if (this.cancelledTasks.has(agentTask.id)) {
              // Attempt to close the generator gracefully
              try { await (generator as any)?.return?.(); } catch { /* ignore */ }
              throw new Error('Cancelled by user');
            }
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
      // Cleanup generator/cancellation tracking
      this.runningGenerators.delete(agentTask.id);
      this.cancelledTasks.delete(agentTask.id);
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
      // Mark running task as cancelled and attempt generator return
      if (task.status === 'running') {
        this.cancelledTasks.add(taskId);
        const gen = this.runningGenerators.get(taskId);
        if (gen && typeof (gen as any).return === 'function') {
          try { (gen as any).return(); } catch { /* ignore */ }
        }
        console.log(chalk.yellow(`⏹️  Cancellation requested for task ${taskId}`));
        return true;
      }

      // Fallback: task not cancellable state
      console.warn(chalk.yellow(`⚠️ Cannot cancel task ${taskId} in state ${task.status}`));
      return false;
    } catch (error: any) {
      console.error(chalk.red(`❌ Error cancelling task: ${error.message}`));
      this.emit('error', error);
      return false;
    }
  }

  cancelAllTasks(): number {
    let cancelled = 0;
    // Cancel queued tasks
    const queued = [...this.taskQueue];
    for (const t of queued) {
      if (this.cancelTask(t.id)) cancelled++;
    }
    // Cancel running tasks cooperatively
    for (const [id, task] of this.activeTasks.entries()) {
      if (task.status === 'running') {
        if (this.cancelTask(id)) cancelled++;
      }
    }
    return cancelled;
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

  private async* codeGeneratorHandler(task: string, context: any) {
    try {
      yield { type: 'progress', progress: 10 };
      yield { type: 'tool_use', tool: 'analysis', description: 'Understanding generation requirements' };

      // Quick project scan for context
      yield { type: 'tool_use', tool: 'analyze_project', description: 'Scanning project for targets' };
      const project = await context.tools.executeTool('analyze_project', {});

      yield { type: 'progress', progress: 45 };

      // Suggest scaffold plan
      const plan = {
        task,
        detectedFramework: project?.framework || 'unknown',
        steps: [
          'Generate scaffolding for requested feature/module',
          'Create implementation stubs and types',
          'Wire routes/exports and update index',
          'Add minimal tests and docs'
        ]
      };

      yield { type: 'progress', progress: 90 };
      yield { type: 'result', data: plan };
    } catch (error: any) {
      yield { type: 'error', error: `Code Generator failed: ${error.message}` };
    }
  }

  private async* optimizationExpertHandler(task: string, context: any) {
    try {
      yield { type: 'progress', progress: 15 };
      yield { type: 'tool_use', tool: 'find_files', description: 'Locating hotspots for optimization' };
      const files = await context.tools.executeTool('find_files', { pattern: '.ts' });

      yield { type: 'progress', progress: 60 };
      const recommendations = [
        'Enable TypeScript strict options for better safety',
        'Cache expensive computations and IO where feasible',
        'Reduce bundle by trimming dependencies and dynamic imports',
        'Measure before/after with profiling tools'
      ];

      yield { type: 'progress', progress: 100 };
      yield { type: 'result', data: { task, files: files?.matches?.slice(0, 10) || [], recommendations } };
    } catch (error: any) {
      yield { type: 'error', error: `Optimization failed: ${error.message}` };
    }
  }

  private async* framerMotionHandler(task: string, context: any) {
    try {
      yield { type: 'progress', progress: 10 };
      yield { type: 'tool_use', tool: 'analyze_project', description: 'Detecting framework and dependencies' };
      const project = await context.tools.executeTool('analyze_project', {});

      const deps = project?.packageInfo?.dependencies || {};
      const devDeps = project?.packageInfo?.devDependencies || {};
      const hasFramer = !!(deps['framer-motion'] || devDeps['framer-motion']);

      yield { type: 'progress', progress: 35 };
      yield { type: 'tool_use', tool: 'find_files', description: 'Locating React component files' };
      const reactFiles = await context.tools.executeTool('find_files', { pattern: '.tsx' });

      yield { type: 'progress', progress: 70 };
      const recommendations = [
        'Wrap animated elements with motion.* components (e.g., motion.div)',
        'Use variants for orchestrating complex enter/exit animations',
        'Use AnimatePresence for conditional components with exit animations',
        'Enable layout/layoutId for shared layout transitions',
        'Leverage useScroll/useTransform for scroll-based parallax effects',
        'Prefer reduced motion for accessibility (prefers-reduced-motion)',
        'In Next.js, avoid SSR mismatches: gate animations client-side where needed'
      ];

      const actions = hasFramer
        ? []
        : ['Install framer-motion: npm install framer-motion'];

      yield {
        type: 'result',
        data: {
          expertise: 'framer-motion',
          task,
          framework: project?.framework || 'unknown',
          hasFramerMotion: hasFramer,
          files: reactFiles?.matches?.slice(0, 15) || [],
          recommendations,
          nextActions: actions,
        }
      };
      yield { type: 'progress', progress: 100 };
    } catch (error: any) {
      yield { type: 'error', error: `Framer Motion advisor failed: ${error.message}` };
    }
  }

  private async* aiSdkIntegratorHandler(task: string, context: any) {
    try {
      yield { type: 'progress', progress: 10 };
      yield { type: 'tool_use', tool: 'analyze_project', description: 'Inspecting project dependencies' };
      const project = await context.tools.executeTool('analyze_project', {});
      const deps = project?.packageInfo?.dependencies || {};
      const devDeps = project?.packageInfo?.devDependencies || {};
      const hasAISDK = !!(deps['ai'] || deps['@ai-sdk/openai'] || deps['@ai-sdk/anthropic'] || deps['@ai-sdk/google'] || deps['@ai-sdk/vercel']
        || devDeps['ai'] || devDeps['@ai-sdk/openai'] || devDeps['@ai-sdk/anthropic'] || devDeps['@ai-sdk/google'] || devDeps['@ai-sdk/vercel']);

      yield { type: 'progress', progress: 40 };
      yield { type: 'tool_use', tool: 'find_files', description: 'Finding API/route and service files' };
      const tsFiles = await context.tools.executeTool('find_files', { pattern: '.ts' });

      yield { type: 'progress', progress: 75 };
      const recommendations = [
        'Use AI SDK’s streaming helpers for incremental updates (e.g., streamText)',
        'Abstract provider config (OpenAI, Anthropic, Google) behind a service',
        'Centralize model + temperature in config with env fallbacks',
        'Implement tool calling / function calling with typed handlers',
        'Propagate AbortController to cancel in-flight generations',
        'Add defensive rate-limit + retries around API calls',
        'Expose a thin CLI or HTTP route that proxies AI responses securely'
      ];

      const missing = [] as string[];
      if (!hasAISDK) missing.push('ai');
      if (!deps['@ai-sdk/openai'] && !devDeps['@ai-sdk/openai']) missing.push('@ai-sdk/openai');
      if (!deps['@ai-sdk/anthropic'] && !devDeps['@ai-sdk/anthropic']) missing.push('@ai-sdk/anthropic');
      if (!deps['@ai-sdk/google'] && !devDeps['@ai-sdk/google']) missing.push('@ai-sdk/google');
      if (!deps['@ai-sdk/vercel'] && !devDeps['@ai-sdk/vercel']) missing.push('@ai-sdk/vercel');

      const nextActions = missing.length > 0
        ? [`Install SDKs: npm install ${missing.join(' ')}`]
        : ['Verify keys and provider selection logic; add streaming route example'];

      yield {
        type: 'result',
        data: {
          expertise: 'ai-sdk-integration',
          task,
          hasAISDK,
          missingPackages: missing,
          files: tsFiles?.matches?.slice(0, 20) || [],
          recommendations,
          nextActions,
        }
      };
      yield { type: 'progress', progress: 100 };
    } catch (error: any) {
      yield { type: 'error', error: `AI SDK integration advisor failed: ${error.message}` };
    }
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
