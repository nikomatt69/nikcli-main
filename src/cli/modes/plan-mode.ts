import chalk from 'chalk'
import path from 'node:path'
import { advancedUI } from '../ui/advanced-cli-ui'
import { planningService } from '../services/planning-service'
import { enhancedPlanning } from '../core/enhanced-planning'
import { inputQueue } from '../core/input-queue'

/**
 * PlanMode - Handles plan mode execution
 * Extracted from lines 3974-4213 in nik-cli.ts
 */
export class PlanMode {
  private nikCLI: any

  constructor(nikCLI: any) {
    this.nikCLI = nikCLI
  }

  async handlePlanMode(input: string): Promise<void> {
    // CRITICAL: Recursion depth protection
    if (this.nikCLI.recursionDepth >= this.nikCLI.MAX_RECURSION_DEPTH) {
      advancedUI.addLiveUpdate({
        type: 'error',
        content: `Maximum plan generation depth reached (${this.nikCLI.MAX_RECURSION_DEPTH})`,
        source: 'plan_mode',
      })
      advancedUI.addLiveUpdate({
        type: 'warning',
        content: 'Returning to default mode for safety...',
        source: 'plan_mode',
      })
      this.nikCLI.forceRecoveryToDefaultMode()
      return
    }

    this.nikCLI.recursionDepth++
    advancedUI.addLiveUpdate({
      type: 'info',
      content: `Plan depth: ${this.nikCLI.recursionDepth}/${this.nikCLI.MAX_RECURSION_DEPTH}`,
      source: 'plan_mode',
    })

    // Force compact mode for cleaner stream in plan flow
    try {
      process.env.NIKCLI_COMPACT = '1'
      process.env.NIKCLI_SUPER_COMPACT = '1'
    } catch {
      // Ignore env setting errors
    }
    this.nikCLI.addLiveUpdate({
      type: 'info',
      content: '🎯 Entering Enhanced Planning Mode with TaskMaster AI...',
      source: 'planning',
    })

    try {
      await this.nikCLI.cleanupPlanArtifacts()
      // Start progress indicator using our new methods
      const planningId = `planning-${Date.now()}`
      this.nikCLI.createStatusIndicator(planningId, 'Generating comprehensive plan with TaskMaster AI', input)
      this.nikCLI.startAdvancedSpinner(planningId, 'Analyzing requirements and generating plan...')

      // Try TaskMaster first, fallback to enhanced planning
      let plan: any
      let usedTaskMaster = false

      try {
        // Use the singleton planning service with TaskMaster integration
        const executionPlan = await planningService.createPlan(input, {
          showProgress: false, // We'll handle our own progress
          autoExecute: true,
          confirmSteps: true,
          useTaskMaster: true, // Enable TaskMaster
          fallbackToLegacy: true, // Allow fallback
        })

        // Convert ExecutionPlan to the format expected by existing code
        plan = {
          id: executionPlan.id,
          title: executionPlan.title,
          description: executionPlan.description,
          todos: executionPlan.todos || [],
          estimatedTotalDuration: Math.round(executionPlan.estimatedTotalDuration / 1000 / 60), // Convert ms to minutes
          riskAssessment: executionPlan.riskAssessment,
          userRequest: input,
        }

        usedTaskMaster = true
        this.nikCLI.addLiveUpdate({ type: 'log', content: '✓ TaskMaster AI plan generated', source: 'planning' })

        this.nikCLI.initializePlanHud(plan)

        // Save TaskMaster plan to todo.md for compatibility
        try {
          await this.nikCLI.saveTaskMasterPlanToFile(plan, 'todo.md')
        } catch (saveError: any) {
          this.nikCLI.addLiveUpdate({
            type: 'warning',
            content: `⚠️ Could not save todo.md: ${saveError.message}`,
            source: 'planning',
          })
        }
      } catch (error: any) {
        this.nikCLI.addLiveUpdate({
          type: 'warning',
          content: `⚠️ TaskMaster planning failed: ${error.message}`,
          source: 'planning',
        })
        this.nikCLI.addLiveUpdate({ type: 'info', content: '⚡︎ Falling back to enhanced planning...', source: 'planning' })

        // Fallback to original enhanced planning
        plan = await enhancedPlanning.generatePlan(input, {
          maxTodos: 15,
          includeContext: true,
          showDetails: false,
          saveTodoFile: true,
          todoFilePath: 'todo.md',
        })

        this.nikCLI.initializePlanHud({
          id: plan.id,
          title: plan.title,
          description: plan.description,
          userRequest: input,
          estimatedTotalDuration: plan.estimatedTotalDuration,
          riskAssessment: plan.riskAssessment,
          todos: plan.todos,
        })
      }

      this.nikCLI.stopAdvancedSpinner(
        planningId,
        true,
        `Plan generated with ${plan.todos.length} todos${usedTaskMaster ? ' (TaskMaster AI)' : ' (Enhanced)'}`
      )

      // Send plan started notification
      void this.nikCLI.sendPlanStartedNotification(plan, [])

      // Show plan summary (only in non-compact mode)
      if (process.env.NIKCLI_COMPACT !== '1') {
        this.nikCLI.addLiveUpdate({ type: 'log', content: '📋 Plan Generated', source: 'planning' })
        this.nikCLI.addLiveUpdate({
          type: 'log',
          content: `✓ Todo file saved: ${path.join(this.nikCLI.workingDirectory, 'todo.md')}`,
          source: 'planning',
        })
        this.nikCLI.addLiveUpdate({ type: 'info', content: `📊 ${plan.todos.length} todos created`, source: 'planning' })
        this.nikCLI.addLiveUpdate({
          type: 'info',
          content: `⏱️ Estimated duration: ${Math.round(plan.estimatedTotalDuration)} minutes`,
          source: 'planning',
        })
      }

      // Plan generated successfully - now ask if user wants to START the tasks
      const { approvalSystem } = await import('../ui/approval-system')
      const startTasks = await approvalSystem.confirmPlanAction(
        'Do you want to START the tasks generated in the plan?',
        'This will begin with Task 1 and proceed step-by-step',
        false
      )

      if (startTasks) {
        // Start with first task instead of executing entire plan
        let executionSuccess = true
        try {
          const { TaskExecutor } = await import('../execution/task-executor')
          const taskExecutor = new TaskExecutor(this.nikCLI)
          await taskExecutor.startFirstTask(plan)
        } catch (error: any) {
          executionSuccess = false
          this.nikCLI.addLiveUpdate({
            type: 'error',
            content: `❌ Task execution failed: ${error.message}`,
            source: 'planning',
          })
        }

        // Send plan completion notification
        void this.nikCLI.sendPlanCompletionNotification(plan, executionSuccess)

        // After task execution, return to default mode
        this.nikCLI.addLiveUpdate({ type: 'log', content: '⚡︎ Returning to default mode...', source: 'planning' })
        this.nikCLI.currentMode = 'default'

        try {
          inputQueue.disableBypass()
        } catch {
          // Ignore errors
        }
        try {
          advancedUI.stopInteractiveMode?.()
        } catch {
          // Ignore errors
        }
        this.nikCLI.resumePromptAndRender()
      } else {
        this.nikCLI.addLiveUpdate({ type: 'info', content: '📝 Plan saved to todo.md', source: 'planning' })

        // Ask if they want to generate a NEW plan instead
        const newPlan = await approvalSystem.confirmPlanAction(
          'Do you want to generate a NEW plan instead?',
          'This will overwrite the current plan in todo.md',
          false
        )

        if (newPlan) {
          const newRequirements = await approvalSystem.promptInput('Enter new requirements: ')
          if (newRequirements.trim()) {
            // CRITICAL: Wrap recursive call in try/catch to prevent unhandled rejections
            try {
              await this.handlePlanMode(newRequirements)
            } catch (error: any) {
              this.nikCLI.addLiveUpdate({
                type: 'error',
                content: `❌ Plan regeneration failed: ${error.message}`,
                source: 'planning',
              })
              this.nikCLI.addLiveUpdate({
                type: 'warning',
                content: '⚡︎ Forcing recovery to default mode...',
                source: 'planning',
              })
              this.nikCLI.forceRecoveryToDefaultMode()
            }
            return
          }
        }

        // User declined new plan, exit plan mode and return to default
        // Send plan completion notification (not executed but saved)
        void this.nikCLI.sendPlanCompletionNotification(plan, true)

        this.nikCLI.addLiveUpdate({ type: 'log', content: '⚡︎ Returning to normal mode...', source: 'planning' })
        this.nikCLI.currentMode = 'default'

        try {
          inputQueue.disableBypass()
        } catch {
          // Ignore errors
        }
        try {
          advancedUI.stopInteractiveMode?.()
        } catch {
          // Ignore errors
        }

        this.nikCLI.cleanupPlanArtifacts()
        this.nikCLI.resumePromptAndRender()
      }
    } catch (error: any) {
      this.nikCLI.addLiveUpdate({ type: 'error', content: `❌ Planning failed: ${error.message}`, source: 'planning' })
      this.nikCLI.addLiveUpdate({ type: 'warning', content: '⚡︎ Forcing recovery to default mode...', source: 'planning' })

      // CRITICAL: Force recovery on any error
      this.nikCLI.forceRecoveryToDefaultMode()
    } finally {
      // CRITICAL: Always decrement recursion depth
      this.nikCLI.recursionDepth = Math.max(0, this.nikCLI.recursionDepth - 1)
      this.nikCLI.addLiveUpdate({
        type: 'info',
        content: `📉 Plan depth restored: ${this.nikCLI.recursionDepth}`,
        source: 'planning',
      })

      // Final cleanup
      void this.nikCLI.cleanupPlanArtifacts()
    }
  }
}
