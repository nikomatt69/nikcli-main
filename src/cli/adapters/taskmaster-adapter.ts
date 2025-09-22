import { EventEmitter } from 'node:events'
import chalk from 'chalk'
import { nanoid } from 'nanoid'
import type { ExecutionPlan, PlanTodo, ExecutionStep, PlanExecutionResult, StepExecutionResult } from '../planning/types'
import type { AgentTodo, AgentWorkPlan } from '../core/agent-todo-manager'
import type { SessionTodo } from '../store/todo-store'
import type { TaskMasterPlan, TaskMasterExecutionResult, TaskMasterService } from '../services/taskmaster-service'

/**
 * TaskMaster Adapter
 * Bridges NikCLI's existing planning interfaces with TaskMaster capabilities
 * Maintains backward compatibility while enabling advanced features
 */
export class TaskMasterAdapter extends EventEmitter {
  private taskMasterService: TaskMasterService
  private legacySupport = true
  private initialized = false
  private eventListenersAttached = false

  constructor(taskMasterService: TaskMasterService) {
    super()

    try {
      // Validate constructor parameters
      if (!taskMasterService) {
        throw new Error('TaskMasterService is required')
      }

      this.taskMasterService = taskMasterService
      this.initialized = true

      // Forward TaskMaster events with error handling
      this.setupEventForwarding()

    } catch (error) {
      console.error('Failed to initialize TaskMasterAdapter:', error)
      throw error
    }
  }

  private setupEventForwarding(): void {
    try {
      if (this.eventListenersAttached) {
        return // Already attached
      }

      // Forward TaskMaster events with error handling
      this.taskMasterService.on('initialized', () => {
        try {
          this.emit('initialized')
        } catch (error) {
          console.error('Error emitting initialized event:', error)
        }
      })

      this.taskMasterService.on('fallback', () => {
        try {
          this.emit('fallback')
        } catch (error) {
          console.error('Error emitting fallback event:', error)
        }
      })

      this.taskMasterService.on('planUpdated', (data) => {
        try {
          this.emit('planUpdated', data)
        } catch (error) {
          console.error('Error emitting planUpdated event:', error)
        }
      })

      this.eventListenersAttached = true

    } catch (error) {
      console.error('Failed to setup event forwarding:', error)
    }
  }

  /**
   * Convert NikCLI ExecutionPlan to TaskMaster format
   */
  toTaskMasterPlan(executionPlan: ExecutionPlan): TaskMasterPlan {
    try {
      // Validate input
      if (!executionPlan) {
        throw new Error('ExecutionPlan is required')
      }

      if (!executionPlan.id || !executionPlan.title) {
        throw new Error('ExecutionPlan must have id and title')
      }

      if (!executionPlan.steps || !Array.isArray(executionPlan.steps)) {
        throw new Error('ExecutionPlan must have valid steps array')
      }

      // Convert steps to todos with error handling
      const todos: PlanTodo[] = []
      for (let i = 0; i < executionPlan.steps.length; i++) {
        try {
          const todo = this.stepToTodo(executionPlan.steps[i])
          todos.push(todo)
        } catch (stepError) {
          console.warn(`Error converting step ${i} to todo:`, stepError)
          // Continue with other steps
        }
      }

      // Validate required context
      const userRequest = executionPlan.context?.userRequest || 'Unknown request'

      return {
        id: executionPlan.id,
        title: executionPlan.title,
        description: executionPlan.description || '',
        userRequest,
        todos,
        status: this.mapExecutionStatus(executionPlan.status),
        createdAt: executionPlan.createdAt || new Date(),
        estimatedDuration: executionPlan.estimatedTotalDuration || 0,
        riskAssessment: {
          overallRisk: executionPlan.riskAssessment?.overallRisk || 'low',
          destructiveOperations: executionPlan.riskAssessment?.destructiveOperations || 0,
          fileModifications: executionPlan.riskAssessment?.fileModifications || 0,
          externalCalls: executionPlan.riskAssessment?.externalCalls || 0,
        },
      }

    } catch (error) {
      console.error('Error converting ExecutionPlan to TaskMaster format:', error)
      throw new Error(`Failed to convert ExecutionPlan: ${error}`)
    }
  }

