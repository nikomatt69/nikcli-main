/**
 * NikCLI SDK Agent Manager
 * Core agent management and orchestration for TTY applications
 */

import { EventEmitter } from 'node:events'
import { nanoid } from 'nanoid'
import type {
  AgentConfig,
  AgentTask,
  AgentTaskResult,
  AgentStatus,
  AgentMetrics,
  AgentEvent,
  EventHandler,
  AgentRegistry,
  ToolRegistry,
  CreateAgentTask,
  UpdateAgentTask,
} from '../types'

/**
 * Agent Manager Class
 * Manages agent lifecycle, task execution, and coordination
 */
export class AgentManager extends EventEmitter {
  private agents = new Map<string, AgentConfig>()
  private taskQueues = new Map<string, AgentTask[]>()
  private taskHistory = new Map<string, AgentTaskResult>()
  private agentRegistry: AgentRegistry
  private toolRegistry: ToolRegistry
  private activeTaskCount = 0
  private maxConcurrentTasks: number

  constructor(config: { maxConcurrentTasks?: number } = {}) {
    super()
    this.maxConcurrentTasks = config.maxConcurrentTasks || 5
    this.agentRegistry = this.createAgentRegistry()
    this.toolRegistry = this.createToolRegistry()
    this.setupEventHandlers()
  }

  /**
   * Register an agent in the system
   */
  async registerAgent(agent: AgentConfig): Promise<void> {
    // Validate agent configuration
    if (!agent.id || !agent.name || !agent.specialization) {
      throw new Error('Agent must have id, name, and specialization')
    }

    // Check if agent already exists
    if (this.agents.has(agent.id)) {
      throw new Error(`Agent with id ${agent.id} already exists`)
    }

    // Initialize agent
    this.agents.set(agent.id, agent)
    this.taskQueues.set(agent.id, [])

    // Emit registration event
    this.emit('agent.registered', {
      id: nanoid(),
      type: 'agent.initialized',
      agentId: agent.id,
      timestamp: new Date(),
      data: { agent },
    } as AgentEvent)

    this.emit('agent.initialized', agent)
  }

  /**
   * Get an agent by ID
   */
  getAgent(agentId: string): AgentConfig | undefined {
    return this.agents.get(agentId)
  }

  /**
   * List all registered agents
   */
  listAgents(): AgentConfig[] {
    return Array.from(this.agents.values())
  }

  /**
   * Get agents by capability
   */
  getAgentsByCapability(capability: string): AgentConfig[] {
    return Array.from(this.agents.values()).filter(agent =>
      agent.capabilities.some(cap => cap.name === capability)
    )
  }

  /**
   * Find the best agent for a task
   */
  findBestAgentForTask(task: AgentTask): AgentConfig | null {
    let bestAgent: AgentConfig | null = null
    let bestScore = 0

    for (const agent of this.agents.values()) {
      if (!this.canAgentHandleTask(agent, task)) {
        continue
      }

      // Calculate score based on capabilities match
      let score = 0

      // Check required capabilities
      if (task.requiredCapabilities) {
        const matchingCapabilities = task.requiredCapabilities.filter(cap =>
          agent.capabilities.some(agentCap => agentCap.name === cap)
        )
        score += matchingCapabilities.length * 10
      }

      // Prefer agents with better performance scores
      const avgPerformance = agent.capabilities.reduce((sum, cap) => sum + cap.performanceScore, 0) / agent.capabilities.length
      score += avgPerformance * 0.1

      if (score > bestScore) {
        bestScore = score
        bestAgent = agent
      }
    }

    return bestAgent
  }

  /**
   * Check if agent can handle a task
   */
  private canAgentHandleTask(agent: AgentConfig, task: AgentTask): boolean {
    if (!task.requiredCapabilities) {
      return true
    }

    return task.requiredCapabilities.every(cap =>
      agent.capabilities.some(agentCap => agentCap.name === cap && agentCap.isActive)
    )
  }

