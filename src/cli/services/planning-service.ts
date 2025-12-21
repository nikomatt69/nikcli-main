import { EventEmitter } from 'node:events'
import chalk from 'chalk'
import { nanoid } from 'nanoid'
import { createTaskMasterAdapter, type TaskMasterAdapter } from '../adapters/taskmaster-adapter'
import { AutonomousPlanner, type PlanningEvent } from '../planning/autonomous-planner'
import { PlanGenerator } from '../planning/plan-generator'
import type {
  ExecutionPlan,
  MutableExecutionPlan,
  MutablePlanTodo,
  PlannerContext,
  PlanningToolCapability,
  PlanTodo,
} from '../planning/types'
import { advancedUI } from '../ui/advanced-cli-ui'
import { taskMasterService } from './taskmaster-service'
import { type ToolCapability, toolService } from './tool-service'

export interface PlanningOptions {
  showProgress: boolean
  autoExecute: boolean
  confirmSteps: boolean
  useTaskMaster?: boolean // New option to enable TaskMaster
  fallbackToLegacy?: boolean // Fallback option
}

export interface PlanExecutionEvent extends PlanningEvent {
  todoStatus?: 'pending' | 'in_progress' | 'completed' | 'failed'
}

export class PlanningService {
  private planGenerator: PlanGenerator
  private autonomousPlanner: AutonomousPlanner
  private activePlans: Map<string, MutableExecutionPlan> = new Map()
  private workingDirectory: string = process.cwd()
  private availableTools: ToolCapability[] = []
  private taskMasterAdapter: TaskMasterAdapter
  private useTaskMasterByDefault: boolean = true
  private eventEmitter: EventEmitter = new EventEmitter()

  constructor() {
    this.planGenerator = new PlanGenerator()
    this.autonomousPlanner = new AutonomousPlanner(this.workingDirectory)
    this.taskMasterAdapter = createTaskMasterAdapter(taskMasterService)
    this.initializeTools()
    this.initializeTaskMaster()
  }

  /**
   * Initialize TaskMaster service
   */
  private async initializeTaskMaster(): Promise<void> {
    try {
      await taskMasterService.initialize()
      advancedUI.logSuccess('TaskMaster planning integration enabled', '✓')

      // Listen for TaskMaster events
      this.taskMasterAdapter.on('initialized', () => {
        console.log(chalk.cyan('⚡︎ TaskMaster adapter ready'))
      })

      this.taskMasterAdapter.on('fallback', () => {
        advancedUI.logWarning('TaskMaster unavailable, using legacy planning', '⚠︎')
        this.useTaskMasterByDefault = false
      })
    } catch (error: any) {
      advancedUI.logWarning(`TaskMaster initialization failed: ${error.message}`, '⚠︎')
      this.useTaskMasterByDefault = false
    }
  }

  /**
   * Initialize available tools from ToolService
   */
  private initializeTools(): void {
    try {
      const { ToolRegistry } = require('../tools/tool-registry')
      const registry = new ToolRegistry(this.workingDirectory)
      const names: string[] = registry.listTools()
      this.availableTools = names.map((name) => {
        const meta = registry.getToolMetadata(name) as any
        const category = (meta?.category || 'general') as 'file' | 'command' | 'analysis' | 'git' | 'package' | 'system'
        // Map registry categories to planning categories
        const categoryMap: Record<string, 'file' | 'command' | 'analysis' | 'git' | 'package'> = {
          filesystem: 'file',
          system: 'command',
          ai: 'analysis',
          blockchain: 'command',
          general: 'analysis',
        }
        const mappedCategory = categoryMap[category] || 'analysis'
        return {
          name,
          description: meta?.description || `${name} tool`,
          category: mappedCategory,
          handler: async (args: any) => {
            const tool = registry.getTool(name) as any
            if (!tool || typeof tool.execute !== 'function') throw new Error(`Tool '${name}' not available`)
            return await tool.execute.apply(tool, Array.isArray(args) ? args : [args])
          },
        }
      })
    } catch {
      // Fallback to legacy toolService if registry init fails
      this.availableTools = toolService.getAvailableTools()
    }
  }