  /**
   * Convert TaskMaster plan to NikCLI ExecutionPlan
   */
  toExecutionPlan(taskMasterPlan: TaskMasterPlan): ExecutionPlan {
    try {
      // Validate input
      if (!taskMasterPlan) {
        throw new Error('TaskMasterPlan is required')
      }

      if (!taskMasterPlan.id || !taskMasterPlan.title) {
        throw new Error('TaskMasterPlan must have id and title')
      }

      if (!taskMasterPlan.todos || !Array.isArray(taskMasterPlan.todos)) {
        throw new Error('TaskMasterPlan must have valid todos array')
      }

      // Convert todos to steps with error handling
      const steps: ExecutionStep[] = []
      for (let i = 0; i < taskMasterPlan.todos.length; i++) {
        try {
          const step = this.todoToStep(taskMasterPlan.todos[i])
          steps.push(step)
        } catch (todoError) {
          console.warn(`Error converting todo ${i} to step:`, todoError)
          // Continue with other todos
        }
      }

      // Get project path safely
      let projectPath: string
      try {
        projectPath = process.cwd()
      } catch (cwdError) {
        console.warn('Could not get current working directory:', cwdError)
        projectPath = '/'
      }

      return {
        id: taskMasterPlan.id,
        title: taskMasterPlan.title,
        description: taskMasterPlan.description || '',
        steps,
        todos: taskMasterPlan.todos,
        status: this.mapTaskMasterStatus(taskMasterPlan.status),
        estimatedTotalDuration: taskMasterPlan.estimatedDuration || 0,
        riskAssessment: taskMasterPlan.riskAssessment || {
          overallRisk: 'low' as const,
          destructiveOperations: 0,
          fileModifications: 0,
          externalCalls: 0
        },
        createdAt: taskMasterPlan.createdAt || new Date(),
        createdBy: 'taskmaster-adapter',
        context: {
          userRequest: taskMasterPlan.userRequest || 'Unknown request',
          projectPath,
          reasoning: 'Generated via TaskMaster AI',
        },
      }

    } catch (error) {
      console.error('Error converting TaskMasterPlan to ExecutionPlan:', error)
      throw new Error(`Failed to convert TaskMasterPlan: ${error}`)
    }
  }

  /**
   * Convert SessionTodo to TaskMaster format
   */
  sessionTodoToTaskMaster(sessionTodo: SessionTodo): PlanTodo {
    try {
      if (!sessionTodo) {
        throw new Error('SessionTodo is required')
      }

      if (!sessionTodo.id) {
        throw new Error('SessionTodo must have an id')
      }

      return {
        id: sessionTodo.id,
        title: sessionTodo.content || 'Untitled task',
        description: sessionTodo.content || 'No description',
        status: this.mapSessionStatus(sessionTodo.status),
        priority: this.mapSessionPriority(sessionTodo.priority || 'medium'),
        createdAt: new Date(),
        updatedAt: new Date(),
        progress: Math.max(0, Math.min(100, sessionTodo.progress || 0)),
      }

    } catch (error) {
      console.error('Error converting SessionTodo to TaskMaster format:', error)
      // Return a safe fallback
      return {
        id: sessionTodo?.id || 'error',
        title: 'Error converting task',
        description: 'Original task could not be converted',
        status: 'pending' as const,
        priority: 'medium' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        progress: 0,
      }
    }
  }

  /**
   * Convert TaskMaster todo to SessionTodo
   */
  taskMasterToSessionTodo(planTodo: PlanTodo): SessionTodo {
    try {
      if (!planTodo) {
        throw new Error('PlanTodo is required')
      }

      return {
        id: planTodo.id,
        content: planTodo.title || 'Untitled task',
        status: this.mapTodoStatus(planTodo.status) || 'pending',
        priority: this.mapTodoPriority(planTodo.priority) || 'medium',
        progress: Math.max(0, Math.min(100, planTodo.progress || 0)),
      }

    } catch (error) {
      console.error('Error converting TaskMaster todo to SessionTodo:', error)
      // Return a safe fallback
      return {
        id: planTodo?.id || 'error',
        content: 'Error converting task',
        status: 'pending',
        priority: 'medium',
        progress: 0,
      }
    }
  }

