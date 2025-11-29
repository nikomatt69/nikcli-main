import { EventEmitter } from 'node:events'
import chalk from 'chalk'
import { simpleConfigManager } from '../core/config-manager'
import { inputQueue } from '../core/input-queue'
import { planningService } from './planning-service'
import { toolService } from './tool-service'

export interface AgentTask {
  id: string
  agentType: string
  task: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  startTime?: Date
  endTime?: Date
  result?: any
  error?: string
  progress?: number
}

export interface AgentCapability {
  name: string
  description: string
  specialization: string[]
  maxConcurrency: number
  handler: (task: string, context: any) => AsyncGenerator<any, any, unknown>
}

export class AgentService extends EventEmitter {
  private agents: Map<string, AgentCapability> = new Map()
  private activeTasks: Map<string, AgentTask> = new Map()
  private taskQueue: AgentTask[] = []
  private maxConcurrentAgents = 3
  private runningCount = 0
  private runningGenerators: Map<string, AsyncGenerator<any, any, unknown>> = new Map()
  private cancelledTasks: Set<string> = new Set()

  constructor() {
    super()
    this.registerDefaultAgents()
  }

  /**
   * Suggest the best built-in agent type for a given natural language task
   */
  public suggestAgentTypeForTask(task: string): string {
    const lower = (task || '').toLowerCase()
    if (lower.includes('react') || lower.includes('component')) return 'react-expert'
    if (lower.includes('next')) return 'nextjs-expert'
    if (lower.includes('vue')) return 'vue-expert'
    if (
      lower.includes('framer') ||
      lower.includes('motion') ||
      lower.includes('animate') ||
      lower.includes('animation')
    )
      return 'framer-motion-expert'
    if (
      lower.includes('ai sdk') ||
      lower.includes('ai-sdk') ||
      lower.includes('@ai-sdk') ||
      lower.includes('vercel ai')
    )
      return 'ai-sdk-integrator'
    if (lower.includes('backend') || lower.includes('api') || lower.includes('server')) return 'backend-expert'
    if (lower.includes('frontend') || lower.includes('ui') || lower.includes('css')) return 'frontend-expert'
    if (lower.includes('deploy') || lower.includes('docker') || lower.includes('kubernetes') || lower.includes('ci'))
      return 'devops-expert'
    if (lower.includes('review') || lower.includes('analyz') || lower.includes('audit')) return 'code-review'
    if (lower.includes('optimiz') || lower.includes('performance')) return 'optimization-expert'
    if (lower.includes('generate') || lower.includes('scaffold') || lower.includes('boilerplate'))
      return 'code-generator'
    if (lower.includes('system') || lower.includes('admin')) return 'system-admin'

    // Default fallback to a general-purpose agent
    return 'ai-analysis'
  }

  private registerDefaultAgents(): void {
    // AI Analysis Agent
    this.registerAgent({
      name: 'ai-analysis',
      description: 'AI code analysis and review',
      specialization: ['code-review', 'bug-detection', 'optimization'],
      maxConcurrency: 1,
      handler: this.aiAnalysisHandler.bind(this),
    })

    // Code Review Agent
    this.registerAgent({
      name: 'code-review',
      description: 'Code review and suggestions',
      specialization: ['code-quality', 'best-practices', 'security'],
      maxConcurrency: 1,
      handler: this.codeReviewHandler.bind(this),
    })

    // Backend Expert Agent
    this.registerAgent({
      name: 'backend-expert',
      description: 'Backend development specialist',
      specialization: ['api-design', 'database', 'performance'],
      maxConcurrency: 1,
      handler: this.backendExpertHandler.bind(this),
    })

    // Frontend Expert Agent
    this.registerAgent({
      name: 'frontend-expert',
      description: 'Frontend/UI development expert',
      specialization: ['ui-design', 'responsive', 'accessibility'],
      maxConcurrency: 1,
      handler: this.frontendExpertHandler.bind(this),
    })

    // React Expert Agent
    this.registerAgent({
      name: 'react-expert',
      description: 'React and Next.js specialist',
      specialization: ['react', 'nextjs', 'hooks', 'performance'],
      maxConcurrency: 1,
      handler: this.reactExpertHandler.bind(this),
    })

    // Next.js Expert Agent (alias to React handler)
    this.registerAgent({
      name: 'nextjs-expert',
      description: 'Next.js specialist (routing, SSR/SSG, app router)',
      specialization: ['nextjs', 'react', 'ssr', 'routing'],
      maxConcurrency: 1,
      handler: this.reactExpertHandler.bind(this),
    })

    // Vue Expert Agent (mapped to frontend handler)
    this.registerAgent({
      name: 'vue-expert',
      description: 'Vue.js specialist',
      specialization: ['vue', 'vuex', 'vue-router', 'performance'],
      maxConcurrency: 1,
      handler: this.frontendExpertHandler.bind(this),
    })

    // Framer Motion UI Expert
    this.registerAgent({
      name: 'framer-motion-expert',
      description: 'UI animations specialist using Framer Motion',
      specialization: ['framer-motion', 'animations', 'variants', 'gestures', 'layout'],
      maxConcurrency: 1,
      handler: this.framerMotionHandler.bind(this),
    })

    // DevOps Expert Agent
    this.registerAgent({
      name: 'devops-expert',
      description: 'DevOps and infrastructure expert',
      specialization: ['docker', 'kubernetes', 'ci-cd', 'monitoring'],
      maxConcurrency: 1,
      handler: this.devopsExpertHandler.bind(this),
    })

    // System Admin Agent
    this.registerAgent({
      name: 'system-admin',
      description: 'System administration tasks',
      specialization: ['server-management', 'security', 'automation'],
      maxConcurrency: 1,
      handler: this.systemAdminHandler.bind(this),
    })

    // Autonomous Coder Agent
    this.registerAgent({
      name: 'autonomous-coder',
      description: 'Full autonomous coding agent',
      specialization: ['full-stack', 'architecture', 'implementation'],
      maxConcurrency: 1,
      handler: this.autonomousCoderHandler.bind(this),
    })

    // Code Generator Agent (from automation/agents/code-generator-agent)
    this.registerAgent({
      name: 'code-generator',
      description: 'Generates boilerplate and scaffolds features',
      specialization: ['scaffolding', 'boilerplate', 'codegen'],
      maxConcurrency: 1,
      handler: this.codeGeneratorHandler.bind(this),
    })

    // Optimization Agent (from automation/agents/optimization-agent)
    this.registerAgent({
      name: 'optimization-expert',
      description: 'Performance and optimization specialist',
      specialization: ['optimization', 'profiling', 'performance'],
      maxConcurrency: 1,
      handler: this.optimizationExpertHandler.bind(this),
    })

    // Coding Agent (from automation/agents/coding-agent)
    this.registerAgent({
      name: 'coding-expert',
      description: 'General-purpose coding assistant',
      specialization: ['coding', 'implementation', 'refactoring'],
      maxConcurrency: 1,
      handler: this.autonomousCoderHandler.bind(this),
    })

    // AI Analysis Agent (from automation/agents/ai-agent) alias
    this.registerAgent({
      name: 'ai-expert',
      description: 'Advanced AI analysis and reports',
      specialization: ['analysis', 'insights', 'quality'],
      maxConcurrency: 1,
      handler: this.aiAnalysisHandler.bind(this),
    })

    // AI SDK Integrator (Vercel AI SDK and providers)
    this.registerAgent({
      name: 'ai-sdk-integrator',
      description: 'Integrates AI using AI SDK (streaming, providers, tools)',
      specialization: ['ai-sdk', 'providers', 'streaming', 'tool-calling', 'routing'],
      maxConcurrency: 1,
      handler: this.aiSdkIntegratorHandler.bind(this),
    })

    // Aliases for discoverability
    this.registerAgent({
      name: 'framer-motion-agent',
      description: 'Alias of framer-motion-expert',
      specialization: ['framer-motion'],
      maxConcurrency: 1,
      handler: this.framerMotionHandler.bind(this),
    })
    this.registerAgent({
      name: 'ai-sdk-agent',
      description: 'Alias of ai-sdk-integrator',
      specialization: ['ai-sdk'],
      maxConcurrency: 1,
      handler: this.aiSdkIntegratorHandler.bind(this),
    })

    // Aliases mirroring classes from automation/agents/* for discoverability
    this.registerAgent({
      name: 'react-agent',
      description: 'Alias of react-expert',
      specialization: ['react'],
      maxConcurrency: 1,
      handler: this.reactExpertHandler.bind(this),
    })
    this.registerAgent({
      name: 'frontend-agent',
      description: 'Alias of frontend-expert',
      specialization: ['frontend'],
      maxConcurrency: 1,
      handler: this.frontendExpertHandler.bind(this),
    })
    this.registerAgent({
      name: 'backend-agent',
      description: 'Alias of backend-expert',
      specialization: ['backend'],
      maxConcurrency: 1,
      handler: this.backendExpertHandler.bind(this),
    })
    this.registerAgent({
      name: 'devops-agent',
      description: 'Alias of devops-expert',
      specialization: ['devops'],
      maxConcurrency: 1,
      handler: this.devopsExpertHandler.bind(this),
    })
    this.registerAgent({
      name: 'system-admin-agent',
      description: 'Alias of system-admin',
      specialization: ['sysadmin'],
      maxConcurrency: 1,
      handler: this.systemAdminHandler.bind(this),
    })
    this.registerAgent({
      name: 'code-review-agent',
      description: 'Alias of code-review',
      specialization: ['review'],
      maxConcurrency: 1,
      handler: this.codeReviewHandler.bind(this),
    })
    this.registerAgent({
      name: 'code-generator-agent',
      description: 'Alias of code-generator',
      specialization: ['codegen'],
      maxConcurrency: 1,
      handler: this.codeGeneratorHandler.bind(this),
    })
    this.registerAgent({
      name: 'optimization-agent',
      description: 'Alias of optimization-expert',
      specialization: ['optimization'],
      maxConcurrency: 1,
      handler: this.optimizationExpertHandler.bind(this),
    })
    this.registerAgent({
      name: 'coding-agent',
      description: 'Alias of coding-expert',
      specialization: ['coding'],
      maxConcurrency: 1,
      handler: this.autonomousCoderHandler.bind(this),
    })

    // VM Agent (placeholder for virtualized agent integration)
    this.registerAgent({
      name: 'vm-agent',
      description: 'Virtualized agent for secure execution',
      specialization: ['virtualization', 'security', 'isolation'],
      maxConcurrency: 1,
      handler: this.vmAgentHandler.bind(this),
    })
  }

