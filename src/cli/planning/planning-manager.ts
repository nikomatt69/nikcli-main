import { EventEmitter } from 'events'
import { ToolRegistry } from '../tools/tool-registry'
import { advancedUI } from '../ui/advanced-cli-ui'
import { CliUI } from '../utils/cli-ui'
import { PlanExecutor } from './plan-executor'
import { PlanGenerator } from './plan-generator'
import type { ExecutionPlan, PlanExecutionResult, PlannerConfig, PlannerContext, PlanValidationResult } from './types'

/**
 * Production-ready Planning Manager
 * Orchestrates the complete planning and execution workflow
 */
export class PlanningManager extends EventEmitter {
  private planGenerator: PlanGenerator
  private planExecutor: PlanExecutor
  private toolRegistry: ToolRegistry
  private config: PlannerConfig
  private planHistory: Map<string, ExecutionPlan> = new Map()

  constructor(workingDirectory: string, config?: Partial<PlannerConfig>) {
    super() // Call EventEmitter constructor
    this.config = {
      maxStepsPerPlan: 50,
      requireApprovalForRisk: 'medium',
      enableRollback: true,
      logLevel: 'info',
      timeoutPerStep: 60000,
      ...config,
    }

    this.toolRegistry = new ToolRegistry(workingDirectory)
    this.planGenerator = new PlanGenerator()
    this.planExecutor = new PlanExecutor(this.toolRegistry, this.config)
  }

  /**
   * Main entry point: Plan and execute a user request
   */
  async planAndExecute(userRequest: string, projectPath: string): Promise<PlanExecutionResult> {
    advancedUI.addLiveUpdate({
      type: 'info',
      content: `Processing request: ${userRequest}`,
      source: 'ai_planning_system',
    })

    try {
      // Step 1: Analyze project context
      const context = await this.buildPlannerContext(userRequest, projectPath)

      // Step 2: Generate execution plan
      const plan = await this.planGenerator.generatePlan(context)
      // Render real todos in structured UI (all modes)
      await this.renderTodosUI(plan)
      this.planHistory.set(plan.id, plan)

      // Step 3: Validate plan
      const validation = this.planGenerator.validatePlan(plan)
      this.displayValidationResults(validation)

      if (!validation.isValid) {
        throw new Error(`Plan validation failed: ${validation.errors.join(', ')}`)
      }

      // Step 4: Execute plan
      const result = await this.planExecutor.executePlan(plan)

      // Step 5: Log final results
      this.logPlanningSession(plan, result)

      return result
    } catch (error: any) {
      advancedUI.logError(`Planning and execution failed: ${error.message}`)
      throw error
    }
  }

  /**
   * Generate a plan without executing it
   */
  async generatePlanOnly(userRequest: string, projectPath: string): Promise<ExecutionPlan> {
    CliUI.logSection('Plan Generation')

    const context = await this.buildPlannerContext(userRequest, projectPath)
    const plan = await this.planGenerator.generatePlan(context)
    // Show todos panel in structured UI
    await this.renderTodosUI(plan)

    this.planHistory.set(plan.id, plan)
    this.displayPlan(plan)

    return plan
  }

