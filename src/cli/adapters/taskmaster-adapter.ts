import { EventEmitter } from 'node:events'
import chalk from 'chalk'
import type { AgentTodo, AgentWorkPlan } from '../core/agent-todo-manager'
import type {
  ExecutionPlan,
  ExecutionStep,
  PlanExecutionResult,
  PlanTodo,
  StepExecutionResult,
} from '../planning/types'
import type { TaskMasterExecutionResult, TaskMasterPlan, TaskMasterService } from '../services/taskmaster-service'
import type { SessionTodo, TodoPriority, TodoStatus } from '../store/todo-store'

/**
 * TaskMaster Adapter
 * Bridges NikCLI's existing planning interfaces with TaskMaster capabilities
 * Maintains backward compatibility while enabling advanced features
 */
export class TaskMasterAdapter extends EventEmitter {
  private taskMasterService: TaskMasterService
  private legacySupport = true

  constructor(taskMasterService: TaskMasterService) {
    super()
    this.taskMasterService = taskMasterService

    // Forward TaskMaster events
    this.taskMasterService.on('initialized', () => this.emit('initialized'))
    this.taskMasterService.on('fallback', () => this.emit('fallback'))
    this.taskMasterService.on('planUpdated', (data) => this.emit('planUpdated', data))
  }

  /**
   * Convert NikCLI ExecutionPlan to TaskMaster format
   */
  toTaskMasterPlan(executionPlan: ExecutionPlan): TaskMasterPlan {
    const todos: PlanTodo[] = executionPlan.steps.map((step) => this.stepToTodo(step))

    return {
      id: executionPlan.id,
      title: executionPlan.title,
      description: executionPlan.description,
      userRequest: executionPlan.context.userRequest,
      todos,
      status: this.mapExecutionStatus(executionPlan.status),
      createdAt: executionPlan.createdAt,
      estimatedDuration: executionPlan.estimatedTotalDuration,
      riskAssessment: {
        overallRisk: executionPlan.riskAssessment.overallRisk,
        destructiveOperations: executionPlan.riskAssessment.destructiveOperations,
        fileModifications: executionPlan.riskAssessment.fileModifications,
        externalCalls: executionPlan.riskAssessment.externalCalls,
      },
    }
  }

  /**
   * Convert TaskMaster plan to NikCLI ExecutionPlan
   */
  toExecutionPlan(taskMasterPlan: TaskMasterPlan): ExecutionPlan {
    const steps: ExecutionStep[] = taskMasterPlan.todos.map((todo) => this.todoToStep(todo))

    return {
      id: taskMasterPlan.id,
      title: taskMasterPlan.title,
      description: taskMasterPlan.description,
      steps,
      todos: taskMasterPlan.todos,
      status: this.mapTaskMasterStatus(taskMasterPlan.status),
      estimatedTotalDuration: taskMasterPlan.estimatedDuration,
      riskAssessment: taskMasterPlan.riskAssessment,
      createdAt: taskMasterPlan.createdAt,
      createdBy: 'taskmaster-adapter',
      context: {
        userRequest: taskMasterPlan.userRequest,
        projectPath: process.cwd(),
        reasoning: 'Generated via TaskMaster AI',
      },
    }
  }

  /**
   * Convert SessionTodo to TaskMaster format
   */
  sessionTodoToTaskMaster(sessionTodo: SessionTodo): PlanTodo {
    return {
      id: sessionTodo.id,
      title: sessionTodo.content,
      description: sessionTodo.content,
      status: this.mapSessionStatus(sessionTodo.status),
      priority: this.mapSessionPriority(sessionTodo.priority),
      createdAt: new Date(),
      updatedAt: new Date(),
      progress: sessionTodo.progress || 0,
    }
  }