  /**
   * Convert AgentTodo to TaskMaster format
   */
  agentTodoToTaskMaster(agentTodo: AgentTodo): PlanTodo {
    return {
      id: agentTodo.id,
      title: agentTodo.title,
      description: agentTodo.description,
      status: this.mapAgentStatus(agentTodo.status),
      priority: this.mapAgentPriority(agentTodo.priority),
      assignedAgent: agentTodo.agentId,
      createdAt: agentTodo.createdAt,
      updatedAt: agentTodo.updatedAt,
      estimatedDuration: agentTodo.estimatedDuration,
      actualDuration: agentTodo.actualDuration,
      progress: agentTodo.progress || 0,
      reasoning: agentTodo.context?.reasoning,
      tools: agentTodo.tags,
    }
  }

  /**
   * Convert TaskMaster todo to AgentTodo
   */
  taskMasterToAgentTodo(planTodo: PlanTodo, agentId: string): AgentTodo {
    return {
      id: planTodo.id,
      agentId: planTodo.assignedAgent || agentId,
      title: planTodo.title,
      description: planTodo.description,
      status: this.mapTodoToAgentStatus(planTodo.status),
      priority: this.mapTodoToAgentPriority(planTodo.priority),
      createdAt: planTodo.createdAt,
      updatedAt: planTodo.updatedAt,
      estimatedDuration: planTodo.estimatedDuration,
      actualDuration: planTodo.actualDuration,
      tags: planTodo.tools || [],
      progress: planTodo.progress,
      context: {
        reasoning: planTodo.reasoning,
      },
    }
  }

  /**
   * Convert AgentWorkPlan to TaskMaster format
   */
  workPlanToTaskMaster(workPlan: AgentWorkPlan): TaskMasterPlan {
    const todos = workPlan.todos.map(todo => this.agentTodoToTaskMaster(todo))

    return {
      id: workPlan.id,
      title: workPlan.goal,
      description: workPlan.goal,
      userRequest: workPlan.goal,
      todos,
      status: this.mapWorkPlanStatus(workPlan.status),
      createdAt: workPlan.createdAt,
      estimatedDuration: workPlan.estimatedTimeTotal,
      riskAssessment: {
        overallRisk: 'medium',
        destructiveOperations: 0,
        fileModifications: todos.length,
        externalCalls: 0,
      },
    }
  }

  /**
   * Convert TaskMaster execution result to NikCLI format
   */
  toExecutionResult(taskMasterResult: TaskMasterExecutionResult): PlanExecutionResult {
    const stepResults: StepExecutionResult[] = taskMasterResult.results.map(result => ({
      stepId: result.taskId,
      status: result.status === 'success' ? 'success' : 'failure',
      output: result.output,
      error: result.error ? new Error(result.error) : undefined,
      duration: result.duration,
      timestamp: new Date(),
    }))

    return {
      planId: taskMasterResult.planId,
      status: taskMasterResult.status,
      startTime: taskMasterResult.startTime,
      endTime: taskMasterResult.endTime,
      stepResults,
      summary: {
        totalSteps: taskMasterResult.summary.totalTasks,
        successfulSteps: taskMasterResult.summary.completedTasks,
        failedSteps: taskMasterResult.summary.failedTasks,
        skippedSteps: 0,
      },
    }
  }

  /**
   * Create enhanced plan using TaskMaster
   */
  async createEnhancedPlan(userRequest: string, context?: any): Promise<ExecutionPlan> {
    try {
      const taskMasterPlan = await this.taskMasterService.createPlan(userRequest, context)
      const executionPlan = this.toExecutionPlan(taskMasterPlan)

      // Show the compact panel with todos immediately after plan creation
      await this.showCompactPanel(executionPlan)

      return executionPlan
    } catch (error: any) {
      console.log(chalk.yellow(`⚠️ Enhanced planning failed: ${error.message}`))
      throw error
    }
  }

