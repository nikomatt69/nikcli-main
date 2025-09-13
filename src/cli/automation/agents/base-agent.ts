import { ToolRegistry } from '../../tools/tool-registry'
import { CliUI } from '../../utils/cli-ui'
import type { AgentInstance, AgentStatus, AgentTask } from './agent-router'
import { type AgentEvent, EventBus, EventTypes } from './event-bus'

/**
 * Production-ready Base Agent for Multi-Agent Architecture
 * Provides common functionality for all specialized agents
 */
export abstract class BaseAgent implements AgentInstance {
  abstract id: string
  abstract capabilities: string[]
  abstract specialization: string

  // Legacy compatibility properties
  name?: string
  description?: string

  public status: AgentStatus = 'offline'
  public currentTasks: number = 0
  public maxConcurrentTasks: number = 3

  protected eventBus: EventBus
  protected toolRegistry: ToolRegistry
  protected taskHistory: TaskExecution[] = []
  protected agentMetrics: AgentMetrics

  // Enhanced properties for unified interface
  public readonly version: string = '1.1.0'
  protected memoryLimit: number = 100 // Limit task history to prevent memory leaks
  protected performanceOptimized: boolean = true
  protected batchSize: number = 5 // Process tasks in batches for better performance

  constructor(workingDirectory: string) {
    this.eventBus = EventBus.getInstance()
    this.toolRegistry = new ToolRegistry(workingDirectory)
    this.agentMetrics = {
      tasksExecuted: 0,
      tasksSucceeded: 0,
      tasksFailed: 0,
      averageExecutionTime: 0,
      totalExecutionTime: 0,
      lastActive: new Date(),
    }
  }

  /**
   * Initialize the agent
   */
  async initialize(): Promise<void> {
    try {
      CliUI.logInfo(`🤖 Initializing agent: ${this.id}`)

      // Setup event listeners
      this.setupEventListeners()

      // Perform agent-specific initialization
      await this.onInitialize()

      // Mark as available
      this.status = 'available'

      // Publish initialization event
      await this.eventBus.publish(EventTypes.AGENT_STARTED, {
        agentId: this.id,
        capabilities: this.capabilities,
        specialization: this.specialization,
      })

      CliUI.logSuccess(`✅ Agent ${this.id} initialized successfully`)
    } catch (error: any) {
      this.status = 'error'
      CliUI.logError(`❌ Failed to initialize agent ${this.id}: ${error.message}`)
      throw error
    }
  }

  /**
   * Execute a task
   */
  async executeTask(task: any): Promise<any> {
    const execution: TaskExecution = {
      taskId: task.id,
      startTime: new Date(),
      status: 'running',
    }

    this.taskHistory.push(execution)
    this.currentTasks++
    this.agentMetrics.tasksExecuted++
    this.agentMetrics.lastActive = new Date()

    try {
      CliUI.logInfo(`🎯 Agent ${this.id} executing task: ${task.type}`)

      // Validate task compatibility
      await this.validateTask(task)

      // Publish task start event
      await this.eventBus.publish(EventTypes.TASK_STARTED, {
        taskId: task.id,
        agentId: this.id,
        taskType: task.type,
      })

      // Execute the task
      const result = await this.onExecuteTask(task)

      // Update execution record
      execution.endTime = new Date()
      execution.status = 'completed'
      execution.result = result
      execution.duration = execution.endTime.getTime() - execution.startTime.getTime()

      // Update metrics
      this.agentMetrics.tasksSucceeded++
      this.updateAverageExecutionTime(execution.duration)

      // Publish completion event
      await this.eventBus.publish(EventTypes.TASK_COMPLETED, {
        taskId: task.id,
        agentId: this.id,
        result,
        duration: execution.duration,
      })

      CliUI.logSuccess(`✅ Task ${task.id} completed in ${execution.duration}ms`)

      return result
    } catch (error: any) {
      // Update execution record
      execution.endTime = new Date()
      execution.status = 'failed'
      execution.error = error.message
      execution.duration = execution.endTime.getTime() - execution.startTime.getTime()

      // Update metrics
      this.agentMetrics.tasksFailed++

      // Publish failure event
      await this.eventBus.publish(EventTypes.TASK_FAILED, {
        taskId: task.id,
        agentId: this.id,
        error: error.message,
        duration: execution.duration,
      })

      CliUI.logError(`❌ Task ${task.id} failed: ${error.message}`)
      throw error
    } finally {
      this.currentTasks = Math.max(0, this.currentTasks - 1)

      // Record task execution and manage memory
      this.recordTaskExecution(execution)

      // Update status based on current load
      if (this.currentTasks < this.maxConcurrentTasks) {
        this.status = 'available'
      }
    }
  }

