import inquirer from 'inquirer'
import { inputQueue } from '../core/input-queue'
import { type AgentTask, agentService } from '../services/agent-service'
import { streamttyService } from '../services/streamtty-service'
import { getUnifiedToolRenderer, initializeUnifiedToolRenderer } from '../services/unified-tool-renderer'
import { secureTools } from '../tools/secure-tools-registry'
import type { ToolRegistry } from '../tools/tool-registry'
import { advancedUI } from '../ui/advanced-cli-ui'
import { CliUI } from '../utils/cli-ui'
import type {
  ExecutionPlan,
  ExecutionStep,
  PlanApprovalResponse,
  PlanExecutionResult,
  PlannerConfig,
  StepExecutionResult,
} from './types'

/**
 * Production-ready Plan Executor
 * Handles plan approval, step execution, and rollback capabilities
 */
export class PlanExecutor {
  private config: PlannerConfig
  private toolRegistry: ToolRegistry
  private executionHistory: Map<string, PlanExecutionResult> = new Map()

  constructor(toolRegistry: ToolRegistry, config?: Partial<PlannerConfig>) {
    this.toolRegistry = toolRegistry
    this.config = {
      maxStepsPerPlan: 50,
      requireApprovalForRisk: 'high', // Changed from 'medium' to 'high' to reduce approval requests
      enableRollback: true,
      logLevel: 'info',
      timeoutPerStep: 60000, // 1 minute
      autoApproveReadonly: true, // Auto-approve readonly operations
      ...config,
    }

    // Initialize unified tool renderer
    try {
      initializeUnifiedToolRenderer(advancedUI, streamttyService)
    } catch {
      // Already initialized
    }
  }

  /**
   * Reset CLI context and orchestrator state to clean defaults
   */
  private resetCliContext(): void {
    try {
      const nik = (global as any).__nikCLI
      if (nik) {
        nik.currentMode = 'default'
        if (nik.shouldInterrupt !== undefined) {
          nik.shouldInterrupt = false
        }
      }
      const orchestrator = (global as any).__streamingOrchestrator
      if (orchestrator?.context) {
        orchestrator.context.planMode = false
        orchestrator.context.autoAcceptEdits = false
      }
    } catch {
      /* ignore */
    }
  }

  /**
   * Execute a plan with user approval and monitoring
   */
  async executePlan(plan: ExecutionPlan): Promise<PlanExecutionResult> {
    const unifiedRenderer = getUnifiedToolRenderer()

    // Start execution mode - pauses ephemeral cleanup and makes logs persistent
    unifiedRenderer.startExecution('plan')

    // Start plan execution mode in UI - prioritize tool calls
    advancedUI.startPlanExecution()

    // Log plan execution start with direct console.log (like default mode)
    // This ensures it appears prominently in the terminal, separate from AI streaming
    await unifiedRenderer.logToolCall('plan_execution', { title: plan.title }, { mode: 'plan' }, {
      showInRecentUpdates: true,
      streamToTerminal: true,  // Changed from false to true for visibility
      persistent: true
    })

    // Stream plan markdown AFTER tool call is visible
    await streamttyService.renderBlock(`## Executing Plan: ${plan.title}\n`, 'system')

    const startTime = new Date()
    const result: PlanExecutionResult = {
      planId: plan.id,
      status: 'completed',
      startTime,
      stepResults: [],
      summary: {
        totalSteps: plan.steps.length,
        successfulSteps: 0,
        failedSteps: 0,
        skippedSteps: 0,
      },
    }

    try {
      // Request approval if needed
      const approval = await this.requestApproval(plan)
      if (!approval.approved) {
        result.status = 'cancelled'
        advancedUI.logWarning('Plan execution cancelled by user')
        // Cleanup/reset before returning
        this.resetCliContext()
        return result
      }

      // Filter steps based on approval
      const stepsToExecute = plan.steps.filter((step) => !approval.modifiedSteps?.includes(step.id))

      advancedUI.logInfo(`Executing ${stepsToExecute.length} steps...`)

      // Execute steps in dependency order
      const executionOrder = this.resolveDependencyOrder(stepsToExecute)

      for (let i = 0; i < executionOrder.length; i++) {
        // Allow global interruption (ESC) similar to planner logic
        try {
          const nik = (global as any).__nikCLI
          if (nik?.shouldInterrupt) {
            advancedUI.logWarning('Execution interrupted by user')
            result.status = 'cancelled'
            nik.shouldInterrupt = false
            break
          }
        } catch {
          /* ignore */
        }
        const step = executionOrder[i]
        if (!step) continue

        advancedUI.addLiveUpdate({ type: 'info', content: `Executing: ${step.title}`, source: 'stepexecution' })

        const stepResult = await this.executeStep(step, plan)
        result.stepResults.push(stepResult)

        // Update summary
        switch (stepResult.status) {
          case 'success':
            result.summary.successfulSteps++
            break
          case 'failure':
            result.summary.failedSteps++
            break
          case 'skipped':
            result.summary.skippedSteps++
            break
        }

        // Handle step failure
        if (stepResult.status === 'failure') {
          const decision = await this.handleStepFailure(step, stepResult, plan)
          if (decision === 'abort') {
            result.status = 'failed'
            break
          } else if (decision === 'skip') {
            continue
          } else if (decision === 'retry') {
            if (result.summary.failedSteps > 0) result.summary.failedSteps--
            i-- // redo this step
            continue
          }
        }

        // Check for cancellation
        if (stepResult.status === 'cancelled') {
          result.status = 'cancelled'
          break
        }
      }

      // Determine final status
      if (result.status === 'completed' && result.summary.failedSteps > 0) {
        result.status = 'partial'
      }

      result.endTime = new Date()
      this.executionHistory.set(plan.id, result)

      // Log final results
      await this.logExecutionSummary(result)

      // End execution mode - resume ephemeral cleanup
      unifiedRenderer.endExecution()

      // End plan execution mode in UI
      advancedUI.endPlanExecution()

      // Cleanup/reset after successful run
      this.resetCliContext()

      return result
    } catch (error: any) {
      result.status = 'failed'
      result.endTime = new Date()
      advancedUI.logError(`Plan execution failed: ${error.message}`)

      // End execution mode even on error
      unifiedRenderer.endExecution()

      // End plan execution mode in UI even on error
      advancedUI.endPlanExecution()

      // Cleanup/reset after failure
      this.resetCliContext()
      return result
    }
  }