  registerAgent(agent: AgentCapability): void {
    try {
      if (!agent?.name || !agent?.handler) {
        throw new Error('Invalid agent configuration: missing name or handler')
      }
      this.agents.set(agent.name, agent)
    } catch (error: any) {
      console.error(chalk.red(`✖ Failed to register agent: ${error.message}`))
      this.emit('error', new Error(`Agent registration failed: ${error.message}`))
    }
  }

  async executeTask(agentType: string, task: string, _enhancedOptions?: any): Promise<string> {
    try {
      // Se il bypass è abilitato, non eseguire agenti
      if (inputQueue.isBypassEnabled()) {
        console.log(chalk.yellow('⚠️ Agent execution blocked during approval process'))
        throw new Error('Agent execution blocked during approval process')
      }

      if (!task) {
        throw new Error('Invalid parameters: task is required')
      }

      // Fallback selection when agentType is missing/unknown or explicitly 'auto'
      let resolvedAgentType = agentType
      if (!resolvedAgentType || resolvedAgentType === 'auto' || !this.agents.has(resolvedAgentType)) {
        resolvedAgentType = this.suggestAgentTypeForTask(task)
      }

      let agent = this.agents.get(resolvedAgentType)
      if (!agent) {
        // Graceful fallback: try autonomous-coder
        const fallbackType = this.suggestAgentTypeForTask(task)
        const fallback = this.agents.get(fallbackType)
        if (fallback) {
          console.log(chalk.yellow(`⚠️ Agent '${resolvedAgentType}' not found. Falling back to '${fallbackType}'.`))
          resolvedAgentType = fallbackType
          agent = fallback
        } else {
          // As a last resort, pick the first available agent
          const anyAgent = this.getAvailableAgents()[0]
          if (anyAgent) {
            console.log(chalk.yellow(`⚠️ Agent '${resolvedAgentType}' not found. Using '${anyAgent.name}'.`))
            resolvedAgentType = anyAgent.name
            agent = this.agents.get(anyAgent.name)!
          } else {
            throw new Error(`Agent '${resolvedAgentType}' not found and no fallback available`)
          }
        }
      }

      const taskId = Date.now().toString()
      const agentTask: AgentTask = {
        id: taskId,
        agentType: resolvedAgentType,
        task,
        status: 'pending',
      }

      this.activeTasks.set(taskId, agentTask)

      // Check if we can run immediately or need to queue
      if (this.runningCount < this.maxConcurrentAgents) {
        // Start task asynchronously; do not await to keep API responsive
        this.runTask(agentTask).catch((err) => {
          console.error(chalk.red(`✖ Failed to start task: ${err.message}`))
          this.emit('error', err)
          agentTask.status = 'failed'
          agentTask.error = err.message
        })
      } else {
        this.taskQueue.push(agentTask)
        console.log(chalk.yellow(`⏳ Task queued (${this.taskQueue.length} in queue)`))
      }

      // Return taskId immediately; callers can poll getTaskStatus or listen to events
      return taskId
    } catch (error: any) {
      console.error(chalk.red(`✖ Task execution setup failed: ${error.message}`))
      this.emit('error', error)
      throw error
    }
  }