  /**
   * Show compact panel with todos from the execution plan
   */
  private async showCompactPanel(plan: ExecutionPlan): Promise<void> {
    try {
      const { advancedUI } = await import('../ui/advanced-cli-ui')

      // Format todos for the dashboard with proper mapping
      const todoItems = (plan.todos || []).map((todo: any) => ({
        content: todo.title || todo.description || todo.content || 'Untitled task',
        title: todo.title || todo.description || todo.content || 'Untitled task',
        status: (todo.status || 'pending').toLowerCase(),
        priority: (todo.priority || 'medium').toLowerCase(),
        progress: typeof todo.progress === 'number' ? Math.max(0, Math.min(100, todo.progress)) : 0,
      }))

      // Show the compact panel with description
      if (typeof advancedUI.showTodoDashboard === 'function') {
        advancedUI.showTodoDashboard(
          todoItems,
          plan.title || 'TaskMaster Plan',
          plan.description || 'AI-generated plan for task execution'
        )
      }

    } catch (error: any) {
      // Fallback: just log the error, don't throw to avoid breaking plan creation
      console.log(chalk.gray(`ℹ️ Could not show compact panel: ${error.message}`))
    }
  }

  /**
   * Execute plan with TaskMaster engine
   */
  async executeEnhancedPlan(planId: string): Promise<PlanExecutionResult> {
    try {
      const taskMasterResult = await this.taskMasterService.executePlan(planId)
      return this.toExecutionResult(taskMasterResult)
    } catch (error: any) {
      console.log(chalk.yellow(`⚠️ Enhanced execution failed: ${error.message}`))
      throw error
    }
  }

  /**
   * Sync todos between different systems
   */
  async syncTodos(sessionTodos: SessionTodo[], agentTodos: AgentTodo[]): Promise<{
    unified: PlanTodo[]
    conflicts: string[]
  }> {
    const unified: PlanTodo[] = []
    const conflicts: string[] = []

    // Convert session todos
    sessionTodos.forEach(sessionTodo => {
      unified.push(this.sessionTodoToTaskMaster(sessionTodo))
    })

    // Convert agent todos, checking for conflicts
    agentTodos.forEach(agentTodo => {
      const existing = unified.find(todo => todo.id === agentTodo.id)
      if (existing) {
        conflicts.push(`Todo conflict: ${agentTodo.id} exists in both session and agent systems`)
      } else {
        unified.push(this.agentTodoToTaskMaster(agentTodo))
      }
    })

    return { unified, conflicts }
  }

  // Status mapping methods
  private mapExecutionStatus(status: 'pending' | 'running' | 'completed' | 'failed'): 'pending' | 'running' | 'completed' | 'failed' {
    return status // Direct mapping
  }

  private mapTaskMasterStatus(status: 'pending' | 'running' | 'completed' | 'failed'): 'pending' | 'running' | 'completed' | 'failed' {
    return status // Direct mapping
  }

  private mapSessionStatus(status: string): 'pending' | 'in_progress' | 'completed' | 'failed' {
    switch (status) {
      case 'pending': return 'pending'
      case 'in_progress': return 'in_progress'
      case 'completed': return 'completed'
      case 'failed': return 'failed'
      default: return 'pending'
    }
  }

  private mapTodoStatus(status: 'pending' | 'in_progress' | 'completed' | 'failed'): string {
    return status // Direct mapping
  }

  private mapAgentStatus(status: 'planning' | 'in_progress' | 'completed' | 'failed' | 'blocked'): 'pending' | 'in_progress' | 'completed' | 'failed' {
    switch (status) {
      case 'planning': return 'pending'
      case 'blocked': return 'pending'
      default: return status as any
    }
  }

  private mapTodoToAgentStatus(status: 'pending' | 'in_progress' | 'completed' | 'failed'): 'planning' | 'in_progress' | 'completed' | 'failed' | 'blocked' {
    switch (status) {
      case 'pending': return 'planning'
      default: return status as any
    }
  }

  private mapWorkPlanStatus(status: 'planning' | 'executing' | 'completed' | 'failed'): 'pending' | 'running' | 'completed' | 'failed' {
    switch (status) {
      case 'planning': return 'pending'
      case 'executing': return 'running'
      default: return status as any
    }
  }

  // Priority mapping methods
  private mapSessionPriority(priority: string): 'low' | 'medium' | 'high' {
    switch (priority.toLowerCase()) {
      case 'high': return 'high'
      case 'low': return 'low'
      default: return 'medium'
    }
  }