  /**
   * Schedule a task for execution
   */
  async scheduleTask(task: CreateAgentTask, preferredAgentId?: string): Promise<string> {
    const fullTask: AgentTask = {
      ...task,
      id: nanoid(),
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'pending',
      progress: 0,
    }

    let agent: AgentConfig | null = null

    // Use preferred agent if specified
    if (preferredAgentId) {
      agent = this.getAgent(preferredAgentId)
      if (!agent || !this.canAgentHandleTask(agent, fullTask)) {
        throw new Error(`Preferred agent ${preferredAgentId} cannot handle this task`)
      }
    } else {
      // Find best agent automatically
      agent = this.findBestAgentForTask(fullTask)
      if (!agent) {
        throw new Error('No suitable agent available for this task')
      }
    }

    // Add to agent's task queue
    const queue = this.taskQueues.get(agent.id) || []
    queue.push(fullTask)
    this.taskQueues.set(agent.id, queue)

    // Start execution if agent is available
    if (this.activeTaskCount < this.maxConcurrentTasks) {
      setImmediate(() => {
        this.processAgentQueue(agent!.id).catch(error => {
          this.emit('error.occurred', {
            id: nanoid(),
            type: 'error.occurred',
            agentId: agent!.id,
            timestamp: new Date(),
            data: { error: error.message, taskId: fullTask.id },
          } as AgentEvent)
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

    if (!this.canAgentHandleTask(agent, task)) {
      throw new Error(`Agent ${agentId} cannot handle this task`)
    }

    // Setup timeout controller
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      this.activeTaskCount++
      task.status = 'in_progress'
      task.startedAt = new Date()

      // Emit task started event
      this.emit('task.started', {
        id: nanoid(),
        type: 'task.started',
        agentId,
        timestamp: new Date(),
        data: { task },
      } as AgentEvent)

      // Simulate task execution (in real implementation, this would call the actual agent)
      const result = await this.simulateTaskExecution(agent, task, controller.signal)

      clearTimeout(timeoutId)

      // Store result
      this.taskHistory.set(task.id, result)

      // Emit task completed event
      this.emit('task.completed', {
        id: nanoid(),
        type: 'task.completed',
        agentId,
        timestamp: new Date(),
        data: { task, result },
      } as AgentEvent)

      return result
    } catch (error: any) {
      clearTimeout(timeoutId)

      const result: AgentTaskResult = {
        taskId: task.id,
        agentId,
        status: 'failed',
        startTime: task.startedAt!,
        endTime: new Date(),
        error: error.message,
        errorDetails: error,
      }

      this.taskHistory.set(task.id, result)

      // Emit task failed event
      this.emit('task.failed', {
        id: nanoid(),
        type: 'task.failed',
        agentId,
        timestamp: new Date(),
        data: { task, error: error.message },
      } as AgentEvent)

      throw error
    } finally {
      this.activeTaskCount--
    }
  }

  /**
   * Simulate task execution (placeholder for real implementation)
   */
  private async simulateTaskExecution(
    agent: AgentConfig,
    task: AgentTask,
    signal: AbortSignal
  ): Promise<AgentTaskResult> {
    // Simulate work based on task type
    const duration = task.estimatedDuration || 1000
    const steps = Math.max(1, Math.floor(duration / 100))

    for (let i = 0; i < steps; i++) {
      if (signal.aborted) {
        throw new Error('Task aborted')
      }

      // Update progress
      task.progress = Math.round((i / steps) * 100)
      task.updatedAt = new Date()

      // Emit progress event
      this.emit('task.progress', {
        id: nanoid(),
        type: 'task.progress',
        agentId: agent.id,
        timestamp: new Date(),
        data: { task, progress: task.progress },
      } as AgentEvent)

      // Simulate work
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    const endTime = new Date()
    const duration = endTime.getTime() - task.startedAt!.getTime()

    return {
      taskId: task.id,
      agentId: agent.id,
      status: 'completed',
      result: { message: `Task ${task.title} completed successfully` },
      output: `Agent ${agent.name} completed: ${task.description}`,
      startTime: task.startedAt!,
      endTime,
      duration,
      tokensUsed: Math.floor(Math.random() * 1000),
      toolsUsed: ['simulation'],
    }
  }

  /**
   * Process task queue for a specific agent
   */
  private async processAgentQueue(agentId: string): Promise<void> {
    const agent = this.getAgent(agentId)
    const queue = this.taskQueues.get(agentId)

    if (!agent || !queue || queue.length === 0) {
      return
    }

    while (queue.length > 0 && this.activeTaskCount < this.maxConcurrentTasks) {
      const task = queue.shift()!
      await this.executeTask(agentId, task)
    }
  }

  /**
   * Update a task
   */
  async updateTask(taskId: string, updates: UpdateAgentTask): Promise<void> {
    // Find task in queues
    for (const queue of this.taskQueues.values()) {
      const task = queue.find(t => t.id === taskId)
      if (task) {
        Object.assign(task, updates)
        task.updatedAt = new Date()
        return
      }
    }

    throw new Error(`Task not found: ${taskId}`)
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string): Promise<void> {
    // Find and remove task from queues
    for (const queue of this.taskQueues.values()) {
      const index = queue.findIndex(t => t.id === taskId)
      if (index !== -1) {
        const task = queue.splice(index, 1)[0]
        task.status = 'cancelled'
        task.updatedAt = new Date()
        return
      }
    }

    throw new Error(`Task not found: ${taskId}`)
  }

  /**
   * Get task history
   */
  getTaskHistory(): AgentTaskResult[] {
    return Array.from(this.taskHistory.values())
  }

  /**
   * Get agent metrics
   */
  getAgentMetrics(agentId: string): AgentMetrics | null {
    const agent = this.getAgent(agentId)
    if (!agent) return null

    const results = Array.from(this.taskHistory.values()).filter(r => r.agentId === agentId)
    const completed = results.filter(r => r.status === 'completed')
    const failed = results.filter(r => r.status === 'failed')

    const totalExecutionTime = completed.reduce((sum, r) => sum + (r.duration || 0), 0)
    const averageExecutionTime = completed.length > 0 ? totalExecutionTime / completed.length : 0

    return {
      tasksExecuted: results.length,
      tasksSucceeded: completed.length,
      tasksFailed: failed.length,
      tasksInProgress: 0, // Would need to track active tasks
      averageExecutionTime,
      totalExecutionTime,
      successRate: results.length > 0 ? completed.length / results.length : 0,
      tokensConsumed: completed.reduce((sum, r) => sum + (r.tokensUsed || 0), 0),
      apiCallsTotal: completed.length,
      lastActive: new Date(),
      uptime: 0, // Would need to track agent uptime
      productivity: completed.length / 24, // Tasks per hour (simplified)
      accuracy: completed.length > 0 ? completed.length / results.length : 0,
    }
  }

  /**
   * Get system statistics
   */
  getStats() {
    const agents = Array.from(this.agents.values())
    const results = Array.from(this.taskHistory.values())

    return {
      totalAgents: agents.length,
      activeAgents: agents.length, // Simplified
      totalTasks: results.length,
      pendingTasks: Array.from(this.taskQueues.values()).reduce((sum, queue) => sum + queue.length, 0),
      completedTasks: results.filter(r => r.status === 'completed').length,
      failedTasks: results.filter(r => r.status === 'failed').length,
      averageTaskDuration: results.length > 0
        ? results.reduce((sum, r) => sum + (r.duration || 0), 0) / results.length
        : 0,
    }
  }

  /**
   * Create agent registry
   */
  private createAgentRegistry(): AgentRegistry {
    const registry = new Map<string, { factory: any; metadata: Partial<AgentConfig> }>()

    return {
      register: (factory, metadata) => {
        const id = metadata.id || nanoid()
        registry.set(id, { factory, metadata })
      },
      unregister: (id) => registry.delete(id),
      get: (id) => registry.get(id)?.factory,
      list: () => Array.from(registry.entries()).map(([id, { factory, metadata }]) => ({
        id,
        factory,
        metadata,
      })),
      create: (id, config) => {
        const entry = registry.get(id)
        if (!entry) {
          throw new Error(`Agent factory not found: ${id}`)
        }
        return entry.factory({ ...entry.metadata, ...config })
      },
    }
  }

  /**
   * Create tool registry
   */
  private createToolRegistry(): ToolRegistry {
    const registry = new Map<string, any>()

    return {
      register: (tool) => registry.set(tool.name, tool),
      unregister: (name) => registry.delete(name),
      get: (name) => registry.get(name),
      list: () => Array.from(registry.values()),
    }
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.on('agent.registered', (event: AgentEvent) => {
      console.log(`Agent registered: ${event.data.agent.name}`)
    })

    this.on('task.completed', (event: AgentEvent) => {
      console.log(`Task completed: ${event.data.task.title}`)
    })

    this.on('task.failed', (event: AgentEvent) => {
      console.error(`Task failed: ${event.data.task.title} - ${event.data.error}`)
    })
  }

  /**
   * Add event listener
   */
  addEventListener<T = unknown>(event: string, handler: EventHandler<T>): void {
    this.on(event, handler)
  }

  /**
   * Remove event listener
   */
  removeEventListener<T = unknown>(event: string, handler: EventHandler<T>): void {
    this.off(event, handler)
  }

  /**
   * Cleanup and shutdown
   */
  async cleanup(): Promise<void> {
    // Clear all data
    this.agents.clear()
    this.taskQueues.clear()
    this.taskHistory.clear()

    // Remove all listeners
    this.removeAllListeners()
  }
}