  /**
   * Stop the agent
   */
  async stop(): Promise<void> {
    try {
      CliUI.logInfo(`🛑 Stopping agent: ${this.id}`)

      // Wait for current tasks to complete
      while (this.currentTasks > 0) {
        CliUI.logInfo(`⏳ Waiting for ${this.currentTasks} tasks to complete...`)
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }

      // Perform agent-specific cleanup
      await this.onStop()

      // Mark as offline
      this.status = 'offline'

      // Publish stop event
      await this.eventBus.publish(EventTypes.AGENT_STOPPED, {
        agentId: this.id,
      })

      CliUI.logSuccess(`✅ Agent ${this.id} stopped successfully`)
    } catch (error: any) {
      CliUI.logError(`❌ Failed to stop agent ${this.id}: ${error.message}`)
      throw error
    }
  }

  /**
   * Get agent metrics
   */
  getMetrics(): AgentMetrics {
    return { ...this.agentMetrics }
  }

  /**
   * Get task history
   */
  getTaskHistory(limit?: number): TaskExecution[] {
    const history = [...this.taskHistory].reverse()
    return limit ? history.slice(0, limit) : history
  }

  /**
   * Check if agent can handle a specific task type
   */
  canHandle(taskType: string): boolean {
    return (
      this.capabilities.some(
        (cap) =>
          taskType.toLowerCase().includes(cap.toLowerCase()) || cap.toLowerCase().includes(taskType.toLowerCase())
      ) || this.specialization.toLowerCase().includes(taskType.toLowerCase())
    )
  }