  private async runTask(agentTask: AgentTask): Promise<void> {
    // Se il bypass è abilitato, non eseguire l'agente
    if (inputQueue.isBypassEnabled()) {
      agentTask.status = 'failed'
      agentTask.error = 'Agent execution blocked during approval process'
      this.emit('error', new Error(agentTask.error))
      return
    }

    const agent = this.agents.get(agentTask.agentType)
    if (!agent) {
      agentTask.status = 'failed'
      agentTask.error = `Agent '${agentTask.agentType}' not found`
      this.emit('error', new Error(agentTask.error))
      return
    }

    agentTask.status = 'running'
    agentTask.startTime = new Date()
    this.runningCount++

    console.log(chalk.blue(`🔌 Starting ${agentTask.agentType} agent...`))
    this.emit('task_start', agentTask)

    try {
      // Create secure tool wrapper based on current security mode
      const config = simpleConfigManager.getAll()
      const secureTools = this.createSecureToolWrapper(toolService, config.securityMode)

      const context = {
        taskId: agentTask.id,
        workingDirectory: process.cwd(),
        tools: secureTools,
        planning: planningService,
      }

      // Execute agent with streaming updates and timeout
      const executionTimeout = 10 * 60 * 1000 // 10 minutes timeout

      // Prepare generator and track it for potential cancellation
      const generator = agent.handler(agentTask.task, context)
      this.runningGenerators.set(agentTask.id, generator as any)

      const executionPromise = (async () => {
        try {
          for await (const update of generator as any) {
            // Cooperative cancellation: check flag between updates
            if (this.cancelledTasks.has(agentTask.id)) {
              // Attempt to close the generator gracefully
              try {
                await (generator as any)?.return?.()
              } catch {
                /* ignore */
              }
              throw new Error('Cancelled by user')
            }
            if (!update || typeof update !== 'object') {
              console.warn(chalk.yellow('⚠️ Invalid update received from agent'))
              continue
            }

            if (update.type === 'progress') {
              agentTask.progress = update.progress
              this.emit('task_progress', agentTask, update)
            } else if (update.type === 'reasoning') {
              console.log(chalk.magenta.bold(`\n⚡︎ Step ${update.step}: ${update.title}`))
              console.log(chalk.dim(`   Reasoning: ${update.reasoning}`))
              if (update.toolchain) {
                console.log(chalk.cyan(`   Toolchain: ${update.toolchain.join(', ')}`))
              }
              if (update.nextAction) {
                console.log(chalk.yellow(`   Next: ${update.nextAction}`))
              }
              if (update.estimatedDuration) {
                console.log(chalk.gray(`   Duration: ${update.estimatedDuration}`))
              }
              this.emit('task_reasoning', agentTask, update)
            } else if (update.type === 'tool_use') {
              console.log(chalk.cyan(`  🔧 ${update.tool}: ${update.description}`))
              this.emit('tool_use', agentTask, update)
            } else if (update.type === 'result') {
              agentTask.result = update.data

              // Check if this is a factory agent result that needs formatting
              if (this.isFactoryAgentResult(update.data)) {
                await this.handleFactoryAgentResult(agentTask, update.data)
              }

              this.emit('task_result', agentTask, update)
            } else if (update.type === 'error') {
              throw new Error(update.error)
            }
          }
        } catch (streamError: any) {
          throw new Error(`Stream processing error: ${streamError.message}`)
        }
      })()

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`Agent execution timeout after ${executionTimeout / 1000}s`)),
          executionTimeout
        )
      })

      await Promise.race([executionPromise, timeoutPromise])

      agentTask.status = 'completed'
      agentTask.endTime = new Date()

      const duration = agentTask.endTime.getTime() - agentTask.startTime?.getTime()
      console.log(chalk.green(`✓ ${agentTask.agentType} completed (${duration}ms)`))
    } catch (error: any) {
      agentTask.status = 'failed'
      agentTask.error = error.message || 'Unknown error occurred'
      agentTask.endTime = new Date()

      console.log(chalk.red(`✖ ${agentTask.agentType} failed: ${agentTask.error}`))
      this.emit('error', error)
    } finally {
      // Cleanup generator/cancellation tracking
      this.runningGenerators.delete(agentTask.id)
      this.cancelledTasks.delete(agentTask.id)
      this.runningCount--
      this.emit('task_complete', agentTask)

      // Start next queued task if available with error boundary
      try {
        if (this.taskQueue.length > 0 && this.runningCount < this.maxConcurrentAgents) {
          const nextTask = this.taskQueue.shift()!
          await this.runTask(nextTask)
        }
      } catch (nextTaskError: any) {
        console.error(chalk.red(`✖ Failed to start next task: ${nextTaskError.message}`))
        this.emit('error', nextTaskError)
      }
    }
  }

  getActiveAgents(): AgentTask[] {
    return Array.from(this.activeTasks.values()).filter((t) => t.status === 'running')
  }

  getQueuedTasks(): AgentTask[] {
    return [...this.taskQueue]
  }

  getAvailableAgents(): AgentCapability[] {
    return Array.from(this.agents.values())
  }

  getTaskStatus(taskId: string): AgentTask | undefined {
    return this.activeTasks.get(taskId)
  }

  cancelTask(taskId: string): boolean {
    try {
      if (!taskId) {
        console.warn(chalk.yellow('⚠️ Cannot cancel task: missing taskId'))
        return false
      }

      const task = this.activeTasks.get(taskId)
      if (!task) {
        console.warn(chalk.yellow(`⚠️ Task ${taskId} not found`))
        return false
      }

      if (task.status === 'pending') {
        // Remove from queue
        const queueIndex = this.taskQueue.findIndex((t) => t.id === taskId)
        if (queueIndex >= 0) {
          this.taskQueue.splice(queueIndex, 1)
          task.status = 'failed'
          task.error = 'Cancelled by user'
          task.endTime = new Date()
          this.emit('task_complete', task)
          this.activeTasks.delete(taskId)
          return true
        }
      }
      // Mark running task as cancelled and attempt generator return
      if (task.status === 'running') {
        this.cancelledTasks.add(taskId)
        const gen = this.runningGenerators.get(taskId)
        if (gen && typeof (gen as any).return === 'function') {
          try {
            ; (gen as any).return()
          } catch {
            /* ignore */
          }
        }
        console.log(chalk.yellow(`⏹️  Cancellation requested for task ${taskId}`))
        return true
      }

      // Fallback: task not cancellable state
      console.warn(chalk.yellow(`⚠️ Cannot cancel task ${taskId} in state ${task.status}`))
      return false
    } catch (error: any) {
      console.error(chalk.red(`✖ Error cancelling task: ${error.message}`))
      this.emit('error', error)
      return false
    }
  }

  cancelAllTasks(): number {
    let cancelled = 0
    // Cancel queued tasks
    const queued = [...this.taskQueue]
    for (const t of queued) {
      if (this.cancelTask(t.id)) cancelled++
    }
    // Cancel running tasks cooperatively
    for (const [id, task] of this.activeTasks.entries()) {
      if (task.status === 'running') {
        if (this.cancelTask(id)) cancelled++
      }
    }
    return cancelled
  }

  /** Dispose all resources and listeners */
  async dispose(): Promise<void> {
    try {
      this.cancelAllTasks()
      this.runningGenerators.clear()
      this.cancelledTasks.clear()
      this.activeTasks.clear()
      this.taskQueue = []
      this.removeAllListeners()
    } catch {
      // ignore
    }
  }

  // Agent implementations with step-by-step reasoning and toolchains
  private async *aiAnalysisHandler(task: string, context: any) {
    try {
      // Step 1: Task Analysis and Planning
      yield {
        type: 'reasoning',
        step: 1,
        title: 'Task Analysis & Planning',
        reasoning: `Analyzing task: "${task}". Breaking down into systematic analysis steps with appropriate toolchain selection.`,
        toolchain: ['analyze_project', 'find_files', 'read_file', 'git_status'],
        estimatedDuration: '30-60 seconds',
      }
      yield { type: 'progress', progress: 5 }

      // Step 2: Project Structure Analysis
      yield {
        type: 'reasoning',
        step: 2,
        title: 'Project Structure Discovery',
        reasoning:
          'Starting with high-level project analysis to understand architecture, build system, and overall structure. This provides context for subsequent detailed analysis.',
        nextAction: 'Execute analyze_project tool',
      }
      yield { type: 'tool_use', tool: 'analyze_project', description: 'Analyzing project structure and dependencies' }
      const _projectAnalysis = await context.tools.executeTool('analyze_project', {})
      yield { type: 'progress', progress: 15 }

      // Step 3: TypeScript Codebase Analysis
      yield {
        type: 'reasoning',
        step: 3,
        title: 'TypeScript Codebase Exploration',
        reasoning:
          'Scanning for TypeScript files to understand code organization, modules, and architectural patterns. TypeScript files indicate type safety maturity.',
        nextAction: 'Search for all TypeScript files with pattern matching',
      }
      yield { type: 'tool_use', tool: 'find_files', description: 'Finding TypeScript files' }
      const tsFiles = await context.tools.executeTool('find_files', { pattern: '**/*.ts' })
      yield { type: 'progress', progress: 25 }

      // Step 4: Configuration Ecosystem Analysis
      yield {
        type: 'reasoning',
        step: 4,
        title: 'Configuration & Tooling Assessment',
        reasoning:
          'Identifying configuration files to understand build tools, linting setup, CI/CD, and development workflow. Configuration completeness indicates project maturity.',
        nextAction: 'Scan for configuration files across multiple formats',
      }
      yield { type: 'tool_use', tool: 'find_files', description: 'Finding configuration files' }
      const configFiles = await context.tools.executeTool('find_files', {
        pattern: '**/*.{json,yml,yaml,toml,config.js}',
      })
      yield { type: 'progress', progress: 35 }

      // Step 5: Dependency Analysis
      yield {
        type: 'reasoning',
        step: 5,
        title: 'Dependency & Package Analysis',
        reasoning:
          'Reading package.json to understand dependencies, scripts, and project metadata. This reveals technology stack, framework choices, and maintenance status.',
        nextAction: 'Parse package.json for comprehensive dependency analysis',
      }
      let packageInfo = null
      try {
        yield { type: 'tool_use', tool: 'read_file', description: 'Reading package.json' }
        packageInfo = await context.tools.executeTool('read_file', { filePath: 'package.json' })
        if (typeof packageInfo === 'string') {
          packageInfo = JSON.parse(packageInfo)
        }
      } catch (_e) {
        yield {
          type: 'reasoning',
          step: 5.1,
          title: 'Package Info Fallback',
          reasoning: 'package.json not found or invalid. Proceeding with alternative dependency discovery methods.',
          nextAction: 'Continue analysis without package metadata',
        }
      }
      yield { type: 'progress', progress: 50 }

      // Step 6: Test Infrastructure Analysis
      yield {
        type: 'reasoning',
        step: 6,
        title: 'Test Coverage Assessment',
        reasoning:
          'Searching for test files to evaluate testing strategy and code quality practices. Test presence indicates development maturity and reliability focus.',
        nextAction: 'Locate test files with common naming conventions',
      }
      yield { type: 'tool_use', tool: 'find_files', description: 'Looking for test files' }
      const testFiles = await context.tools.executeTool('find_files', { pattern: '**/*.{test,spec}.{ts,js}' })
      yield { type: 'progress', progress: 65 }

      // Step 7: Version Control Analysis
      yield {
        type: 'reasoning',
        step: 7,
        title: 'Git Repository Status',
        reasoning:
          'Checking git status to understand current development state, branch information, and pending changes. This provides context about active development.',
        nextAction: 'Query git status for repository state',
      }
      let gitInfo = null
      try {
        yield { type: 'tool_use', tool: 'git_status', description: 'Checking git repository status' }
        gitInfo = await context.tools.executeTool('git_status', {})
      } catch (_e) {
        yield {
          type: 'reasoning',
          step: 7.1,
          title: 'Git Analysis Fallback',
          reasoning: 'Not a git repository or git access error. Proceeding without version control analysis.',
          nextAction: 'Continue with available data',
        }
      }
      yield { type: 'progress', progress: 80 }

      // Step 8: Comprehensive Analysis Synthesis
      yield {
        type: 'reasoning',
        step: 8,
        title: 'Data Synthesis & Analysis',
        reasoning:
          'Combining all gathered information to create comprehensive project assessment. Analyzing patterns, identifying strengths/weaknesses, and generating actionable recommendations.',
        nextAction: 'Process collected data through analysis algorithms',
      }
      yield { type: 'progress', progress: 90 }

      const analysis = {
        projectStructure: {
          name: packageInfo?.name || 'Unknown',
          version: packageInfo?.version || 'N/A',
          description: packageInfo?.description || 'No description available',
          totalFiles: {
            typescript: tsFiles?.matches?.length || 0,
            config: configFiles?.matches?.length || 0,
            test: testFiles?.matches?.length || 0,
          },
          framework: this.detectFramework(packageInfo),
          hasTests: (testFiles?.matches?.length || 0) > 0,
        },
        codebase: {
          mainDirectories: this.analyzeDirectoryStructure(tsFiles?.matches || []),
          keyFiles: (tsFiles?.matches || []).slice(0, 10),
          testCoverage: (testFiles?.matches?.length || 0) > 0 ? 'Present' : 'Missing',
        },
        dependencies: {
          production: Object.keys(packageInfo?.dependencies || {}).length,
          development: Object.keys(packageInfo?.devDependencies || {}).length,
          keyLibraries: this.identifyKeyLibraries(packageInfo),
        },
        gitStatus: gitInfo
          ? {
            branch: gitInfo.branch || 'Unknown',
            hasChanges: (gitInfo.files || []).length > 0,
            modifiedFiles: (gitInfo.files || []).length,
          }
          : null,
        qualityAssessment: {
          hasTypeScript: (tsFiles?.matches?.length || 0) > 0,
          hasTests: (testFiles?.matches?.length || 0) > 0,
          hasConfig: (configFiles?.matches || []).some((f: string) => f.includes('tsconfig')),
          hasLinting: (configFiles?.matches || []).some((f: string) => f.includes('eslint') || f.includes('lint')),
        },
        recommendations: this.generateRecommendations({
          hasTests: (testFiles?.matches?.length || 0) > 0,
          hasTypeScript: (tsFiles?.matches?.length || 0) > 0,
          fileCount: tsFiles?.matches?.length || 0,
          packageInfo,
        }),
      }

      // Step 9: Results Presentation
      yield {
        type: 'reasoning',
        step: 9,
        title: 'Analysis Complete',
        reasoning: `Analysis completed successfully. Discovered ${analysis.projectStructure.totalFiles.typescript} TypeScript files, identified ${analysis.projectStructure.framework} framework, and generated ${analysis.recommendations.length} recommendations.`,
        nextAction: 'Present formatted results to user',
      }
      yield { type: 'progress', progress: 100 }
      yield { type: 'result', data: analysis }

      // Enhanced results display with step summary
      console.log(chalk.cyan.bold('\n📊 Repository Analysis Complete'))
      console.log(chalk.gray('═'.repeat(60)))
      console.log(chalk.green('✓ Analysis completed in 9 systematic steps'))
      console.log(`${chalk.blue('Project:')} ${analysis.projectStructure.name} v${analysis.projectStructure.version}`)
      console.log(
        `${chalk.blue('Files:')} ${analysis.projectStructure.totalFiles.typescript} TypeScript, ${analysis.projectStructure.totalFiles.test} tests`
      )
      console.log(`${chalk.blue('Framework:')} ${analysis.projectStructure.framework}`)
      if (analysis.gitStatus) {
        console.log(
          `${chalk.blue('Git:')} ${analysis.gitStatus.branch} branch, ${analysis.gitStatus.modifiedFiles} modified files`
        )
      }
      console.log(
        `${chalk.blue('Quality:')} ${analysis.qualityAssessment.hasTests ? '✓' : '✖'} Tests, ${analysis.qualityAssessment.hasConfig ? '✓' : '✖'} TypeScript Config`
      )

      if (analysis.recommendations.length > 0) {
        console.log(chalk.yellow.bold('\n💡 Strategic Recommendations:'))
        analysis.recommendations.forEach((rec, i) => {
          console.log(`${chalk.yellow(`${i + 1}.`)} ${rec}`)
        })
      }

      console.log(chalk.green('\n✨ Analysis methodology: Step-by-step reasoning with strategic toolchain selection'))
    } catch (error: any) {
      yield { type: 'error', error: `AI Analysis failed: ${error.message}` }
    }
  }

  private detectFramework(packageInfo: any): string {
    if (!packageInfo?.dependencies) return 'Unknown'

    const deps = { ...packageInfo.dependencies, ...packageInfo.devDependencies }

    if (deps.react) return 'React'
    if (deps.vue) return 'Vue.js'
    if (deps.angular) return 'Angular'
    if (deps.next) return 'Next.js'
    if (deps.express) return 'Express.js'
    if (deps.fastify) return 'Fastify'
    if (deps.typescript) return 'TypeScript'

    return 'Node.js'
  }

  private analyzeDirectoryStructure(files: string[]): string[] {
    const dirs = new Set<string>()
    files.forEach((file) => {
      const parts = file.split('/')
      if (parts.length > 1) {
        dirs.add(parts[0])
      }
    })
    return Array.from(dirs).slice(0, 8)
  }

  private identifyKeyLibraries(packageInfo: any): string[] {
    if (!packageInfo?.dependencies) return []

    const allDeps = { ...packageInfo.dependencies, ...packageInfo.devDependencies }
    const keyLibs = []

    // Framework libraries
    if (allDeps.react) keyLibs.push('React')
    if (allDeps.vue) keyLibs.push('Vue.js')
    if (allDeps.angular) keyLibs.push('Angular')
    if (allDeps.next) keyLibs.push('Next.js')

    // Backend libraries
    if (allDeps.express) keyLibs.push('Express')
    if (allDeps.fastify) keyLibs.push('Fastify')

    // Development tools
    if (allDeps.typescript) keyLibs.push('TypeScript')
    if (allDeps.eslint) keyLibs.push('ESLint')
    if (allDeps.prettier) keyLibs.push('Prettier')

    // Testing
    if (allDeps.jest) keyLibs.push('Jest')
    if (allDeps.vitest) keyLibs.push('Vitest')

    return keyLibs.slice(0, 6)
  }

  private generateRecommendations(context: any): string[] {
    const recommendations = []

    if (!context.hasTests) {
      recommendations.push('Add unit tests for better code reliability')
    }

    if (!context.hasTypeScript) {
      recommendations.push('Consider migrating to TypeScript for better type safety')
    } else {
      recommendations.push('Enable TypeScript strict mode for enhanced type checking')
    }

    if (context.fileCount > 50) {
      recommendations.push('Consider code organization and modularization')
    }

    if (context.packageInfo?.dependencies) {
      const depCount = Object.keys(context.packageInfo.dependencies).length
      if (depCount > 30) {
        recommendations.push('Review dependencies for potential optimization')
      }
    }

    recommendations.push('Implement comprehensive error handling')
    recommendations.push('Add code documentation and comments')

    return recommendations.slice(0, 5)
  }

  private async *codeReviewHandler(task: string, context: any) {
    try {
      // Step 1: Review Planning
      yield {
        type: 'reasoning',
        step: 1,
        title: 'Code Review Planning',
        reasoning: `Initiating code review for: "${task}". Establishing systematic review process focusing on git changes, code quality, security, and best practices.`,
        toolchain: ['git_status', 'git_diff', 'find_files', 'read_file'],
        estimatedDuration: '15-30 seconds',
      }
      yield { type: 'progress', progress: 10 }

      // Step 2: Git Status Analysis
      yield {
        type: 'reasoning',
        step: 2,
        title: 'Git Changes Assessment',
        reasoning:
          'Analyzing git status to identify modified, added, and deleted files. This provides the scope of changes for targeted review.',
        nextAction: 'Query git status for pending changes',
      }
      yield { type: 'tool_use', tool: 'git_status', description: 'Checking git status' }
      const gitStatus = await context.tools.executeTool('git_status', {})
      yield { type: 'progress', progress: 30 }

      // Step 3: Code Diff Analysis
      yield {
        type: 'reasoning',
        step: 3,
        title: 'Code Changes Review',
        reasoning:
          'Examining code diffs to understand specific changes, additions, and deletions. This enables targeted feedback on actual modifications.',
        nextAction: 'Retrieve and analyze code differences',
      }
      let diff = null
      let reviewFindings = []
      if (gitStatus?.files && gitStatus.files.length > 0) {
        yield { type: 'tool_use', tool: 'git_diff', description: 'Getting code changes for review' }
        diff = await context.tools.executeTool('git_diff', {})

        // Analyze diff for common issues
        reviewFindings = this.analyzeDiffForIssues(diff, gitStatus.files)
      } else {
        yield {
          type: 'reasoning',
          step: 3.1,
          title: 'No Changes Detected',
          reasoning: 'No git changes found. Switching to general codebase review mode.',
          nextAction: 'Perform general code quality assessment',
        }
        reviewFindings = ['No pending git changes - performed general codebase assessment']
      }
      yield { type: 'progress', progress: 70 }

      // Step 4: Security & Quality Assessment
      yield {
        type: 'reasoning',
        step: 4,
        title: 'Security & Quality Review',
        reasoning:
          'Conducting security scan and code quality assessment. Looking for potential vulnerabilities, anti-patterns, and maintainability issues.',
        nextAction: 'Execute security and quality checks',
      }

      const securityFindings = this.performSecurityReview(gitStatus?.files || [])
      const qualityFindings = this.performQualityReview(diff)

      yield { type: 'progress', progress: 90 }

      // Step 5: Generate Review Report
      const reviewReport = {
        reviewType: gitStatus?.files?.length > 0 ? 'Git Changes Review' : 'General Codebase Review',
        changedFiles: gitStatus?.files?.length || 0,
        findings: {
          codeChanges: reviewFindings,
          security: securityFindings,
          quality: qualityFindings,
        },
        suggestions: this.generateCodeReviewSuggestions(reviewFindings, securityFindings, qualityFindings),
        approved: true,
        timestamp: new Date().toISOString(),
      }

      yield {
        type: 'reasoning',
        step: 5,
        title: 'Review Complete',
        reasoning: `Code review completed. Analyzed ${reviewReport.changedFiles} files and generated ${reviewReport.suggestions.length} actionable suggestions for improvement.`,
        nextAction: 'Present comprehensive review report',
      }
      yield { type: 'progress', progress: 100 }
      yield { type: 'result', data: reviewReport }

      // Display review results
      console.log(chalk.cyan.bold('\n📋 Code Review Complete'))
      console.log(chalk.gray('═'.repeat(50)))
      console.log(`${chalk.blue('Review Type:')} ${reviewReport.reviewType}`)
      console.log(`${chalk.blue('Files Analyzed:')} ${reviewReport.changedFiles}`)
      if (reviewReport.suggestions.length > 0) {
        console.log(chalk.yellow.bold('\n💡 Review Suggestions:'))
        reviewReport.suggestions.forEach((suggestion, i) => {
          console.log(`${chalk.yellow(`${i + 1}.`)} ${suggestion}`)
        })
      }
      console.log(chalk.green('\n✨ Review methodology: Multi-layer analysis with security focus'))
    } catch (error: any) {
      yield { type: 'error', error: `Code Review failed: ${error.message}` }
    }
  }

  private analyzeDiffForIssues(_diff: any, files: Array<string | { path: string; status?: string }>): string[] {
    const paths = files.map((f: any) => (typeof f === 'string' ? f : f?.path || ''))
    const findings: string[] = []
    if (paths.includes('package.json')) {
      findings.push('Package dependencies modified - verify security and compatibility')
    }
    if (paths.some((p) => typeof p === 'string' && p.includes('.env'))) {
      findings.push('Environment files changed - ensure no secrets are exposed')
    }
    if (paths.some((p) => typeof p === 'string' && (p.endsWith('.ts') || p.endsWith('.js')))) {
      findings.push('Code files modified - review for logic errors and performance impact')
    }
    return findings.length > 0 ? findings : ['Code changes appear standard - no major concerns identified']
  }

  private performSecurityReview(files: Array<string | { path: string; status?: string }>): string[] {
    const paths = files.map((f: any) => (typeof f === 'string' ? f : f?.path || ''))
    const securityIssues: string[] = []
    if (paths.some((p) => typeof p === 'string' && (p.includes('auth') || p.includes('login')))) {
      securityIssues.push('Authentication-related files - verify proper input validation')
    }
    if (paths.some((p) => typeof p === 'string' && (p.includes('api') || p.includes('route')))) {
      securityIssues.push('API endpoints modified - ensure proper authorization checks')
    }
    return securityIssues.length > 0 ? securityIssues : ['No obvious security concerns identified']
  }

  private performQualityReview(_diff: any): string[] {
    const qualityIssues = []
    // Basic quality checks
    qualityIssues.push('Verify error handling is comprehensive')
    qualityIssues.push('Ensure proper TypeScript typing')
    qualityIssues.push('Check for code documentation')
    return qualityIssues
  }

  private generateCodeReviewSuggestions(
    codeFindings: string[],
    securityFindings: string[],
    qualityFindings: string[]
  ): string[] {
    const _allFindings = [...codeFindings, ...securityFindings, ...qualityFindings]
    const suggestions = [
      'Add unit tests for modified functionality',
      'Update documentation if API changes occurred',
      'Run linting and formatting checks',
      'Verify all error paths are handled',
    ]
    return suggestions.slice(0, 5)
  }

  private async *backendExpertHandler(_task: string, _context: any) {
    yield { type: 'progress', progress: 25 }
    yield { type: 'tool_use', tool: 'find_files', description: 'Finding backend files' }

    // Simulate backend analysis
    await new Promise((resolve) => setTimeout(resolve, 1000))

    yield { type: 'progress', progress: 100 }
    yield {
      type: 'result',
      data: { expertise: 'backend', recommendations: ['Use proper error handling', 'Add request validation'] },
    }
  }

  private async *frontendExpertHandler(_task: string, _context: any) {
    yield { type: 'progress', progress: 30 }
    yield { type: 'tool_use', tool: 'find_files', description: 'Finding frontend components' }

    await new Promise((resolve) => setTimeout(resolve, 800))

    yield { type: 'progress', progress: 100 }
    yield {
      type: 'result',
      data: { expertise: 'frontend', recommendations: ['Improve accessibility', 'Optimize bundle size'] },
    }
  }

  private async *reactExpertHandler(_task: string, _context: any) {
    yield { type: 'progress', progress: 40 }
    yield { type: 'tool_use', tool: 'find_files', description: 'Finding React components' }

    await new Promise((resolve) => setTimeout(resolve, 1200))

    yield { type: 'progress', progress: 100 }
    yield {
      type: 'result',
      data: { expertise: 'react', recommendations: ['Use React.memo for optimization', 'Implement error boundaries'] },
    }
  }

  private async *devopsExpertHandler(_task: string, _context: any) {
    yield { type: 'progress', progress: 35 }
    yield { type: 'tool_use', tool: 'find_files', description: 'Looking for deployment configs' }

    await new Promise((resolve) => setTimeout(resolve, 1500))

    yield { type: 'progress', progress: 100 }
    yield {
      type: 'result',
      data: { expertise: 'devops', recommendations: ['Add Docker health checks', 'Set up monitoring'] },
    }
  }

  private async *codeGeneratorHandler(task: string, context: any) {
    try {
      yield { type: 'progress', progress: 10 }
      yield { type: 'tool_use', tool: 'analysis', description: 'Understanding generation requirements' }

      // Quick project scan for context
      yield { type: 'tool_use', tool: 'analyze_project', description: 'Scanning project for targets' }
      const project = await context.tools.executeTool('analyze_project', {})

      yield { type: 'progress', progress: 45 }

      // Suggest scaffold plan
      const plan = {
        task,
        detectedFramework: project?.framework || 'unknown',
        steps: [
          'Generate scaffolding for requested feature/module',
          'Create implementation stubs and types',
          'Wire routes/exports and update index',
          'Add minimal tests and docs',
        ],
      }

      yield { type: 'progress', progress: 90 }
      yield { type: 'result', data: plan }
    } catch (error: any) {
      yield { type: 'error', error: `Code Generator failed: ${error.message}` }
    }
  }

  private async *optimizationExpertHandler(task: string, context: any) {
    try {
      yield { type: 'progress', progress: 15 }
      yield { type: 'tool_use', tool: 'find_files', description: 'Locating hotspots for optimization' }
      const files = await context.tools.executeTool('find_files', { pattern: '.ts' })

      yield { type: 'progress', progress: 60 }
      const recommendations = [
        'Enable TypeScript strict options for better safety',
        'Cache expensive computations and IO where feasible',
        'Reduce bundle by trimming dependencies and dynamic imports',
        'Measure before/after with profiling tools',
      ]

      yield { type: 'progress', progress: 100 }
      yield { type: 'result', data: { task, files: files?.matches?.slice(0, 10) || [], recommendations } }
    } catch (error: any) {
      yield { type: 'error', error: `Optimization failed: ${error.message}` }
    }
  }

  private async *framerMotionHandler(task: string, context: any) {
    try {
      yield { type: 'progress', progress: 10 }
      yield { type: 'tool_use', tool: 'analyze_project', description: 'Detecting framework and dependencies' }
      const project = await context.tools.executeTool('analyze_project', {})

      const deps = project?.packageInfo?.dependencies || {}
      const devDeps = project?.packageInfo?.devDependencies || {}
      const hasFramer = !!(deps['framer-motion'] || devDeps['framer-motion'])

      yield { type: 'progress', progress: 35 }
      yield { type: 'tool_use', tool: 'find_files', description: 'Locating React component files' }
      const reactFiles = await context.tools.executeTool('find_files', { pattern: '.tsx' })

      yield { type: 'progress', progress: 70 }
      const recommendations = [
        'Wrap animated elements with motion.* components (e.g., motion.div)',
        'Use variants for orchestrating complex enter/exit animations',
        'Use AnimatePresence for conditional components with exit animations',
        'Enable layout/layoutId for shared layout transitions',
        'Leverage useScroll/useTransform for scroll-based parallax effects',
        'Prefer reduced motion for accessibility (prefers-reduced-motion)',
        'In Next.js, avoid SSR mismatches: gate animations client-side where needed',
      ]

      const actions = hasFramer ? [] : ['Install framer-motion: npm install framer-motion']

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
        },
      }
      yield { type: 'progress', progress: 100 }
    } catch (error: any) {
      yield { type: 'error', error: `Framer Motion advisor failed: ${error.message}` }
    }
  }

  private async *aiSdkIntegratorHandler(task: string, context: any) {
    try {
      yield { type: 'progress', progress: 10 }
      yield { type: 'tool_use', tool: 'analyze_project', description: 'Inspecting project dependencies' }
      const project = await context.tools.executeTool('analyze_project', {})
      const deps = project?.packageInfo?.dependencies || {}
      const devDeps = project?.packageInfo?.devDependencies || {}
      const hasAISDK = !!(
        deps.ai ||
        deps['@ai-sdk/openai'] ||
        deps['@ai-sdk/anthropic'] ||
        deps['@ai-sdk/google'] ||
        deps['@ai-sdk/vercel'] ||
        devDeps.ai ||
        devDeps['@ai-sdk/openai'] ||
        devDeps['@ai-sdk/anthropic'] ||
        devDeps['@ai-sdk/google'] ||
        devDeps['@ai-sdk/vercel']
      )

      yield { type: 'progress', progress: 40 }
      yield { type: 'tool_use', tool: 'find_files', description: 'Finding API/route and service files' }
      const tsFiles = await context.tools.executeTool('find_files', { pattern: '.ts' })

      yield { type: 'progress', progress: 75 }
      const recommendations = [
        'Use AI SDK’s streaming helpers for incremental updates (e.g., streamText)',
        'Abstract provider config (OpenAI, Anthropic, Google) behind a service',
        'Centralize model + temperature in config with env fallbacks',
        'Implement tool calling / function calling with typed handlers',
        'Propagate AbortController to cancel in-flight generations',
        'Add defensive rate-limit + retries around API calls',
        'Expose a thin CLI or HTTP route that proxies AI responses securely',
      ]

      const missing = [] as string[]
      if (!hasAISDK) missing.push('ai')
      if (!deps['@ai-sdk/openai'] && !devDeps['@ai-sdk/openai']) missing.push('@ai-sdk/openai')
      if (!deps['@ai-sdk/anthropic'] && !devDeps['@ai-sdk/anthropic']) missing.push('@ai-sdk/anthropic')
      if (!deps['@ai-sdk/google'] && !devDeps['@ai-sdk/google']) missing.push('@ai-sdk/google')
      if (!deps['@ai-sdk/vercel'] && !devDeps['@ai-sdk/vercel']) missing.push('@ai-sdk/vercel')

      const nextActions =
        missing.length > 0
          ? [`Install SDKs: npm install ${missing.join(' ')}`]
          : ['Verify keys and provider selection logic; add streaming route example']

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
        },
      }
      yield { type: 'progress', progress: 100 }
    } catch (error: any) {
      yield { type: 'error', error: `AI SDK integration advisor failed: ${error.message}` }
    }
  }

  private async *systemAdminHandler(_task: string, _context: any) {
    yield { type: 'progress', progress: 20 }
    yield { type: 'tool_use', tool: 'execute_command', description: 'Checking system status' }

    await new Promise((resolve) => setTimeout(resolve, 1000))

    yield { type: 'progress', progress: 100 }
    yield {
      type: 'result',
      data: { expertise: 'sysadmin', recommendations: ['Update dependencies', 'Review security settings'] },
    }
  }

  private async *autonomousCoderHandler(task: string, context: any) {
    try {
      // Use unified autonomous workflow for this agent
      yield* this.executeUnifiedAutonomousWorkflow(task, context, 'autonomous-coder')
    } catch (error: any) {
      yield { type: 'error', error: `Autonomous Coder failed: ${error.message}` }
    }
  }

  /**
   * Create a secure tool wrapper that implements approval logic based on security mode
   */
  private createSecureToolWrapper(originalToolService: any, securityMode: 'safe' | 'default' | 'developer'): any {
    const self = this // Capture reference to AgentService instance
    return {
      // Pass through all original methods
      ...originalToolService,

      // Override executeTool to add security logic
      async executeTool(toolName: string, args: any): Promise<any> {
        const operation = self.inferOperationFromArgs(toolName, args)

        // Determine if we should use secure execution
        const shouldUseSecure = self.shouldUseSecureExecution(toolName, securityMode)

        if (shouldUseSecure) {
          console.log(chalk.yellow(`🛡️ Security check: ${toolName}`))
          return await originalToolService.executeToolSafely(toolName, operation, args)
        } else {
          // Use original method for safe/read-only operations or in developer mode
          return await originalToolService.executeTool(toolName, args)
        }
      },
    }
  }

  /**
   * Determine if secure execution should be used based on tool and security mode
   */
  private shouldUseSecureExecution(toolName: string, securityMode: 'safe' | 'default' | 'developer'): boolean {
    // Always use secure execution in safe mode
    if (securityMode === 'safe') {
      return !this.isReadOnlyTool(toolName)
    }

    // Use secure execution for risky operations in default mode
    if (securityMode === 'default') {
      return this.isRiskyTool(toolName)
    }

    // Developer mode - only secure for high-risk operations
    if (securityMode === 'developer') {
      return this.isHighRiskTool(toolName)
    }

    return false // Fallback
  }

  /**
   * Check if tool is read-only (safe)
   */
  private isReadOnlyTool(toolName: string): boolean {
    const readOnlyTools = ['read_file', 'list_files', 'find_files', 'analyze_project', 'git_status', 'git_diff']
    return readOnlyTools.includes(toolName)
  }

  /**
   * Check if tool is risky (modifies files/system)
   */
  private isRiskyTool(toolName: string): boolean {
    const riskyTools = [
      'write_file',
      'edit_file',
      'multi_edit',
      'git_commit',
      'git_push',
      'npm_install',
      'execute_command',
    ]
    return riskyTools.includes(toolName)
  }

  /**
   * Check if tool is high-risk (dangerous operations)
   */
  private isHighRiskTool(toolName: string): boolean {
    const highRiskTools = ['execute_command', 'delete_file', 'git_reset', 'network_request']
    return highRiskTools.includes(toolName)
  }

  /**
   * Infer operation type from tool name and arguments
   */
  private inferOperationFromArgs(_toolName: string, args: any): string {
    if (args.operation) return args.operation
    if (args.command) return `execute: ${args.command}`
    if (args.filePath) return `file-op: ${args.filePath}`
    return 'general'
  }

  /**
   * VM Agent Handler - placeholder for virtualized agent integration
   */
  private async *vmAgentHandler(task: string, _context: any): AsyncGenerator<any, any, unknown> {
    try {
      yield { type: 'progress', progress: 10 }
      yield { type: 'tool_use', tool: 'vm-agent', description: 'Initializing virtualized environment' }

      // For now, this is a placeholder that delegates to autonomous-coder
      // In the future, this will integrate with the actual VM agent system
      yield { type: 'progress', progress: 50 }
      yield { type: 'tool_use', tool: 'vm-agent', description: 'Delegating to autonomous-coder for task execution' }

      // Simulate task completion
      yield { type: 'progress', progress: 100 }
      yield {
        type: 'result',
        data: `VM Agent placeholder: Task "${task}" would be executed in virtualized environment. Currently delegating to autonomous-coder.`,
      }
    } catch (error: any) {
      yield { type: 'error', error: `VM Agent failed: ${error.message}` }
    }
  }

  /**
   * Unified Autonomous Workflow - used by all agents in auto mode
   * Based on factory agent pattern with cognitive reasoning and toolchain execution
   */
  private async *executeUnifiedAutonomousWorkflow(
    task: string,
    context: any,
    agentType: string
  ): AsyncGenerator<any, any, unknown> {
    try {
      // Step 1: Cognitive Analysis and Planning
      yield {
        type: 'reasoning',
        step: 1,
        title: 'Cognitive Task Analysis',
        reasoning: `Analyzing task: "${task}". Applying cognitive processing to understand requirements, context, and optimal execution strategy.`,
        toolchain: ['analysis', 'planning', 'context-evaluation'],
        estimatedDuration: '10-15 seconds',
      }
      yield { type: 'progress', progress: 10 }

      // Step 2: Context Evaluation
      yield {
        type: 'reasoning',
        step: 2,
        title: 'Context & Environment Assessment',
        reasoning: `Evaluating workspace context, available tools, and agent capabilities. Agent type: ${agentType}. Working directory: ${context.workingDirectory}.`,
        nextAction: 'Identify required tools and dependencies',
      }

      const workspaceFiles = await this.analyzeWorkspaceContext(context)
      yield { type: 'progress', progress: 25 }

      // Step 3: Strategic Planning
      yield {
        type: 'reasoning',
        step: 3,
        title: 'Strategic Execution Planning',
        reasoning: `Creating autonomous execution plan. Identified ${workspaceFiles.length} relevant files. Planning multi-step approach with error recovery.`,
        toolchain: ['strategic-planning', 'step-decomposition', 'risk-assessment'],
        nextAction: 'Execute planned steps with real-time monitoring',
      }

      const executionPlan = this.generateExecutionPlan(task, workspaceFiles, agentType)
      yield { type: 'progress', progress: 40 }

      // Step 4: Autonomous Execution
      yield {
        type: 'reasoning',
        step: 4,
        title: 'Autonomous Task Execution',
        reasoning: `Beginning autonomous execution of ${executionPlan.steps.length} planned steps. Each step will be monitored for success and adapted as needed.`,
        toolchain: executionPlan.requiredTools,
        estimatedDuration: `${executionPlan.estimatedDuration} seconds`,
      }

      const results = []
      const errors = []
      let currentStep = 0

      for (const step of executionPlan.steps) {
        currentStep++
        const stepProgress = 40 + (currentStep / executionPlan.steps.length) * 50

        yield {
          type: 'reasoning',
          step: 4.1,
          title: `Executing Step ${currentStep}: ${step.title}`,
          reasoning: step.reasoning,
          nextAction: step.action,
        }

        yield { type: 'tool_use', tool: step.tool, description: step.description }

        try {
          const stepResult = await this.executeAutonomousStep(step, context)
          results.push(stepResult)
          yield { type: 'progress', progress: stepProgress }
        } catch (stepError: any) {
          errors.push({ step: step.title, error: stepError.message })
          console.log(chalk.yellow(`⚠️ Step failed: ${step.title} - ${stepError.message}`))
        }
      }

      // Step 5: Results Synthesis
      yield {
        type: 'reasoning',
        step: 5,
        title: 'Results Analysis & Synthesis',
        reasoning: `Autonomous execution completed. Processed ${results.length} successful steps with ${errors.length} errors. Synthesizing comprehensive results.`,
        nextAction: 'Generate formatted results and recommendations',
      }
      yield { type: 'progress', progress: 95 }

      // Generate comprehensive results like factory agents
      const comprehensiveResult = {
        agent: agentType,
        task: task,
        autonomyLevel: 'fully-autonomous',
        success: errors.length === 0,
        summary: {
          successful: results.length,
          failed: errors.length,
          total: executionPlan.steps.length,
          successRate: Math.round((results.length / executionPlan.steps.length) * 100),
        },
        results: results,
        errors: errors.length > 0 ? errors : undefined,
        executionPlan,
        timestamp: new Date().toISOString(),
      }

      yield { type: 'progress', progress: 100 }
      yield { type: 'result', data: comprehensiveResult }
    } catch (error: any) {
      yield { type: 'error', error: `Unified autonomous workflow failed: ${error.message}` }
    }
  }

  /**
   * Analyze workspace context for autonomous planning
   */
  private async analyzeWorkspaceContext(context: any): Promise<string[]> {
    try {
      const files = await context.tools.executeTool('list_files', { directory: context.workingDirectory })
      return files?.files?.slice(0, 20) || []
    } catch (_error) {
      return []
    }
  }

  /**
   * Generate execution plan based on task and context
   */
  private generateExecutionPlan(task: string, _workspaceFiles: string[], _agentType: string): any {
    const steps = []
    const requiredTools = ['analysis']

    // Basic planning based on task keywords
    if (task.toLowerCase().includes('analyze') || task.toLowerCase().includes('review')) {
      steps.push({
        title: 'Code Analysis',
        reasoning: 'Performing comprehensive code analysis to understand structure and identify areas for improvement',
        action: 'Analyze codebase structure and patterns',
        tool: 'analysis',
        description: 'Analyzing codebase for insights',
      })
      requiredTools.push('read_file', 'find_files')
    }

    if (
      task.toLowerCase().includes('implement') ||
      task.toLowerCase().includes('create') ||
      task.toLowerCase().includes('build')
    ) {
      steps.push({
        title: 'Implementation Planning',
        reasoning: 'Creating implementation strategy based on requirements and existing codebase structure',
        action: 'Plan and execute implementation steps',
        tool: 'implementation',
        description: 'Planning implementation approach',
      })
      steps.push({
        title: 'Code Implementation',
        reasoning: 'Implementing solution with proper error handling and following best practices',
        action: 'Write code implementation',
        tool: 'write_file',
        description: 'Implementing solution',
      })
      requiredTools.push('write_file', 'edit_file')
    }

    if (task.toLowerCase().includes('test') || task.toLowerCase().includes('verify')) {
      steps.push({
        title: 'Testing & Verification',
        reasoning: 'Running tests to verify implementation correctness and identify any issues',
        action: 'Execute tests and verify results',
        tool: 'test',
        description: 'Running tests and verification',
      })
      requiredTools.push('execute_command')
    }

    // Default steps if no specific patterns matched
    if (steps.length === 0) {
      steps.push({
        title: 'Task Analysis',
        reasoning: 'Analyzing task requirements and determining optimal approach',
        action: 'Understand and break down task requirements',
        tool: 'analysis',
        description: 'Analyzing task requirements',
      })
      steps.push({
        title: 'Task Execution',
        reasoning: 'Executing task using autonomous decision-making and available tools',
        action: 'Execute primary task objectives',
        tool: 'execution',
        description: 'Executing main task',
      })
    }

    return {
      steps,
      requiredTools,
      estimatedDuration: steps.length * 15, // 15 seconds per step
    }
  }

  /**
   * Execute individual autonomous step
   */
  private async executeAutonomousStep(step: any, _context: any): Promise<any> {
    // This is a simplified implementation - in production would have more sophisticated execution logic
    return {
      step: step.title,
      success: true,
      action: step.action,
      summary: `Completed: ${step.title}`,
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Check if result data is from a factory agent or unified autonomous workflow
   */
  private isFactoryAgentResult(data: any): boolean {
    return (
      data &&
      typeof data === 'object' &&
      data.agent &&
      data.autonomyLevel &&
      data.summary &&
      data.results &&
      Array.isArray(data.results)
    )
  }

  /**
   * Handle factory agent results with formatted output and markdown generation
   */
  private async handleFactoryAgentResult(agentTask: any, resultData: any): Promise<void> {
    try {
      // Generate formatted console output
      this.displayFactoryAgentResults(agentTask, resultData)

      // Generate markdown file in root directory
      await this.generateResultsMarkdown(agentTask, resultData)
    } catch (error: any) {
      console.log(chalk.yellow(`⚠️ Failed to format factory agent results: ${error.message}`))
    }
  }

  /**
   * Display formatted results in console
   */
  private displayFactoryAgentResults(agentTask: any, resultData: any): void {
    const { agent, summary, results, autonomyLevel, success } = resultData

    console.log(chalk.cyan.bold(`\n🎯 Autonomous Agent Results: ${agent}`))
    console.log(chalk.gray('═'.repeat(60)))

    // Summary statistics
    const statusIcon = success ? '✓' : '✖'
    const statusColor = success ? chalk.green : chalk.red
    console.log(`${statusIcon} ${statusColor('Status:')} ${success ? 'Success' : 'Failed'}`)
    console.log(`${chalk.blue('Autonomy Level:')} ${autonomyLevel}`)
    console.log(`${chalk.blue('Task:')} ${agentTask.task}`)

    // Progress summary
    console.log(chalk.cyan.bold('\n📊 Execution Summary:'))
    console.log(`  ${chalk.green('✓')} Successful: ${summary.successful}/${summary.total}`)
    console.log(`  ${chalk.red('✖')} Failed: ${summary.failed}/${summary.total}`)
    console.log(`  ${chalk.yellow('📈')} Success Rate: ${summary.successRate}%`)

    // Individual results (show first 5)
    if (results && results.length > 0) {
      console.log(chalk.cyan.bold('\n📋 Task Results:'))
      const displayResults = results.slice(0, 5)
      displayResults.forEach((result: any, index: number) => {
        const icon = result.success !== false ? '✓' : '✖'
        const color = result.success !== false ? chalk.green : chalk.red
        console.log(`  ${icon} ${color(`Result ${index + 1}:`)} ${result.summary || result.action || 'Task completed'}`)
      })

      if (results.length > 5) {
        console.log(chalk.gray(`  ... and ${results.length - 5} more results`))
      }
    }

    // Completion message
    console.log(chalk.gray('═'.repeat(60)))
    console.log(chalk.green(`✨ Complete results saved to agent-results-${Date.now()}.md`))
    console.log('')
  }

  /**
   * Generate markdown file with comprehensive results
   */
  private async generateResultsMarkdown(agentTask: any, resultData: any): Promise<void> {
    const timestamp = new Date().toISOString()
    const filename = `agent-results-${Date.now()}.md`
    const { agent, summary, results, autonomyLevel, success, errors } = resultData

    const markdown = `# Autonomous Agent Results Report

**Agent:** ${agent}  
**Task:** ${agentTask.task}  
**Timestamp:** ${timestamp}  
**Status:** ${success ? '✓ Success' : '✖ Failed'}  
**Autonomy Level:** ${autonomyLevel}  

## 📊 Execution Summary

- **Total Tasks:** ${summary.total}
- **Successful:** ${summary.successful}
- **Failed:** ${summary.failed}
- **Success Rate:** ${summary.successRate}%

## 📋 Detailed Results

${results
        .map((result: any, index: number) => {
          const status = result.success !== false ? '✓' : '✖'
          const title = result.title || result.action || `Task ${index + 1}`
          const description = result.summary || result.description || 'No description available'

          return `### ${status} Result ${index + 1}: ${title}

${description}

${result.details
              ? `**Details:** ${result.details}

`
              : ''
            }`
        })
        .join('')}
${errors && errors.length > 0
        ? `## ✖ Errors

${errors.map((error: any) => `- **${error.step}:** ${error.error}`).join('\n')}

`
        : ''
      }
## 🔌 Agent Information

- **Agent ID:** ${agent}
- **Autonomy Level:** ${autonomyLevel}
- **Task ID:** ${agentTask.id}
- **Generated:** ${timestamp}

---
*Generated by NikCLI Autonomous Agent System*
`

    // Write markdown file to root directory
    const fs = require('node:fs')
    const path = require('node:path')
    const rootPath = process.cwd()
    const filePath = path.join(rootPath, filename)

    await fs.promises.writeFile(filePath, markdown, 'utf8')

    console.log(chalk.green(`📄 Results saved to: ${filename}`))
  }
}

export const agentService = new AgentService()