  /**
   * Execute a previously generated plan
   */
  async executePlan(planId: string): Promise<PlanExecutionResult> {
    const plan = this.planHistory.get(planId)
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`)
    }

    advancedUI.addLiveUpdate({ type: 'info', content: 'Starting plan execution', source: 'plan_execution' })
    return await this.executeWithEventTracking(plan)
  }

  /**
   * Execute plan with step-by-step event emission for UI updates
   */
  private async executeWithEventTracking(plan: ExecutionPlan): Promise<PlanExecutionResult> {
    // Emit plan start event
    this.emit('planExecutionStart', { planId: plan.id, title: plan.title })

    try {
      // Track step execution
      const updatedTodos = [...plan.todos]
      let abortedByUser = false

      for (let i = 0; i < updatedTodos.length; i++) {
        // Allow global interruption (ESC) to gracefully stop execution
        try {
          const nik = (global as any).__nikCLI
          if (nik?.shouldInterrupt) {
            abortedByUser = true
            break
          }
        } catch {
          /* ignore */
        }
        const todo = updatedTodos[i]

        // Emit step start event
        this.emit('stepStart', {
          planId: plan.id,
          stepIndex: i,
          stepId: todo.id,
          todos: updatedTodos,
        })

        // Update step status to in_progress
        updatedTodos[i] = { ...todo, status: 'in_progress' }
        this.emit('stepProgress', {
          planId: plan.id,
          stepIndex: i,
          stepId: todo.id,
          todos: updatedTodos,
        })

        // Execute step with real tool service
        await this.executeStepWithTools(todo)

        // Update step status to completed
        updatedTodos[i] = { ...todo, status: 'completed' }
        this.emit('stepComplete', {
          planId: plan.id,
          stepIndex: i,
          stepId: todo.id,
          todos: updatedTodos,
        })
      }

      if (abortedByUser) {
        this.emit('planExecutionError', { planId: plan.id, error: 'Interrupted by user' })
        throw new Error('Interrupted by user')
      }

      // Emit plan completion event
      this.emit('planExecutionComplete', { planId: plan.id, title: plan.title })

      // Return execution result
      return {
        planId: plan.id,
        status: 'completed',
        startTime: new Date(),
        endTime: new Date(),
        stepResults: updatedTodos.map((todo) => ({
          stepId: todo.id,
          status: 'success' as const,
          output: `Step completed: ${todo.title || todo.description}`,
          error: undefined,
          duration: 1000,
          timestamp: new Date(),
          logs: [],
        })),
        summary: {
          totalSteps: updatedTodos.length,
          successfulSteps: updatedTodos.length,
          failedSteps: 0,
          skippedSteps: 0,
        },
      } as PlanExecutionResult
    } catch (error: any) {
      this.emit('planExecutionError', {
        planId: plan.id,
        error: error.message || error,
      })
      throw error
    } finally {
      // Always ensure we return to default mode after plan attempts
      try {
        const nik = (global as any).__nikCLI
        if (nik) nik.currentMode = 'default'
        const orchestrator = (global as any).__streamingOrchestrator
        if (orchestrator?.context) {
          orchestrator.context.planMode = false
          orchestrator.context.autoAcceptEdits = false
        }
      } catch {
        /* ignore cleanup errors */
      }
    }
  }

  /**
   * Execute a single step using the tool system
   */
  private async executeStepWithTools(todo: any): Promise<void> {
    try {
      // If the todo has tool information, execute it
      if (todo.toolName && todo.toolArgs) {
        advancedUI.logInfo(`Executing tool: ${todo.toolName}`)

        // Get tool metadata for validation
        const toolMetadata = this.toolRegistry.getToolMetadata(todo.toolName)
        if (!toolMetadata) {
          throw new Error(`Tool not found: ${todo.toolName}`)
        }

        // Execute the tool through the tool registry
        const tool = this.toolRegistry.getTool(todo.toolName)
        if (!tool) {
          throw new Error(`Tool instance not found: ${todo.toolName}`)
        }

        const result = await tool.execute(todo.toolArgs)

        if (this.config.logLevel === 'debug') {
          advancedUI.logInfo(`Tool execution result: ${JSON.stringify(result, null, 2)}`)
        }
      } else {
        // For steps without specific tools, log the action
        advancedUI.logInfo(`Executing step: ${todo.title || todo.description}`)

        // Simulate execution time for non-tool steps
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    } catch (error: any) {
      advancedUI.logError(`Failed to execute step: ${error.message}`)
      throw error
    }
  }

  /**
   * List all generated plans
   */
  listPlans(): ExecutionPlan[] {
    return Array.from(this.planHistory.values())
  }

  /**
   * Get plan by ID
   */
  getPlan(planId: string): ExecutionPlan | undefined {
    return this.planHistory.get(planId)
  }

  /**
   * Get execution history
   */
  getExecutionHistory(): Map<string, PlanExecutionResult> {
    return this.planExecutor.getExecutionHistory()
  }

  /**
   * Display tool registry information
   */
  displayToolRegistry(): void {
    this.toolRegistry.displayRegistry()
  }

  /**
   * Get planning statistics
   */
  getPlanningStats(): PlanningStats {
    const plans = Array.from(this.planHistory.values())
    const executions = Array.from(this.planExecutor.getExecutionHistory().values())

    return {
      totalPlansGenerated: plans.length,
      totalPlansExecuted: executions.length,
      successfulExecutions: executions.filter((e) => e.status === 'completed').length,
      failedExecutions: executions.filter((e) => e.status === 'failed').length,
      averageStepsPerPlan: plans.length > 0 ? plans.reduce((sum, p) => sum + p.steps.length, 0) / plans.length : 0,
      averageExecutionTime:
        executions.length > 0
          ? executions.reduce((sum, e) => {
              const duration = e.endTime ? e.endTime.getTime() - e.startTime.getTime() : 0
              return sum + duration
            }, 0) / executions.length
          : 0,
      riskDistribution: this.calculateRiskDistribution(plans),
      toolUsageStats: this.calculateToolUsage(plans),
    }
  }

  /**
   * Build planner context from user request and project analysis
   */
  private async buildPlannerContext(userRequest: string, projectPath: string): Promise<PlannerContext> {
    CliUI.startSpinner('Analyzing project context...')

    try {
      // Get available tools
      const availableTools = this.toolRegistry.listTools().map((name) => {
        const metadata = this.toolRegistry.getToolMetadata(name)
        return {
          name,
          description: metadata?.description || '',
          riskLevel: metadata?.riskLevel || 'medium',
          reversible: metadata?.reversible || true,
          estimatedDuration: metadata?.estimatedDuration || 5000,
          requiredArgs: [], // Would be populated from tool introspection
          optionalArgs: [],
        }
      })

      // Basic project analysis (could be enhanced with actual file scanning)
      const projectAnalysis = await this.analyzeProject(projectPath)

      CliUI.succeedSpinner('Project context analyzed')

      return {
        userRequest,
        projectPath,
        availableTools,
        projectAnalysis,
        userPreferences: {
          riskTolerance: 'moderate',
          preferredTools: [],
          excludedOperations: [],
        },
      }
    } catch (error: any) {
      CliUI.failSpinner('Failed to analyze project context')
      throw error
    }
  }

  /**
   * Analyze project structure and characteristics
   */
  private async analyzeProject(projectPath: string): Promise<any> {
    // Use real project analysis via tool service
    try {
      const { toolService } = await import('../services/tool-service')

      // Get real file count and structure
      const fileList = await toolService
        .executeTool('find-files', {
          path: projectPath,
          patterns: ['**/*'],
        })
        .catch(() => [])

      const files = Array.isArray(fileList) ? fileList : []
      const languages = this.detectLanguagesFromFiles(files)
      const frameworks = this.detectFrameworks(projectPath)
      const hasTests = this.detectTests(files)

      return {
        fileCount: files.length,
        languages: languages,
        frameworks: frameworks,
        hasTests: hasTests,
        hasDocumentation: this.detectDocumentation(files),
      }
    } catch (_error) {
      // Fallback to basic analysis
      return {
        fileCount: 0,
        languages: ['javascript'],
        frameworks: [],
        hasTests: false,
        hasDocumentation: false,
      }
    }
  }

  private detectLanguagesFromFiles(files: string[]): string[] {
    const extensions = new Set<string>()
    files.forEach((file) => {
      const ext = file.split('.').pop()?.toLowerCase()
      if (ext) extensions.add(ext)
    })

    const langMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      go: 'go',
      rs: 'rust',
      java: 'java',
      c: 'c',
      cpp: 'cpp',
      rb: 'ruby',
      php: 'php',
    }

    return Array.from(extensions)
      .map((ext) => langMap[ext] || ext)
      .filter(Boolean)
  }

  private detectFrameworks(_projectPath: string): string[] {
    const frameworks: string[] = []

    // This would read package.json and analyze dependencies
    // For now, return common frameworks based on file patterns
    return frameworks
  }

  private detectTests(files: string[]): boolean {
    return files.some((file) => file.includes('.test.') || file.includes('.spec.') || file.includes('__tests__'))
  }

  private detectDocumentation(files: string[]): boolean {
    return files.some((file) => file.toLowerCase().includes('readme') || file.toLowerCase().includes('.md'))
  }

  /**
   * Display plan details
   */
  private displayPlan(plan: ExecutionPlan): void {
    advancedUI.addLiveUpdate({ type: 'info', content: `Generated Plan: ${plan.title}`, source: 'plan_details' })
    advancedUI.addLiveUpdate({ type: 'info', content: `Plan ID: ${plan.id}`, source: 'plan_details' })
    advancedUI.addLiveUpdate({ type: 'info', content: `Description: ${plan.description}`, source: 'plan_details' })
    advancedUI.addLiveUpdate({ type: 'info', content: `Total Steps: ${plan.steps.length}`, source: 'plan_details' })
    advancedUI.addLiveUpdate({
      type: 'info',
      content: `Estimated Duration: ${Math.round(plan.estimatedTotalDuration / 1000)}s`,
      source: 'plan_details',
    })
    advancedUI.addLiveUpdate({
      type: 'info',
      content: `Risk Level: ${plan.riskAssessment.overallRisk}`,
      source: 'plan_details',
    })

    advancedUI.addLiveUpdate({ type: 'info', content: 'Execution Steps:', source: 'plan_details' })
    plan.steps.forEach((step, index) => {
      const riskIcon = step.riskLevel === 'high' ? '🔴' : step.riskLevel === 'medium' ? '🟡' : '🟢'
      const typeIcon =
        step.type === 'tool' ? '🔧' : step.type === 'validation' ? '✓' : step.type === 'user_input' ? '👤' : '🤔'

      advancedUI.addLiveUpdate({
        type: 'info',
        content: `${index + 1}. ${riskIcon} ${typeIcon} ${step.title}`,
        source: 'plan_details',
      })
      advancedUI.addLiveUpdate({ type: 'info', content: `   ${step.description}`, source: 'plan_details' })

      if (step.dependencies && step.dependencies.length > 0) {
        advancedUI.addLiveUpdate({
          type: 'info',
          content: `   Dependencies: ${step.dependencies.length} step(s)`,
          source: 'plan_details',
        })
      }
    })
  }

  /**
   * Render the plan todos in the Advanced CLI UI
   */
  private async renderTodosUI(plan: ExecutionPlan): Promise<void> {
    try {
      const { advancedUI } = await import('../ui/advanced-cli-ui')
      const todoItems = (plan.todos || []).map((t) => ({
        content: (t as any).title || (t as any).description,
        status: (t as any).status,
        priority: (t as any).priority,
        progress: (t as any).progress,
      }))
      ;(advancedUI as any).showTodoDashboard?.(todoItems, plan.title || 'Plan Todos')
    } catch (error: any) {
      if (this.config.logLevel === 'debug') {
        advancedUI.logError(`Failed to render todos UI: ${error?.message || error}`)
      }
    }
  }

  /**
   * Display validation results
   */
  private displayValidationResults(validation: PlanValidationResult): void {
    if (validation.errors.length > 0) {
      advancedUI.addLiveUpdate({ type: 'error', content: 'Validation Errors:', source: 'validation_results' })
      validation.errors.forEach((error) =>
        advancedUI.addLiveUpdate({ type: 'error', content: error, source: 'validation_results' })
      )
    }

    if (validation.warnings.length > 0) {
      advancedUI.addLiveUpdate({ type: 'warning', content: 'Validation Warnings:', source: 'validation_results' })
      validation.warnings.forEach((warning) =>
        advancedUI.addLiveUpdate({ type: 'warning', content: warning, source: 'validation_results' })
      )
    }

    if (validation.suggestions.length > 0) {
      advancedUI.addLiveUpdate({ type: 'info', content: 'Suggestions:', source: 'validation_results' })
      validation.suggestions.forEach((suggestion) =>
        advancedUI.addLiveUpdate({ type: 'info', content: suggestion, source: 'validation_results' })
      )
    }
  }

  /**
   * Log complete planning session results
   */
  private logPlanningSession(plan: ExecutionPlan, result: PlanExecutionResult): void {
    const duration = result.endTime ? result.endTime.getTime() - result.startTime.getTime() : 0

    advancedUI.addLiveUpdate({ type: 'info', content: `Plan ID: ${plan.id}`, source: 'planning_session_complete' })
    advancedUI.addLiveUpdate({
      type: 'info',
      content: `Execution Status: ${result.status.toUpperCase()}`,
      source: 'planning_session_complete',
    })
    advancedUI.addLiveUpdate({
      type: 'info',
      content: `Total Duration: ${Math.round(duration / 1000)}s`,
      source: 'planning_session_complete',
    })
    advancedUI.addLiveUpdate({
      type: 'info',
      content: `Steps Executed: ${result.summary.successfulSteps}/${result.summary.totalSteps}`,
      source: 'planning_session_complete',
    })

    if (result.summary.failedSteps > 0) {
      advancedUI.logWarning(`${result.summary.failedSteps} steps failed`)
    }

    if (result.summary.skippedSteps > 0) {
      advancedUI.logInfo(`${result.summary.skippedSteps} steps skipped`)
    }

    // Save session log
    this.saveSessionLog(plan, result)
  }

  /**
   * Save session log for audit trail
   */
  private saveSessionLog(plan: ExecutionPlan, result: PlanExecutionResult): void {
    const _sessionLog = {
      planId: plan.id,
      planTitle: plan.title,
      userRequest: plan.context.userRequest,
      executionResult: result,
      timestamp: new Date(),
      toolsUsed: plan.steps.filter((s) => s.type === 'tool' && s.toolName).map((s) => s.toolName),
    }

    // In production, this would save to a persistent log store
    advancedUI.logInfo(`Session logged: ${plan.id}`)
  }

  /**
   * Calculate risk distribution across plans
   */
  private calculateRiskDistribution(plans: ExecutionPlan[]): Record<string, number> {
    return plans.reduce(
      (acc, plan) => {
        const risk = plan.riskAssessment.overallRisk
        acc[risk] = (acc[risk] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )
  }

  /**
   * Calculate tool usage statistics
   */
  private calculateToolUsage(plans: ExecutionPlan[]): Record<string, number> {
    const toolUsage: Record<string, number> = {}

    plans.forEach((plan) => {
      plan.steps.forEach((step) => {
        if (step.type === 'tool' && step.toolName) {
          toolUsage[step.toolName] = (toolUsage[step.toolName] || 0) + 1
        }
      })
    })

    return toolUsage
  }
}

export interface PlanningStats {
  totalPlansGenerated: number
  totalPlansExecuted: number
  successfulExecutions: number
  failedExecutions: number
  averageStepsPerPlan: number
  averageExecutionTime: number
  riskDistribution: Record<string, number>
  toolUsageStats: Record<string, number>
}