  private mapTodoPriority(priority: 'low' | 'medium' | 'high'): string {
    return priority // Direct mapping
  }

  private mapAgentPriority(priority: 'low' | 'medium' | 'high' | 'critical'): 'low' | 'medium' | 'high' {
    switch (priority) {
      case 'critical': return 'high'
      default: return priority as any
    }
  }

  private mapTodoToAgentPriority(priority: 'low' | 'medium' | 'high'): 'low' | 'medium' | 'high' | 'critical' {
    return priority as any // Direct mapping, no critical in TaskMaster
  }

  // Helper conversion methods
  private stepToTodo(step: ExecutionStep): PlanTodo {
    return {
      id: step.id,
      title: step.title,
      description: step.description,
      status: 'pending',
      priority: this.riskToPriority(step.riskLevel),
      createdAt: new Date(),
      updatedAt: new Date(),
      estimatedDuration: Math.round((step.estimatedDuration || 5000) / 1000 / 60), // Convert ms to minutes
      progress: 0,
      tools: step.toolName ? [step.toolName] : [],
    }
  }

  private todoToStep(todo: PlanTodo): ExecutionStep {
    return {
      id: todo.id,
      type: 'tool',
      title: todo.title,
      description: todo.description,
      estimatedDuration: (todo.estimatedDuration || 5) * 60 * 1000, // Convert minutes to ms
      riskLevel: this.priorityToRisk(todo.priority),
      reversible: true,
      toolName: todo.tools?.[0],
    }
  }

  private riskToPriority(risk: 'low' | 'medium' | 'high'): 'low' | 'medium' | 'high' {
    return risk // Direct mapping
  }

  private priorityToRisk(priority: 'low' | 'medium' | 'high'): 'low' | 'medium' | 'high' {
    return priority // Direct mapping
  }

  /**
   * Check if TaskMaster is available and initialized
   */
  isTaskMasterAvailable(): boolean {
    return this.taskMasterService && (this.taskMasterService as any).initialized
  }


  /**
   * Enable or disable legacy support
   */
  setLegacySupport(enabled: boolean): void {
    this.legacySupport = enabled
    console.log(chalk.cyan(`🔄 Legacy support ${enabled ? 'enabled' : 'disabled'}`))
  }

  /**
   * Get adapter statistics
   */
  getAdapterStats(): AdapterStats {
    try {
      let activePlans = 0
      try {
        activePlans = this.taskMasterService.listPlans?.()?.length || 0
      } catch (listError) {
        console.warn('Could not get active plans count:', listError)
      }

      return {
        taskMasterAvailable: this.isTaskMasterAvailable(),
        legacySupport: this.legacySupport,
        activePlans,
        adapterVersion: '1.0.0',
        initialized: this.initialized,
        eventListenersAttached: this.eventListenersAttached,
      }
    } catch (error) {
      console.error('Error getting adapter stats:', error)
      return {
        taskMasterAvailable: false,
        legacySupport: this.legacySupport,
        activePlans: 0,
        adapterVersion: '1.0.0',
        initialized: this.initialized,
        eventListenersAttached: this.eventListenersAttached,
      }
    }
  }

  /**
   * Cleanup and destroy the adapter
   */
  destroy(): void {
    try {
      this.log('Destroying TaskMasterAdapter')

      // Remove all event listeners
      this.removeAllListeners()

      // Clean up event forwarding
      this.eventListenersAttached = false

      // Reset state
      this.initialized = false

      this.log('TaskMasterAdapter destroyed successfully')

    } catch (error) {
      console.error('Error during TaskMasterAdapter cleanup:', error)
    }
  }

  private log(message: string, data?: any): void {
    if (this.legacySupport) {
      console.log(`[TaskMasterAdapter] ${message}`, data || '')
    }
  }
}

export interface AdapterStats {
  taskMasterAvailable: boolean
  legacySupport: boolean
  activePlans: number
  adapterVersion: string
  initialized: boolean
  eventListenersAttached: boolean
}

// Export adapter instance factory
export function createTaskMasterAdapter(taskMasterService: TaskMasterService): TaskMasterAdapter {
  return new TaskMasterAdapter(taskMasterService)
}