import { EventEmitter } from 'node:events'
import { nanoid } from 'nanoid'
import type { SimpleConfigManager } from '../core/config-manager'
import { GuidanceManager } from '../guidance/guidance-manager'
import { contextOrchestrator } from '../orchestrator/context-orchestrator'
import type {
  Agent,
  AgentConfig,
  AgentContext,
  AgentEvent,
  AgentMetadata,
  AgentMetrics,
  AgentRegistryEntry,
  AgentTask,
  AgentTaskResult,
  AgentTodo,
  TaskStatus,
} from '../types/types'
import { advancedUI } from '../ui/advanced-cli-ui'
import { AsyncLock } from '../utils/async-lock'
import { structuredLogger } from '../utils/structured-logger'
import type { CliConfig } from './config-manager'

/**
 * Enterprise Agent Manager
 * Unifies agent lifecycle, task management, and coordination
 */
export class AgentManager extends EventEmitter {
  private agents = new Map<string, Agent>()
  private taskQueues = new Map<string, AgentTask[]>()
  private agentRegistry = new Map<string, AgentRegistryEntry>()
  private guidanceManager: GuidanceManager
  private configManager: SimpleConfigManager
  private config: CliConfig
  private activeTaskCount = 0
  private taskHistory = new Map<string, AgentTaskResult>()
  private queueLocks = new AsyncLock()

  constructor(configManager: SimpleConfigManager, guidanceManager?: GuidanceManager) {
    super()
    this.configManager = configManager
    this.guidanceManager = guidanceManager || new GuidanceManager(process.cwd())
    this.config = this.configManager.getConfig() as CliConfig

    this.setupEventHandlers()
  }

  /**
   * Initialize the agent manager
   */
  async initialize(): Promise<void> {
    await structuredLogger.info(
      'Initializing AgentManager',
      JSON.stringify({
        maxConcurrentAgents: this.config.maxConcurrentAgents,
        enableGuidanceSystem: this.config.enableGuidanceSystem,
      })
    )

    // Initialize guidance system if enabled
    if (this.config.enableGuidanceSystem) {
      await this.guidanceManager.initialize((context) => {
        this.onGuidanceUpdated(context)
      })
    }
  }

  /**
   * Register an agent in the system
   */
  async registerAgent(agent: Agent): Promise<void> {
    // Initialize agent with context
    const context = await this.buildAgentContext(agent)
    await agent.initialize(context)

    // Store agent
    this.agents.set(agent.id, agent)
    this.taskQueues.set(agent.id, [])

    // Emit registration event
    this.emit('agent.registered', {
      id: nanoid(),
      type: 'agent.initialized',
      agentId: agent.id,
      timestamp: new Date(),
      data: { agent: this.getAgentInfo(agent) },
    } as AgentEvent)
  }

  /**
   * Register an agent class in the registry
   */
  registerAgentClass(agentClass: new (...args: any[]) => Agent, metadata: AgentMetadata): void {
    this.agentRegistry.set(metadata.id, {
      agentClass,
      metadata,
      isEnabled: true,
    })
  }

  /**
   * Create and register an agent from registry
   */
  async createAgent(agentId: string, config?: Partial<AgentConfig>): Promise<Agent> {
    const registryEntry = this.agentRegistry.get(agentId)
    if (!registryEntry) {
      throw new Error(`Agent class not found in registry: ${agentId}`)
    }

    if (!registryEntry.isEnabled) {
      throw new Error(`Agent class is disabled: ${agentId}`)
    }

    // Create agent instance
    const agent = new registryEntry.agentClass(process.cwd())

    // Configure agent
    if (config) {
      agent.updateConfiguration(config)
    }

    // Register the agent
    await this.registerAgent(agent)

    return agent
  }