  /**
   * Convert TaskMaster todo to SessionTodo
   */
  taskMasterToSessionTodo(planTodo: PlanTodo): SessionTodo {
    return {
      id: planTodo.id,
      content: planTodo.title,
      status: this.mapTodoStatus(planTodo.status as 'pending' | 'in_progress' | 'completed' | 'failed') as TodoStatus,
      priority: this.mapTodoPriority(planTodo.priority as 'low' | 'medium' | 'high') as TodoPriority,
      progress: planTodo.progress,
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
      status: this.mapTodoToAgentStatus(planTodo.status as any) as any,
      priority: this.mapTodoToAgentPriority(planTodo.priority as any) as any,
      createdAt: planTodo.createdAt,
      updatedAt: planTodo.updatedAt,
      estimatedDuration: planTodo.estimatedDuration,
      actualDuration: planTodo.actualDuration,
      tags: planTodo.tools?.slice() as string[] || [],
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
    const todos = workPlan.todos.map((todo) => this.agentTodoToTaskMaster(todo))

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
    const stepResults: StepExecutionResult[] = taskMasterResult.results.map((result) => ({
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
  async syncTodos(
    sessionTodos: SessionTodo[],
    agentTodos: AgentTodo[]
  ): Promise<{
    unified: PlanTodo[]
    conflicts: string[]
  }> {
    const unified: PlanTodo[] = []
    const conflicts: string[] = []

    // Convert session todos
    sessionTodos.forEach((sessionTodo) => {
      unified.push(this.sessionTodoToTaskMaster(sessionTodo))
    })

    // Convert agent todos, checking for conflicts
    agentTodos.forEach((agentTodo) => {
      const existing = unified.find((todo) => todo.id === agentTodo.id)
      if (existing) {
        conflicts.push(`Todo conflict: ${agentTodo.id} exists in both session and agent systems`)
      } else {
        unified.push(this.agentTodoToTaskMaster(agentTodo))
      }
    })

    return { unified, conflicts }
  }

  // Status mapping methods
  private mapExecutionStatus(
    status: 'pending' | 'running' | 'completed' | 'failed'
  ): 'pending' | 'running' | 'completed' | 'failed' {
    return status // Direct mapping
  }

  private mapTaskMasterStatus(
    status: 'pending' | 'running' | 'completed' | 'failed'
  ): 'pending' | 'running' | 'completed' | 'failed' {
    return status // Direct mapping
  }

  private mapSessionStatus(status: string): 'pending' | 'in_progress' | 'completed' | 'failed' {
    switch (status) {
      case 'pending':
        return 'pending'
      case 'in_progress':
        return 'in_progress'
      case 'completed':
        return 'completed'
      case 'failed':
        return 'failed'
      default:
        return 'pending'
    }
  }

  private mapTodoStatus(status: 'pending' | 'in_progress' | 'completed' | 'failed'): string {
    return status // Direct mapping
  }

  private mapAgentStatus(
    status: 'planning' | 'in_progress' | 'completed' | 'failed' | 'blocked'
  ): 'pending' | 'in_progress' | 'completed' | 'failed' {
    switch (status) {
      case 'planning':
        return 'pending'
      case 'blocked':
        return 'pending'
      default:
        return status as any
    }
  }

  private mapTodoToAgentStatus(
    status: 'pending' | 'in_progress' | 'completed' | 'failed'
  ): 'planning' | 'in_progress' | 'completed' | 'failed' | 'blocked' {
    switch (status) {
      case 'pending':
        return 'planning'
      default:
        return status as any
    }
  }

  private mapWorkPlanStatus(
    status: 'planning' | 'executing' | 'completed' | 'failed'
  ): 'pending' | 'running' | 'completed' | 'failed' {
    switch (status) {
      case 'planning':
        return 'pending'
      case 'executing':
        return 'running'
      default:
        return status as any
    }
  }

  // Priority mapping methods
  private mapSessionPriority(priority: string): 'low' | 'medium' | 'high' {
    switch (priority.toLowerCase()) {
      case 'high':
        return 'high'
      case 'low':
        return 'low'
      default:
        return 'medium'
    }
  }

  private mapTodoPriority(priority: 'low' | 'medium' | 'high'): string {
    return priority // Direct mapping
  }

  private mapAgentPriority(priority: 'low' | 'medium' | 'high' | 'critical'): 'low' | 'medium' | 'high' {
    switch (priority) {
      case 'critical':
        return 'high'
      default:
        return priority as any
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
      riskLevel: this.priorityToRisk(todo.priority as any) as 'low' | 'medium' | 'high',
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
    console.log(chalk.cyan(`⚡︎ Legacy support ${enabled ? 'enabled' : 'disabled'}`))
  }

  /**
   * Get adapter statistics
   */
  getAdapterStats(): AdapterStats {
    return {
      taskMasterAvailable: this.isTaskMasterAvailable(),
      legacySupport: this.legacySupport,
      activePlans: this.taskMasterService.listPlans().length,
      adapterVersion: '1.2.0',
    }
  }
}

export interface AdapterStats {
  taskMasterAvailable: boolean
  legacySupport: boolean
  activePlans: number
  adapterVersion: string
}

// Export adapter instance factory
export function createTaskMasterAdapter(taskMasterService: TaskMasterService): TaskMasterAdapter {
  return new TaskMasterAdapter(taskMasterService)
}