  /**
   * Execute a tool by name
   */
  protected async executeTool(toolName: string, ...args: any[]): Promise<any> {
    const tool = this.toolRegistry.getTool(toolName)
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`)
    }

    CliUI.logDebug(`🔧 Agent ${this.id} executing tool: ${toolName}`)

    try {
      const result = await tool.execute(...args)

      // Publish tool execution event
      await this.eventBus.publish(EventTypes.TOOL_EXECUTED, {
        agentId: this.id,
        toolName,
        args,
        result,
      })

      return result
    } catch (error: any) {
      // Publish tool failure event
      await this.eventBus.publish(EventTypes.TOOL_FAILED, {
        agentId: this.id,
        toolName,
        args,
        error: error.message,
      })

      throw error
    }
  }

  /**
   * Send a message to other agents
   */
  protected async sendMessage(targetAgentId: string, message: any): Promise<void> {
    await this.eventBus.publish(EventTypes.AGENT_MESSAGE, {
      fromAgent: this.id,
      toAgent: targetAgentId,
      message,
    })
  }

  /**
   * Broadcast a message to all agents
   */
  protected async broadcast(message: any): Promise<void> {
    await this.eventBus.publish(EventTypes.AGENT_MESSAGE, {
      fromAgent: this.id,
      toAgent: 'all',
      message,
    })
  }

  // Abstract methods to be implemented by specialized agents
  protected abstract onInitialize(): Promise<void>
  protected abstract onExecuteTask(task: AgentTask): Promise<any>
  protected abstract onStop(): Promise<void>

  // Legacy compatibility methods
  async run?(task: string): Promise<any> {
    return await this.onExecuteTask({
      id: `task_${Date.now()}`,
      type: 'legacy',
      description: 'Legacy agent task',
      priority: 'normal',
    })
  }

  async cleanup?(): Promise<void> {
    return await this.onStop()
  }

  /**
   * Validate if this agent can execute the given task
   */
  private async validateTask(task: AgentTask): Promise<void> {
    if (!this.canHandle(task.type)) {
      throw new Error(`Agent ${this.id} cannot handle task type: ${task.type}`)
    }

    if (this.currentTasks >= this.maxConcurrentTasks) {
      throw new Error(`Agent ${this.id} is at maximum capacity`)
    }

    if (this.status !== 'available' && this.status !== 'busy') {
      throw new Error(`Agent ${this.id} is not available (status: ${this.status})`)
    }
  }

  /**
   * Setup event listeners for agent communication
   */
  private setupEventListeners(): void {
    // Listen for messages directed to this agent
    this.eventBus.subscribe(EventTypes.AGENT_MESSAGE, async (event: AgentEvent) => {
      const { toAgent, fromAgent, message } = event.data

      if (toAgent === this.id || toAgent === 'all') {
        await this.onMessage(fromAgent, message)
      }
    })

    // Listen for system shutdown
    this.eventBus.subscribe(EventTypes.SYSTEM_SHUTDOWN, async () => {
      await this.stop()
    })
  }

  /**
   * Handle incoming messages from other agents
   */
  protected async onMessage(fromAgent: string, message: any): Promise<void> {
    CliUI.logDebug(`📨 Agent ${this.id} received message from ${fromAgent}:`, message)
    // Override in specialized agents to handle specific message types
  }

  /**
   * Update average execution time metric
   */
  private updateAverageExecutionTime(duration: number): void {
    this.agentMetrics.totalExecutionTime += duration
    this.agentMetrics.averageExecutionTime = this.agentMetrics.totalExecutionTime / this.agentMetrics.tasksExecuted
  }

  /**
   * Record task execution in history with memory management
   */
  private recordTaskExecution(execution: TaskExecution): void {
    this.taskHistory.push(execution)

    // Prevent memory leaks by limiting history size
    if (this.taskHistory.length > this.memoryLimit) {
      const removed = this.taskHistory.splice(0, this.taskHistory.length - this.memoryLimit)
      CliUI.logDebug(`🧹 Cleaned ${removed.length} old task records for agent ${this.id}`)
    }
  }

  /**
   * Enhanced batch processing for better performance
   */
  protected async processBatch<T>(items: T[], processor: (item: T) => Promise<any>): Promise<any[]> {
    const results = []

    for (let i = 0; i < items.length; i += this.batchSize) {
      const batch = items.slice(i, i + this.batchSize)
      const batchResults = await Promise.allSettled(batch.map((item) => processor(item)))

      results.push(
        ...batchResults.map((result) => (result.status === 'fulfilled' ? result.value : { error: result.reason }))
      )

      // Small delay between batches to prevent overwhelming
      if (i + this.batchSize < items.length) {
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
    }

    return results
  }
}

// Type definitions
export interface TaskExecution {
  taskId: string
  startTime: Date
  endTime?: Date
  duration?: number
  status: TaskExecutionStatus
  result?: any
  error?: string
}

export interface AgentMetrics {
  tasksExecuted: number
  tasksSucceeded: number
  tasksFailed: number
  averageExecutionTime: number
  totalExecutionTime: number
  lastActive: Date
  // Additional properties for UniversalAgent compatibility
  totalTasks?: number
  tasksCompleted?: number
  lastExecutionTime?: Date
}

export type TaskExecutionStatus = 'running' | 'completed' | 'failed' | 'cancelled'

// Additional interfaces for UniversalAgent compatibility
export interface AgentTaskResult {
  success: boolean
  message: string
  data?: any
  executionTime: number
  metadata?: Record<string, any>
}