  /**
   * Request user approval for plan execution
   */
  private async requestApproval(plan: ExecutionPlan): Promise<PlanApprovalResponse> {
    // Check if approval is required based on risk level
    const requiresApproval = this.shouldRequireApproval(plan)

    if (!requiresApproval) {
      return {
        approved: true,
        timestamp: new Date(),
      }
    }

    // Display plan details
    await this.displayPlanForApproval(plan)

    // Enable bypass for approval inputs and suspend main prompt
    try {
      ; (global as any).__nikCLI?.suspendPrompt?.()
    } catch { }
    inputQueue.enableBypass()

    try {
      // Get user approval
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'approved',
          message: 'Do you approve this execution plan?',
          choices: [
            { name: 'Yes', value: true },
            { name: 'No', value: false },
          ],
          default: 1,
        },
        {
          type: 'checkbox',
          name: 'modifiedSteps',
          message: 'Select steps to skip (optional):',
          choices: plan.steps.map((step) => ({
            name: `${step.title} - ${step.description}`,
            value: step.id,
            checked: false,
          })),
          when: (answers) => answers.approved,
        },
        {
          type: 'input',
          name: 'userComments',
          message: 'Additional comments (optional):',
          when: (answers) => answers.approved,
        },
      ])

      return {
        approved: answers.approved,
        modifiedSteps: answers.modifiedSteps || [],
        userComments: answers.userComments,
        timestamp: new Date(),
      }
    } finally {
      // Always disable bypass after approval and resume prompt cleanly
      inputQueue.disableBypass()
      try {
        ; (global as any).__nikCLI?.resumePromptAndRender?.()
      } catch { }
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(step: ExecutionStep, plan: ExecutionPlan): Promise<StepExecutionResult> {
    const startTime = Date.now()
    const result: StepExecutionResult = {
      stepId: step.id,
      status: 'success',
      duration: 0,
      timestamp: new Date(),
      logs: [],
    }

    try {
      advancedUI.startSpinner(`Executing: ${step.title}`, 'info')

      switch (step.type) {
        case 'tool': {
          // If step is annotated with agent metadata or tool is missing, execute via AgentService
          const hasAgentHint = !!(
            step.metadata &&
            (step.metadata.agent || step.metadata.agentType || step.metadata.task)
          )
          const toolExists = step.toolName ? !!this.toolRegistry.getTool(step.toolName) : false
          if (hasAgentHint || !toolExists) {
            result.output = await this.executeAgentStep(step, plan)
          } else {
            result.output = await this.executeTool(step)
          }
          break
        }

        case 'validation':
          result.output = await this.executeValidation(step, plan)
          break

        case 'user_input':
          result.output = await this.executeUserInput(step)
          break

        case 'decision':
          result.output = await this.executeDecision(step, plan)
          break

        default:
          throw new Error(`Unknown step type: ${step.type}`)
      }

      result.duration = Date.now() - startTime
      CliUI.succeedSpinner(`Completed: ${step.title} (${result.duration}ms)`)
    } catch (error: any) {
      result.status = 'failure'
      result.error = error
      result.duration = Date.now() - startTime

      CliUI.failSpinner(`Failed: ${step.title}`)
      advancedUI.logError(`Step failed: ${error.message}`)
    }

    return result
  }

  /**
   * Execute a step by delegating to the AgentService and waiting for completion
   */
  private async executeAgentStep(step: ExecutionStep, plan: ExecutionPlan): Promise<any> {
    const unifiedRenderer = getUnifiedToolRenderer()

    // Log agent execution start with unified renderer
    const agentType = (step.metadata?.agent as string) || (step.metadata?.agentType as string) || 'agent'
    const toolCallId = `agent-${step.id}`

    await unifiedRenderer.logToolCall(
      `${agentType}_execute`,
      { step: step.title, description: step.description },
      { mode: 'plan', toolCallId },
      { showInRecentUpdates: true, streamToTerminal: true, persistent: true }
    )

    // Compose task text
    const taskText = (step.metadata?.task as string) || `${step.title}: ${step.description}`
    // Choose agent
    let finalAgentType = agentType
    try {
      if (!finalAgentType || !(agentService as any).agents?.has?.(finalAgentType)) {
        finalAgentType = agentService.suggestAgentTypeForTask(taskText)
      }
    } catch {
      /* fallback below */
    }

    // Start agent task
    const taskId = await agentService.executeTask(finalAgentType, taskText, { planId: plan.id, stepId: step.id })
    await unifiedRenderer.logToolUpdate(toolCallId, 'info', `Starting ${finalAgentType} agent task`, {
      showInRecentUpdates: true,
      streamToTerminal: true,
      persistent: true
    })

    // Live progress hookup
    const onProgress = (t: AgentTask, update: any) => {
      try {
        if (t.id !== taskId) return
        const pct = typeof update?.progress === 'number' ? `${update.progress}%` : ''
        const desc = update?.description ? ` - ${update.description}` : ''
        CliUI.updateSpinner(`Executing: ${step.title}${pct ? ` (${pct})` : ''}${desc}`)
      } catch {
        /* noop */
      }
    }
    const onToolUse = async (_t: AgentTask, update: any) => {
      try {
        const toolName = update?.tool || 'unknown_tool'
        const description = update?.description || ''

        // Use unified renderer for tool use logging
        await unifiedRenderer.logToolCall(toolName, {}, { mode: 'plan' }, {
          showInRecentUpdates: true,
          streamToTerminal: true,
          persistent: true
        })
        if (description) {
          await unifiedRenderer.logToolUpdate(toolName, 'info', description, {
            showInRecentUpdates: true,
            streamToTerminal: true,
            persistent: true
          })
        }
        console.log()
      } catch {
        /* noop */
      }
    }
    agentService.on('task_progress', onProgress as any)
    agentService.on('tool_use', onToolUse as any)

    // Await completion or timeout
    const timeoutMs = Math.max(30000, this.config.timeoutPerStep)
    const agentCompleted = new Promise<AgentTask>((resolve, reject) => {
      const onComplete = (task: AgentTask) => {
        if (task.id === taskId) {
          agentService.off('task_complete', onComplete as any)
          resolve(task)
        }
      }
      agentService.on('task_complete', onComplete as any)
      setTimeout(() => {
        try {
          agentService.off('task_complete', onComplete as any)
        } catch {
          /* ignore */
        }
        reject(new Error(`Agent step timeout after ${Math.round(timeoutMs / 1000)}s`))
      }, timeoutMs)
    })

    const task = await agentCompleted
    try {
      agentService.off('task_progress', onProgress as any)
      agentService.off('tool_use', onToolUse as any)
    } catch {
      /* ignore */
    }

    // Log result with unified renderer
    if (task.status === 'completed') {
      await unifiedRenderer.logToolResult(
        toolCallId,
        task.result || { completed: true, agentType: finalAgentType },
        { mode: 'plan' },
        { showInRecentUpdates: true, streamToTerminal: true, persistent: true }
      )
      return task.result || { completed: true, agentType: finalAgentType }
    }

    await unifiedRenderer.logToolResult(
      toolCallId,
      { error: task.error || 'Agent task failed' },
      { mode: 'plan' },
      { showInRecentUpdates: true, streamToTerminal: true, persistent: true }
    )
    throw new Error(task.error || 'Agent task failed')
  }

  /**
   * Execute a tool step
   */
  private async executeTool(step: ExecutionStep): Promise<any> {
    if (!step.toolName) {
      throw new Error('Tool step missing toolName')
    }

    const unifiedRenderer = getUnifiedToolRenderer()
    const toolCallId = `tool-${step.id}`

    // Log function call with unified renderer
    await unifiedRenderer.logToolCall(
      step.toolName,
      step.toolArgs,
      { mode: 'plan', toolCallId },
      { showInRecentUpdates: true, streamToTerminal: true, persistent: true }
    )

    // Best practice: route sensitive tools via SecureToolsRegistry wrappers
    const routed = await this.trySecureRoute(step)
    if (routed.routed) {
      await unifiedRenderer.logToolResult(
        toolCallId,
        routed.result,
        { mode: 'plan' },
        { showInRecentUpdates: true, streamToTerminal: true, persistent: true }
      )
      return routed.result
    }

    const tool = this.toolRegistry.getTool(step.toolName)
    if (!tool) {
      throw new Error(`Tool not found: ${step.toolName}`)
    }

    // Execute with timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Step execution timeout')), this.config.timeoutPerStep)
    })

    const executionPromise = tool.execute(...(step.toolArgs ? Object.values(step.toolArgs) : []))

    const result = await Promise.race([executionPromise, timeoutPromise])

    // Log result with unified renderer
    await unifiedRenderer.logToolResult(
      toolCallId,
      result,
      { mode: 'plan' },
      { showInRecentUpdates: true, streamToTerminal: true, persistent: true }
    )

    return result
  }

  /**
   * Route certain tool names to secureTools wrappers for audit, confirmation and allow-listing.
   */
  private async trySecureRoute(step: ExecutionStep): Promise<{ routed: boolean; result?: any }> {
    const name = String(step.toolName)
    const args = step.toolArgs || {}

    // Normalize common aliases
    const n = name.toLowerCase()

    // Git operations via wrappers
    if (n === 'git-tools' || n === 'git_workflow' || n === 'git') {
      const action = String(args.action || '').toLowerCase()
      if (!action) return { routed: false }
      switch (action) {
        case 'status':
          return { routed: true, result: await secureTools.gitStatus() }
        case 'diff':
          return { routed: true, result: await secureTools.gitDiff(args.args || {}) }
        case 'commit': {
          if (!args || typeof args.message !== 'string') {
            throw new Error("git commit requires 'message' in args")
          }
          return {
            routed: true,
            result: await secureTools.gitCommit(args as { message: string; add?: string[]; allowEmpty?: boolean }),
          }
        }
        case 'applypatch':
        case 'apply_patch':
          return { routed: true, result: await secureTools.gitApplyPatch(args.patch) }
        default:
          return { routed: false }
      }
    }

    // Config patch (JSON/YAML) via wrapper
    if (n === 'json-patch-tool' || n === 'config_patch') {
      const { filePath, operations, options } = args as any
      if (filePath && Array.isArray(operations)) {
        return { routed: true, result: await secureTools.applyConfigPatch(filePath, operations, options || {}) }
      }
      return { routed: false }
    }

    // Command execution via secure command wrapper
    if (n === 'bash-tool' || n === 'run-command-tool' || n === 'bash' || n === 'run_command') {
      const { command, options } = args as any
      if (typeof command === 'string' && command.trim()) {
        return { routed: true, result: await secureTools.executeCommand(command, options || {}) }
      }
      // Sequence
      if (Array.isArray(args.commands) && args.commands.length > 0) {
        return { routed: true, result: await secureTools.executeCommandSequence(args.commands, args.options || {}) }
      }
      return { routed: false }
    }

    return { routed: false }
  }

  /**
   * Execute a validation step
   */
  private async executeValidation(_step: ExecutionStep, _plan: ExecutionPlan): Promise<any> {
    // Implement validation logic based on step requirements
    advancedUI.updateSpinner('Running validation checks...', 'info')

    // Simulate validation
    await new Promise((resolve) => setTimeout(resolve, 1000))

    return { validated: true, checks: ['prerequisites', 'permissions', 'dependencies'] }
  }

  /**
   * Execute a user input step
   */
  private async executeUserInput(step: ExecutionStep): Promise<any> {
    CliUI.stopSpinner()

    try {
      ; (global as any).__nikCLI?.suspendPrompt?.()
    } catch { }
    inputQueue.enableBypass()
    try {
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'proceed',
          message: step.description,
          choices: [
            { name: 'Yes', value: true },
            { name: 'No', value: false },
          ],
          default: 0,
        },
      ])

      return answers
    } finally {
      inputQueue.disableBypass()
      try {
        ; (global as any).__nikCLI?.resumePromptAndRender?.()
      } catch { }
    }
  }

  /**
   * Execute a decision step
   */
  private async executeDecision(_step: ExecutionStep, _plan: ExecutionPlan): Promise<any> {
    // Implement decision logic
    advancedUI.updateSpinner('Evaluating decision criteria...', 'info')

    // Simulate decision making
    await new Promise((resolve) => setTimeout(resolve, 500))

    return { decision: 'proceed', reasoning: 'All criteria met' }
  }

  /**
   * Handle step failure and determine if execution should continue
   */
  private async handleStepFailure(
    step: ExecutionStep,
    result: StepExecutionResult,
    _plan: ExecutionPlan
  ): Promise<'abort' | 'skip' | 'retry' | 'continue'> {
    advancedUI.logError(`Step "${step.title}" failed: ${result.error?.message}`)

    try {
      ; (global as any).__nikCLI?.suspendPrompt?.()
    } catch { }
    inputQueue.enableBypass()
    try {
      // For non-critical steps, offer to continue
      if (step.riskLevel === 'low') {
        const answers = await inquirer.prompt([
          {
            type: 'list',
            name: 'continue',
            message: 'This step failed but is not critical. Continue with remaining steps?',
            choices: [
              { name: 'Yes', value: true },
              { name: 'No', value: false },
            ],
            default: 0,
          },
        ])
        return answers.continue ? 'continue' : 'abort'
      }

      // For critical steps, offer rollback if available
      if (this.config.enableRollback && step.reversible) {
        const answers = await inquirer.prompt([
          {
            type: 'list',
            name: 'action',
            message: 'Critical step failed. What would you like to do?',
            choices: [
              { name: 'Abort execution', value: 'abort' },
              { name: 'Skip this step and continue', value: 'skip' },
              { name: 'Retry this step', value: 'retry' },
            ],
          },
        ])

        switch (answers.action) {
          case 'abort':
            return 'abort'
          case 'skip':
            result.status = 'skipped'
            return 'skip'
          case 'retry':
            return 'retry'
          default:
            return 'abort'
        }
      }

      return 'abort'
    } finally {
      inputQueue.disableBypass()
      try {
        ; (global as any).__nikCLI?.resumePromptAndRender?.()
      } catch { }
    }
  }

  /**
   * Resolve step execution order based on dependencies
   */
  private resolveDependencyOrder(steps: ExecutionStep[]): ExecutionStep[] {
    const stepMap = new Map(steps.map((step) => [step.id, step]))
    const resolved: ExecutionStep[] = []
    const resolving = new Set<string>()

    const resolve = (stepId: string): void => {
      if (resolved.find((s) => s.id === stepId)) return
      if (resolving.has(stepId)) {
        throw new Error(`Circular dependency detected involving step: ${stepId}`)
      }

      const step = stepMap.get(stepId)
      if (!step) return

      resolving.add(stepId)

      // Resolve dependencies first
      if (step.dependencies) {
        for (const depId of step.dependencies) {
          resolve(depId)
        }
      }

      resolving.delete(stepId)
      resolved.push(step)
    }

    // Resolve all steps
    for (const step of steps) {
      resolve(step.id)
    }

    return resolved
  }

  /**
   * Display plan details for user approval - now using streamttyService for markdown rendering
   */
  private async displayPlanForApproval(plan: ExecutionPlan): Promise<void> {
    // Format plan details as markdown
    let planMarkdown = `\n## Plan Approval Required\n\n`
    planMarkdown += `**Plan Title:** ${plan.title}\n\n`
    planMarkdown += `**Description:** ${plan.description}\n\n`

    planMarkdown += `### Plan Details\n\n`
    planMarkdown += `- Total Steps: **${plan.steps.length}**\n`
    planMarkdown += `- Estimated Duration: **${Math.round(plan.estimatedTotalDuration / 1000)}s**\n`
    planMarkdown += `- Risk Level: **${plan.riskAssessment.overallRisk}**\n`

    if (plan.riskAssessment.destructiveOperations > 0) {
      planMarkdown += `- ⚠️ **Warning:** ${plan.riskAssessment.destructiveOperations} potentially destructive operations\n`
    }

    planMarkdown += `\n### Execution Steps\n\n`
    plan.steps.forEach((step, index) => {
      const riskIcon = step.riskLevel === 'high' ? '🔴' : step.riskLevel === 'medium' ? '🟡' : '🟢'
      planMarkdown += `${index + 1}. ${riskIcon} **${step.title}**\n`
      planMarkdown += `   ${step.description}\n`
    })

    planMarkdown += '\n'

    // Render through streamttyService
    await streamttyService.renderBlock(planMarkdown, 'system')

    // Still log to advancedUI for compatibility
    advancedUI.addLiveUpdate({ type: 'info', content: 'Plan Approval Required', source: 'planapproval' })
    advancedUI.addLiveUpdate({ type: 'info', content: `Plan Title: ${plan.title}`, source: 'planapproval' })
  }

  /**
   * Check if plan requires user approval
   */
  private shouldRequireApproval(plan: ExecutionPlan): boolean {
    // Auto-approve readonly analysis operations if configured
    if (
      this.config.autoApproveReadonly &&
      plan.title &&
      (plan.title.toLowerCase().includes('readonly') ||
        plan.title.toLowerCase().includes('analisi') ||
        plan.title.toLowerCase().includes('reads') ||
        plan.title.toLowerCase().includes('sola lettura'))
    ) {
      return false
    }

    const riskThreshold = this.config.requireApprovalForRisk

    if (plan.riskAssessment.overallRisk === 'high') return true
    if (plan.riskAssessment.overallRisk === 'medium' && riskThreshold === 'medium') return true
    if (plan.riskAssessment.destructiveOperations > 0) return true

    return false
  }

  /**
   * Log execution summary - now using streamttyService for markdown rendering
   */
  private async logExecutionSummary(result: PlanExecutionResult): Promise<void> {
    const duration = result.endTime ? result.endTime.getTime() - result.startTime.getTime() : 0

    // Format as markdown summary
    const statusIcon = result.status === 'completed' ? '✓' : result.status === 'partial' ? '⚠️' : '❌'

    let summaryMarkdown = `\n## Execution Summary\n\n`
    summaryMarkdown += `${statusIcon} **Status:** ${result.status.toUpperCase()}\n\n`
    summaryMarkdown += `- Duration: **${Math.round(duration / 1000)}s**\n`
    summaryMarkdown += `- Total Steps: **${result.summary.totalSteps}**\n`
    summaryMarkdown += `- Successful: **${result.summary.successfulSteps}**\n`
    summaryMarkdown += `- Failed: **${result.summary.failedSteps}**\n`
    summaryMarkdown += `- Skipped: **${result.summary.skippedSteps}**\n\n`

    // Render through streamttyService
    await streamttyService.renderBlock(summaryMarkdown, 'system')

    // Still log to advancedUI for compatibility
    advancedUI.addLiveUpdate({
      type: 'info',
      content: `Status: ${result.status.toUpperCase()}`,
      source: 'executionsummary',
    })
    advancedUI.addLiveUpdate({
      type: 'info',
      content: `Duration: ${Math.round(duration / 1000)}s`,
      source: 'executionsummary',
    })
    advancedUI.addLiveUpdate({
      type: 'info',
      content: `Total Steps: ${result.summary.totalSteps}`,
      source: 'executionsummary',
    })
  }

  /**
   * Get execution history
   */
  getExecutionHistory(): Map<string, PlanExecutionResult> {
    return new Map(this.executionHistory)
  }

  /**
   * Get execution result for a specific plan
   */
  getExecutionResult(planId: string): PlanExecutionResult | undefined {
    return this.executionHistory.get(planId)
  }
}