  /**
   * Get an agent by ID
   */
  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId)
  }

  /**
   * Get all registered agents
   */
  listAgents(): Array<{
    id: string
    name: string
    status: string
    specialization: string
    description: string
    capabilities: string[]
    currentTasks: number
    metrics: AgentMetrics
  }> {
    return Array.from(this.agents.values()).map((agent) => ({
      id: agent.id,
      name: agent.name,
      status: agent.status,
      specialization: agent.specialization,
      description: agent.description,
      capabilities: agent.capabilities,
      currentTasks: agent.currentTasks,
      metrics: agent.getMetrics(),
    }))
  }

  /**
   * Get available agent names for command-line usage
   */
  getAvailableAgentNames(): string[] {
    return Array.from(this.agents.values()).map((agent) => agent.name)
  }

  /**
   * Get agents by capability
   */
  getAgentsByCapability(capability: string): Agent[] {
    return Array.from(this.agents.values()).filter((agent) => agent.capabilities.includes(capability))
  }

  /**
   * Find the best agent for a task
   */
  findBestAgentForTask(task: AgentTask): Agent | null {
    let bestAgent: Agent | null = null
    let bestScore = 0

    for (const agent of this.agents.values()) {
      if (agent.status !== 'ready' && agent.status !== 'busy') {
        continue
      }

      if (agent.currentTasks >= agent.maxConcurrentTasks) {
        continue
      }

      if (!agent.canHandle(task)) {
        continue
      }

      // Calculate score based on capabilities match
      let score = 0

      // FIXED: Replaced 'any' with proper type (ERR-039)
      // Check required capabilities
      if (task.requiredCapabilities) {
        const matchingCapabilities = task.requiredCapabilities.filter((cap: string) => agent.capabilities.includes(cap))
        score += matchingCapabilities.length * 10
      }

      // Prefer less busy agents
      score += (agent.maxConcurrentTasks - agent.currentTasks) * 5

      // Prefer agents with better metrics
      const metrics = agent.getMetrics()
      score += metrics.successRate * 2

      if (score > bestScore) {
        bestScore = score
        bestAgent = agent
      }
    }

    return bestAgent
  }

  /**
   * Schedule a task for execution
   */
  async scheduleTask(task: AgentTask, preferredAgentId?: string): Promise<string> {
    let agent: Agent | null = null

    // Use preferred agent if specified
    if (preferredAgentId) {
      agent = this.getAgent(preferredAgentId) || null
      if (!agent || !agent.canHandle(task)) {
        throw new Error(`Preferred agent ${preferredAgentId} cannot handle this task`)
      }
    } else {
      // Find best agent automatically
      agent = this.findBestAgentForTask(task)
      if (!agent) {
        throw new Error('No suitable agent available for this task')
      }
    }

    // Add to agent's task queue
    const queue = this.taskQueues.get(agent.id) || []
    queue.push(task)
    this.taskQueues.set(agent.id, queue)

    // FIXED: Added error handling to async setImmediate (ERR-034)
    // Start execution if agent is available
    if (agent.currentTasks < agent.maxConcurrentTasks) {
      setImmediate(() => {
        this.processAgentQueue(agent.id).catch((error) => {
          structuredLogger.error(
            'Queue processing failed in setImmediate',
            JSON.stringify({ agentId: agent.id, error: error.message })
          )
        })
      })
    }

    return agent.id
  }

  /**
   * Execute a task on a specific agent
   */
  async executeTask(agentId: string, task: AgentTask, timeoutMs: number = 300000): Promise<AgentTaskResult> {
    const agent = this.getAgent(agentId)
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`)
    }

    if (!agent.canHandle(task)) {
      throw new Error(`Agent ${agentId} cannot handle this task`)
    }

    await structuredLogger.info(
      'Starting task execution',
      JSON.stringify({
        taskId: task.id,
        agentId: agentId,
        timeout: timeoutMs,
      })
    )

    // Setup timeout controller
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      this.activeTaskCount++
      task.status = 'in_progress'
      task.startedAt = new Date()

      // Race between task execution and timeout
      const result = await Promise.race([
        agent.executeTask(task),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () =>
            reject(new Error(`Task ${task.id} timed out after ${timeoutMs}ms`))
          )
        }),
      ])

      clearTimeout(timeoutId)

      // Store result
      this.taskHistory.set(task.id, result)

      await this.reportTaskOutcome(agentId, task, result)

      return result
    } catch (error: any) {
      clearTimeout(timeoutId)

      // Check if error is timeout-related
      const isTimeout = error.name === 'AbortError' || error.message?.includes('timed out')

      const result: AgentTaskResult = {
        taskId: task.id,
        agentId,
        status: 'failed',
        startTime: task.startedAt!,
        endTime: new Date(),
        error: isTimeout ? `Task timeout (${timeoutMs}ms)` : error.message,
        errorDetails: error,
      }

      this.taskHistory.set(task.id, result)

      await structuredLogger.error(
        isTimeout ? 'Task timed out' : 'Task failed',
        JSON.stringify({
          taskId: task.id,
          agentId: agentId,
          error: result.error,
          timeout: isTimeout,
        })
      )

      throw error
    } finally {
      this.activeTaskCount--
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
      progress: todo.progress,
    }

    this.scheduleTask(task, agentId)
  }

  /**
   * Run all scheduled tasks sequentially
   */
  async runSequential(): Promise<void> {
    await structuredLogger.info('Starting sequential task execution', 'AgentManager')

    for (const [agentId, tasks] of this.taskQueues.entries()) {
      if (tasks.length === 0) continue

      const agent = this.getAgent(agentId)
      if (!agent) continue

      await structuredLogger.info(`Executing ${tasks.length} tasks sequentially`, 'AgentManager')

      for (const task of tasks) {
        try {
          await this.executeTask(agentId, task)
        } catch (error: any) {
          await structuredLogger.error(
            'Sequential execution failed',
            JSON.stringify({
              taskId: task.id,
              agentId: agentId,
              error: error.message,
            })
          )
        }
      }

      // Clear completed tasks
      this.taskQueues.set(agentId, [])
    }

    await structuredLogger.info('Sequential task execution completed', 'AgentManager')
  }

  /**
   * Run tasks in parallel with concurrency limit
   * FIXED: Replaced Promise.race() with Promise.allSettled() to prevent task loss
   */
  async runParallel(concurrency?: number): Promise<void> {
    const maxConcurrency = concurrency || this.config.maxConcurrentAgents

    await structuredLogger.info(
      'Starting parallel task execution',
      JSON.stringify({
        maxConcurrency,
        totalTasks: this.getTotalPendingTasks(),
      })
    )

    const promises: Promise<void>[] = []

    for (const agentId of this.taskQueues.keys()) {
      // Wait for all promises to settle when at capacity, then clear the array
      while (promises.length >= maxConcurrency) {
        await Promise.allSettled(promises)
        promises.length = 0 // Clear completed promises
      }

      promises.push(this.processAgentQueue(agentId))
    }

    // Ensure all remaining promises complete
    await Promise.allSettled(promises)

    await structuredLogger.info('Parallel task execution completed', 'AgentManager')
  }

  /**
   * Process task queue for a specific agent
   * FIXED: Added AsyncLock to prevent race conditions on queue access
   */
  private async processAgentQueue(agentId: string): Promise<void> {
    const agent = this.getAgent(agentId)
    const queue = this.taskQueues.get(agentId)

    if (!agent || !queue || queue.length === 0) {
      return
    }

    while (queue.length > 0 && agent.currentTasks < agent.maxConcurrentTasks) {
      // Acquire lock before accessing queue to prevent race conditions
      const release = await this.queueLocks.acquire(`queue-${agentId}`)

      try {
        // Double-check queue after acquiring lock
        if (queue.length === 0) {
          release()
          break
        }

        const task = queue.shift()!
        release() // Release lock immediately after dequeue

        await this.executeTask(agentId, task)
      } catch (error: any) {
        release() // Ensure lock is released on error
        await structuredLogger.error(
          'Queue processing failed',
          JSON.stringify({
            taskId: this.taskQueues.get(agentId)?.[0]?.id,
            agentId: agentId,
            error: error.message,
          })
        )
      }
    }
  }

  /**
   * Build agent context with guidance and configuration
   */
  private async buildAgentContext(agent: Agent): Promise<AgentContext> {
    const guidance = this.config.enableGuidanceSystem
      ? this.guidanceManager.getContextForAgent(agent.specialization, process.cwd())
      : ''

    let orchestratedContext = ''
    try {
      orchestratedContext = contextOrchestrator.getAgentContext(agent.taskchainId || 'default', agent.id)
    } catch {
      advancedUI.logWarning('⚠ Could not get orchestrated context')
    }

    const combinedGuidance = orchestratedContext
      ? `${guidance}\n\n## Orchestrated Context\n${orchestratedContext}`
      : guidance

    return {
      workingDirectory: process.cwd(),
      projectPath: process.cwd(),
      guidance: combinedGuidance,
      configuration: {
        autonomyLevel: 'semi-autonomous',
        maxConcurrentTasks: agent.maxConcurrentTasks,
        defaultTimeout: this.config.defaultAgentTimeout || 300000,
        retryPolicy: {
          maxAttempts: 3,
          backoffMs: 1000,
          backoffMultiplier: 2,
          retryableErrors: ['NetworkError', 'TimeoutError'],
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
          canAccessSecrets: false,
        },
        sandboxRestrictions: this.getSandboxRestrictions(),
      },
      executionPolicy: {
        approval: 'moderate' as any,
        sandbox: 'workspace-write' as any,
        timeoutMs: this.config.defaultAgentTimeout || 300000,
        maxRetries: 3,
      },
      approvalRequired: this.config.approvalPolicy === 'strict',
    }
  }

  /**
   * Report task outcome to context orchestrator for learning
   */
  private async reportTaskOutcome(agentId: string, task: AgentTask, result: AgentTaskResult): Promise<void> {
    try {
      const agent = this.getAgent(agentId)
      if (!agent) return

      const duration = result.endTime && result.startTime ? result.endTime.getTime() - result.startTime.getTime() : 0

      await contextOrchestrator.reportOutcome(agent.taskchainId || 'default', agentId, {
        success: result.status === 'completed',
        tokensUsed: result.tokenUsage?.total || 0,
        duration,
        todos: [],
      })
    } catch {
      advancedUI.logWarning('⚠ Could not report task outcome to context orchestrator')
    }
  }

  /**
   * Get sandbox restrictions based on configuration
   */
  private getSandboxRestrictions(): string[] {
    const restrictions: string[] = []

    if (!this.config.sandbox.enabled) {
      return restrictions // No restrictions if sandbox disabled
    }

    if (!this.config.sandbox.allowFileSystem) {
      restrictions.push('no-file-write', 'no-file-delete')
    }

    if (!this.config.sandbox.allowNetwork) {
      restrictions.push('no-network-access')
    }

    if (!this.config.sandbox.allowCommands) {
      restrictions.push('no-command-execution')
    }

    return restrictions
  }

  /**
   * Event handlers setup
   */
  private setupEventHandlers(): void {
    this.on('agent.registered', (event: AgentEvent) => {
      structuredLogger.info('Agent registered event', JSON.stringify(event))
    })

    this.on('task.completed', (event: AgentEvent) => {
      structuredLogger.info('Task completed event', JSON.stringify(event))
    })

    this.on('task.failed', (event: AgentEvent) => {
      structuredLogger.warning('Task failed event', JSON.stringify(event))
    })
  }

  /**
   * Handle guidance system updates
   */
  private onGuidanceUpdated(_context: any): void {
    // Update all agents with new guidance
    for (const agent of this.agents.values()) {
      const guidance = this.guidanceManager.getContextForAgent(agent.specialization, process.cwd())
      agent.updateGuidance(guidance)
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
      status: agent.status,
    }
  }

  /**
   * Get total pending tasks across all agents
   */
  private getTotalPendingTasks(): number {
    return Array.from(this.taskQueues.values()).reduce((total, queue) => total + queue.length, 0)
  }

  /**
   * Get system statistics
   */
  getStats(): {
    totalAgents: number
    activeAgents: number
    totalTasks: number
    pendingTasks: number
    completedTasks: number
    failedTasks: number
    averageTaskDuration: number
  } {
    const agents = Array.from(this.agents.values())
    const results = Array.from(this.taskHistory.values())

    const completedResults = results.filter((r) => r.status === 'completed')
    const failedResults = results.filter((r) => r.status === 'failed')

    const totalDuration = completedResults
      .filter((r) => r.duration !== undefined)
      .reduce((sum, r) => sum + (r.duration || 0), 0)

    return {
      totalAgents: agents.length,
      activeAgents: agents.filter((a) => a.status === 'ready' || a.status === 'busy').length,
      totalTasks: results.length,
      pendingTasks: this.getTotalPendingTasks(),
      completedTasks: completedResults.length,
      failedTasks: failedResults.length,
      averageTaskDuration: completedResults.length > 0 ? totalDuration / completedResults.length : 0,
    }
  }

  /**
   * Cleanup and shutdown
   */
  async cleanup(): Promise<void> {
    await structuredLogger.info('Shutting down AgentManager', 'AgentManager')

    // Cleanup all agents
    for (const agent of this.agents.values()) {
      try {
        await agent.cleanup()
      } catch (error: any) {
        await structuredLogger.error(
          `Error cleaning up agent ${agent.id}`,
          JSON.stringify({
            agentId: agent.id,
            error: error.message,
          })
        )
      }
    }

    // Cleanup guidance system
    if (this.config.enableGuidanceSystem) {
      await this.guidanceManager.cleanup()
    }

    // Clear all data
    this.agents.clear()
    this.taskQueues.clear()
    this.taskHistory.clear()

    await structuredLogger.info('AgentManager shutdown complete', 'AgentManager')
  }

  /**
   * Execute multiple tasks in parallel (compatibility method)
   */
  async executeTasksParallel(tasks: AgentTask[]): Promise<AgentTaskResult[]> {
    const promises = tasks.map(async (task) => {
      try {
        // Auto-assign to the universal agent
        return await this.executeTask('universal-agent', task)
      } catch (error: any) {
        return {
          taskId: task.id,
          agentId: 'universal-agent',
          status: 'failed' as TaskStatus,
          startTime: task.createdAt,
          endTime: new Date(),
          error: error.message,
        }
      }
    })

    return Promise.all(promises)
  }

  /**
   * List registered agents (compatibility method)
   */
  listRegisteredAgents(): { id: string; specialization: string }[] {
    return Array.from(this.agentRegistry.entries()).map(([id, entry]) => ({
      id,
      specialization: entry.metadata.specialization,
    }))
  }

  /**
   * Get metrics for dashboard
   */
  getMetrics(): {
    activeAgents: Agent[]
    activeTaskCount: number
    queueSizes: Map<string, AgentTask[]>
    taskHistory: Map<string, AgentTaskResult>
  } {
    return {
      activeAgents: Array.from(this.agents.values()),
      activeTaskCount: this.activeTaskCount,
      queueSizes: new Map(this.taskQueues),
      taskHistory: new Map(this.taskHistory),
    }
  }
}