  onPlanEvent(listener: (event: PlanExecutionEvent) => void): () => void {
    this.eventEmitter.on('plan-event', listener)
    return () => {
      this.eventEmitter.off('plan-event', listener)
    }
  }

  private emitPlanEvent(event: PlanExecutionEvent): void {
    this.eventEmitter.emit('plan-event', event)
  }

  /**
   * Refresh available tools from ToolService
   */
  refreshAvailableTools(): void {
    this.initializeTools()
  }

  /**
   * Convert ToolCapability to PlanningToolCapability for planning context
   */
  private convertToPlanningTools(tools: ToolCapability[]): PlanningToolCapability[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      riskLevel: this.assessToolRisk(tool),
      reversible: this.isToolReversible(tool),
      estimatedDuration: this.estimateToolDuration(tool),
      requiredArgs: this.extractRequiredArgs(tool),
      optionalArgs: this.extractOptionalArgs(tool),
    }))
  }

  /**
   * Assess risk level for a tool based on its category and name
   */
  private assessToolRisk(tool: ToolCapability): 'low' | 'medium' | 'high' {
    if (tool.category === 'command' || tool.name.includes('delete') || tool.name.includes('remove')) {
      return 'high'
    }
    if (tool.category === 'file' && (tool.name.includes('write') || tool.name.includes('modify'))) {
      return 'medium'
    }
    return 'low'
  }

  /**
   * Determine if a tool operation is reversible
   */
  private isToolReversible(tool: ToolCapability): boolean {
    const irreversibleOperations = ['delete', 'remove', 'execute', 'install']
    return !irreversibleOperations.some((op) => tool.name.toLowerCase().includes(op))
  }

  /**
   * Estimate duration for tool execution
   */
  private estimateToolDuration(tool: ToolCapability): number {
    switch (tool.category) {
      case 'command':
        return 10000 // 10 seconds
      case 'package':
        return 30000 // 30 seconds
      case 'analysis':
        return 5000 // 5 seconds
      case 'git':
        return 3000 // 3 seconds
      case 'file':
        return 1000 // 1 second
      default:
        return 5000
    }
  }

  /**
   * Extract required arguments (simplified - in production would use reflection)
   */
  private extractRequiredArgs(tool: ToolCapability): string[] {
    // This is a simplified implementation
    // In production, this would introspect the tool handler function
    if (tool.name.includes('file')) return ['filePath']
    if (tool.name.includes('command')) return ['command']
    if (tool.name.includes('git')) return []
    return []
  }

  /**
   * Extract optional arguments (simplified - in production would use reflection)
   */
  private extractOptionalArgs(tool: ToolCapability): string[] {
    // This is a simplified implementation
    // In production, this would introspect the tool handler function
    if (tool.name.includes('file')) return ['encoding', 'backup']
    if (tool.name.includes('command')) return ['timeout', 'cwd']
    return []
  }

  setWorkingDirectory(dir: string): void {
    this.workingDirectory = dir
  }

  /**
   * Create a new execution plan
   */
  async createPlan(
    userRequest: string,
    options: PlanningOptions = {
      showProgress: true,
      autoExecute: false,
      confirmSteps: true,
      useTaskMaster: undefined, // Auto-detect
      fallbackToLegacy: true,
    }
  ): Promise<ExecutionPlan> {


    // Determine whether to use TaskMaster
    const shouldUseTaskMaster = options.useTaskMaster ?? this.useTaskMasterByDefault

    let plan: ExecutionPlan

    if (shouldUseTaskMaster && this.taskMasterAdapter.isTaskMasterAvailable()) {
      try {


        // Use TaskMaster for enhanced planning
        plan = await this.taskMasterAdapter.createEnhancedPlan(userRequest, {
          projectPath: this.workingDirectory,
          relevantFiles: await this.getProjectFiles(),
          projectType: await this.detectProjectType(),
        })

        advancedUI.logSuccess('TaskMaster plan generated', '✓')
      } catch (error: any) {
        advancedUI.logWarning(`TaskMaster planning failed: ${error.message}`, '⚠︎')

        if (!options.fallbackToLegacy) {
          throw error
        }

        console.log(chalk.cyan('⚡︎ Falling back to legacy planning...'))
        plan = await this.createLegacyPlan(userRequest, options)
      }
    } else {
      // Use legacy planning
      if (shouldUseTaskMaster) {
        advancedUI.logWarning('TaskMaster not available, using legacy planning', '⚠︎')
      }
      plan = await this.createLegacyPlan(userRequest, options)
    }

    // Convert to mutable and store the plan
    const mutablePlan: MutableExecutionPlan = {
      ...plan,
      steps: [...plan.steps],
      todos: plan.todos.map((todo) => ({
        ...todo,
        status: todo.status,
        progress: todo.progress,
        updatedAt: todo.updatedAt,
        completedAt: todo.completedAt,
        actualDuration: todo.actualDuration,
        dependencies: todo.dependencies ? [...todo.dependencies] : undefined,
        metadata: todo.metadata ? { ...todo.metadata } : undefined,
        tools: todo.tools ? [...todo.tools] : undefined,
      })),
      context: {
        ...plan.context,
        relevantFiles: plan.context.relevantFiles ? [...plan.context.relevantFiles] : undefined,
      },
    }
    this.activePlans.set(plan.id, mutablePlan)

    // Sync with existing systems
    await this.syncPlanWithSystems(plan)

    // Show dashboard for TaskMaster plans or when showProgress is enabled
    const isTaskMasterPlan = shouldUseTaskMaster && this.taskMasterAdapter.isTaskMasterAvailable()
    if (options.showProgress || isTaskMasterPlan) {
      await this.showDashboard(plan)
    }

    return plan
  }

  /**
   * Create plan using legacy planning system
   */
  private async createLegacyPlan(userRequest: string, _options: PlanningOptions): Promise<ExecutionPlan> {
    const context: PlannerContext = {
      userRequest,
      availableTools: this.convertToPlanningTools(this.availableTools),
      projectPath: this.workingDirectory,
    }

    const plan = await this.planGenerator.generatePlan(context)

    // Convert to mutable for internal modifications
    const mutablePlan: MutableExecutionPlan = {
      ...plan,
      steps: [...plan.steps],
      todos: plan.todos.map((todo) => ({
        ...todo,
        status: todo.status,
        progress: todo.progress,
        updatedAt: todo.updatedAt,
        completedAt: todo.completedAt,
        actualDuration: todo.actualDuration,
        dependencies: todo.dependencies ? [...todo.dependencies] : undefined,
        metadata: todo.metadata ? { ...todo.metadata } : undefined,
        tools: todo.tools ? [...todo.tools] : undefined,
      })),
      context: {
        ...plan.context,
        relevantFiles: plan.context.relevantFiles ? [...plan.context.relevantFiles] : undefined,
      },
    }

    // Ensure plan has todos derived from steps for UI/dashboard purposes
    if (!mutablePlan.todos || mutablePlan.todos.length === 0) {
      try {
        const todos: MutablePlanTodo[] = plan.steps.map((step) => ({
          id: nanoid(),
          title: step.title,
          description: step.description,
          status: 'pending' as const,
          priority: (step.riskLevel === 'high' ? 'high' : step.riskLevel === 'medium' ? 'medium' : 'low') as
            | 'low'
            | 'medium'
            | 'high',
          createdAt: new Date(),
          updatedAt: new Date(),
          progress: 0,
        }))
        mutablePlan.todos = todos
      } catch {
        // leave as is
      }
    }

    // Convert back to readonly
    return {
      ...mutablePlan,
      todos: mutablePlan.todos.map((todo) => ({
        ...todo,
        status: todo.status,
        progress: todo.progress,
        updatedAt: todo.updatedAt,
        completedAt: todo.completedAt,
        actualDuration: todo.actualDuration,
        dependencies: todo.dependencies ? ([...todo.dependencies] as const) : undefined,
        metadata: todo.metadata ? { ...todo.metadata } : undefined,
        tools: todo.tools ? ([...todo.tools] as const) : undefined,
      })),
    }
  }

  /**
   * Execute a plan autonomously
   */
  async executePlan(planId: string, _options: PlanningOptions): Promise<void> {
    const plan = this.activePlans.get(planId)
    if (!plan) {
      console.log(chalk.red(`Plan ${planId} not found`))
      return
    }

    const superCompact = process.env.NIKCLI_COMPACT === '1'
    if (!superCompact) {
      advancedUI.logFunctionCall('executing')
      advancedUI.logInfo(plan.title, '●')
    }

    try {
      // Use autonomous planner for execution with streaming
      for await (const event of this.autonomousPlanner.executePlan(plan)) {
        switch (event.type) {
          case 'plan_start':
            if (!superCompact) console.log(chalk.cyan(`📋 Starting: ${event.planId}`))
            try {
              const { advancedUI } = await import('../ui/advanced-cli-ui')
              const items = (plan.todos || []).map((t) => ({
                content: (t as any).title || (t as any).description,
                status: (t as any).status,
                priority: (t as any).priority,
                progress: (t as any).progress,
              }))
                ; (advancedUI as any).showTodoDashboard?.(items, plan.title || 'Plan Todos')
            } catch { }
            this.emitPlanEvent({ ...event, planId: plan.id, todoStatus: 'pending' })
            break
          case 'plan_created':
            if (!superCompact) console.log(chalk.blue(`⚡︎ ${event.result}`))
            break
          case 'todo_start':
            if (!superCompact) advancedUI.logSuccess(event.todoId || 'Todo started', '✓')
            if (event.todoId) this.updateTodoStatus(plan.id, event.todoId, 'in_progress')
            try {
              const { advancedUI } = await import('../ui/advanced-cli-ui')
              const items = (plan.todos || []).map((t) => ({
                content: (t as any).title || (t as any).description,
                status: (t as any).status,
                priority: (t as any).priority,
                progress: (t as any).progress,
              }))
                ; (advancedUI as any).showTodoDashboard?.(items, plan.title || 'Plan Todos')
            } catch { }
            this.emitPlanEvent({ ...event, planId: plan.id, todoStatus: 'in_progress' })
            break
          case 'todo_progress':
            if (!superCompact) advancedUI.logWarning(`⚡︎ ${event.progress}`)
            try {
              const { advancedUI } = await import('../ui/advanced-cli-ui')
              const items = (plan.todos || []).map((t) => ({
                content: (t as any).title || (t as any).description,
                status: (t as any).status,
                priority: (t as any).priority,
                progress: (t as any).progress,
              }))
                ; (advancedUI as any).showTodoDashboard?.(items, plan.title || 'Plan Todos')
            } catch { }
            break
          case 'todo_complete':
            if (!superCompact) advancedUI.logSuccess('Todo completed', '✓')
            if (event.todoId) {
              const status = event.error ? 'failed' : 'completed'
              this.updateTodoStatus(plan.id, event.todoId, status)
            }
            try {
              const { advancedUI } = await import('../ui/advanced-cli-ui')
              const items = (plan.todos || []).map((t) => ({
                content: (t as any).title || (t as any).description,
                status: (t as any).status,
                priority: (t as any).priority,
                progress: (t as any).progress,
              }))
                ; (advancedUI as any).showTodoDashboard?.(items, plan.title || 'Plan Todos')
            } catch { }
            this.emitPlanEvent({ ...event, planId: plan.id, todoStatus: event.error ? 'failed' : 'completed' })
            break
          case 'plan_failed':
            if (!superCompact) advancedUI.logError(`Plan execution failed: ${event.error}`, '✖')
            this.updatePlanStatus(plan.id, 'failed')
            this.emitPlanEvent({ ...event, planId: plan.id })
            try {
              const { advancedUI } = await import('../ui/advanced-cli-ui')
              const items = (plan.todos || []).map((t) => ({
                content: (t as any).title || (t as any).description,
                status: (t as any).status,
                priority: (t as any).priority,
                progress: (t as any).progress,
              }))
                ; (advancedUI as any).showTodoDashboard?.(items, plan.title || 'Plan Todos')
            } catch { }
            break
          case 'plan_complete':
            this.updatePlanStatus(plan.id, 'completed')
            this.emitPlanEvent({ ...event, planId: plan.id })
            break
        }
      }
    } catch (error: any) {
      advancedUI.logError(`Plan execution error: ${error.message}`, '✖')
      plan.status = 'failed'
      // Ensure prompt is restored on error
      try {
        const nik = (global as any).__nikCLI
        if (nik) {
          try {
            nik.assistantProcessing = false
          } catch { }
          if (typeof nik.renderPromptAfterOutput === 'function') nik.renderPromptAfterOutput()
        }
      } catch { }
    } finally {
      // Always render prompt after execution cycle
      try {
        const nik = (global as any).__nikCLI
        if (nik) {
          try {
            nik.assistantProcessing = false
          } catch { }
          if (typeof nik.renderPromptAfterOutput === 'function') nik.renderPromptAfterOutput()
        }
        // Disable possible bypass and resume prompt
        try {
          const { inputQueue } = await import('../core/input-queue')
          inputQueue.disableBypass()
        } catch { }
      } catch { }
    }
  }

  /**
   * Get all active plans
   */
  getActivePlans(): ExecutionPlan[] {
    return Array.from(this.activePlans.values())
  }

  /**
   * Update plan status
   */
  updatePlanStatus(planId: string, status: 'pending' | 'running' | 'completed' | 'failed'): void {
    const plan = this.activePlans.get(planId)
    if (plan) {
      plan.status = status
    }
  }

  /**
   * Add todo to plan
   */
  addTodoToPlan(planId: string, todo: Omit<PlanTodo, 'id'>): void {
    const plan = this.activePlans.get(planId)
    if (plan) {
      const newTodo: MutablePlanTodo = {
        ...todo,
        id: nanoid(),
        status: todo.status,
        progress: todo.progress,
        updatedAt: todo.updatedAt,
        completedAt: todo.completedAt,
        actualDuration: todo.actualDuration,
        dependencies: todo.dependencies ? [...todo.dependencies] : undefined,
        metadata: todo.metadata ? { ...todo.metadata } : undefined,
        tools: todo.tools ? [...todo.tools] : undefined,
      }
      plan.todos.push(newTodo)
      // Sync to session TodoStore
      try {
        const globalAny: any = global as any
        const sessionId =
          globalAny.__streamingOrchestrator?.context?.session?.id ||
          globalAny.__nikCLI?.context?.session?.id ||
          `${Date.now()}`
        const { todoStore } = require('../store/todo-store')
        const list = (plan.todos || []).map((t: any) => ({
          id: String(t.id),
          content: String(t.title || t.description || ''),
          status: t.status,
          priority: (t.priority || 'medium') as any,
          progress: typeof t.progress === 'number' ? t.progress : 0,
        }))
        todoStore.setTodos(String(sessionId), list)
      } catch { }
    }
  }

  /**
   * Update todo status
   */
  updateTodoStatus(planId: string, todoId: string, status: 'pending' | 'in_progress' | 'completed' | 'failed'): void {
    const plan = this.activePlans.get(planId)
    if (plan) {
      const todo = plan.todos.find((t) => t.id === todoId)
      if (todo) {
        todo.status = status
        // Sync to session TodoStore
        try {
          const globalAny: any = global as any
          const sessionId =
            globalAny.__streamingOrchestrator?.context?.session?.id ||
            globalAny.__nikCLI?.context?.session?.id ||
            `${Date.now()}`
          const { todoStore } = require('../store/todo-store')
          const list = (plan.todos || []).map((t: any) => ({
            id: String(t.id),
            content: String(t.title || t.description || ''),
            status: t.status,
            priority: (t.priority || 'medium') as any,
            progress: typeof t.progress === 'number' ? t.progress : 0,
          }))
          todoStore.setTodos(String(sessionId), list)
        } catch { }
      }
    }
  }

  /**
   * Clear completed plans
   */
  clearCompletedPlans(): number {
    const completedCount = Array.from(this.activePlans.values()).filter((p) => p.status === 'completed').length

    for (const [id, plan] of this.activePlans) {
      if (plan.status === 'completed') {
        this.activePlans.delete(id)
      }
    }

    console.log(chalk.green(`🧹 Cleared ${completedCount} completed plans`))
    return completedCount
  }

  /**
   * Get plan statistics
   */
  getStatistics(): {
    total: number
    pending: number
    running: number
    completed: number
    failed: number
  } {
    const plans = Array.from(this.activePlans.values())
    return {
      total: plans.length,
      pending: plans.filter((p) => p.status === 'pending').length,
      running: plans.filter((p) => p.status === 'running').length,
      completed: plans.filter((p) => p.status === 'completed').length,
      failed: plans.filter((p) => p.status === 'failed').length,
    }
  }

  /**
   * Sync plan with existing todo systems
   */
  private async syncPlanWithSystems(plan: ExecutionPlan): Promise<void> {
    try {
      // Sync with session TodoStore (Claude-style) for Plan Mode cohesion
      const globalAny: any = global as any
      const sessionId =
        globalAny.__streamingOrchestrator?.context?.session?.id ||
        globalAny.__nikCLI?.context?.session?.id ||
        `${Date.now()}`

      const { todoStore } = await import('../store/todo-store')
      const list = (plan.todos || []).map((t: any) => ({
        id: String(t.id || nanoid()),
        content: String(t.title || t.description || ''),
        status: (t.status || 'pending') as any,
        priority: (t.priority || 'medium') as any,
        progress: typeof t.progress === 'number' ? t.progress : 0,
      }))

      if (list.length > 0) {
        todoStore.setTodos(String(sessionId), list)
      }
    } catch (error: any) {
      advancedUI.logWarning(`Could not sync with todo store: ${error.message}`)
    }
  }

  /**
   * Show dashboard for plan
   */
  private async showDashboard(plan: ExecutionPlan): Promise<void> {
    try {
      const { advancedUI } = await import('../ui/advanced-cli-ui')
      const todoItems = (plan.todos || []).map((t) => ({
        content: (t as any).title || (t as any).description,
        status: (t as any).status,
        priority: (t as any).priority,
        progress: (t as any).progress,
      }))
        ; (advancedUI as any).showTodoDashboard?.(todoItems, plan.title || 'Plan Todos')
    } catch (error: any) {
      advancedUI.logWarning(`Could not show dashboard: ${error.message}`)
    }
  }

  /**
   * Get relevant project files for TaskMaster context
   */
  private async getProjectFiles(): Promise<string[]> {
    try {
      const files: string[] = []
      // Add common important files for context
      const importantFiles = [
        'package.json',
        'tsconfig.json',
        'README.md',
        'CLAUDE.md',
        '.gitignore',
        'Dockerfile',
        'docker-compose.yml',
      ]

      for (const file of importantFiles) {
        try {
          const fs = await import('node:fs/promises')
          await fs.access(`${this.workingDirectory}/${file}`)
          files.push(file)
        } catch {
          // File doesn't exist, skip
        }
      }

      return files
    } catch {
      return []
    }
  }

  /**
   * Detect project type for TaskMaster context
   */
  private async detectProjectType(): Promise<string> {
    try {
      const fs = await import('node:fs/promises')
      const packageJsonPath = `${this.workingDirectory}/package.json`

      try {
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'))

        // Detect based on dependencies
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies }

        if (deps.react || deps['@types/react']) return 'react'
        if (deps.next || deps.nextjs) return 'nextjs'
        if (deps.vue || deps['@vue/cli']) return 'vue'
        if (deps.angular || deps['@angular/core']) return 'angular'
        if (deps.express || deps.fastify) return 'nodejs-backend'
        if (deps.typescript || deps['@types/node']) return 'typescript'

        return 'nodejs'
      } catch {
        // Check for other indicators
        const files = await fs.readdir(this.workingDirectory)

        if (files.includes('Cargo.toml')) return 'rust'
        if (files.includes('go.mod')) return 'go'
        if (files.includes('requirements.txt') || files.includes('pyproject.toml')) return 'python'
        if (files.includes('pom.xml')) return 'java'

        return 'unknown'
      }
    } catch {
      return 'unknown'
    }
  }

  /**
   * Enable or disable TaskMaster
   */
  setTaskMasterEnabled(enabled: boolean): void {
    this.useTaskMasterByDefault = enabled
    advancedUI.logInfo(`TaskMaster planning ${enabled ? 'enabled' : 'disabled'}`)
  }

  /**
   * Get TaskMaster adapter statistics
   */
  getTaskMasterStats(): any {
    return this.taskMasterAdapter.getAdapterStats()
  }
}

export const planningService = new PlanningService()
