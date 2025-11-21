import chalk from 'chalk'
import path from 'node:path'
import fs from 'node:fs/promises'
import { nanoid } from 'nanoid'
import { advancedUI } from './advanced-cli-ui'

/**
 * PlanHUD - Handles plan HUD display and management
 * Extracted from lines 5554-5766 in nik-cli.ts
 */
export class PlanHUD {
  private nikCLI: any

  constructor(nikCLI: any) {
    this.nikCLI = nikCLI
  }

  clearPlanHudSubscription(): void {
    if (this.nikCLI.planHudUnsubscribe) {
      this.nikCLI.planHudUnsubscribe()
      this.nikCLI.planHudUnsubscribe = undefined
    }
  }

  hidePlanHud(): void {
    this.nikCLI.planHudVisible = false
    this.nikCLI.renderPromptAfterOutput()
  }

  showPlanHud(): void {
    this.nikCLI.planHudVisible = true
    this.nikCLI.renderPromptAfterOutput()
  }

  clearPlanHud(): void {
    this.nikCLI.activePlanForHud = undefined
    this.clearPlanHudSubscription()
    void this.nikCLI.renderPromptArea()
  }

  finalizePlanHud(state: 'completed' | 'failed'): void {
    if (!this.nikCLI.activePlanForHud) return

    this.nikCLI.activePlanForHud.todos.forEach((todo: any) => {
      if (state === 'completed') {
        todo.status = todo.status === 'failed' ? 'failed' : 'completed'
        todo.progress = 100
      } else if (todo.status !== 'completed') {
        todo.status = 'failed'
        todo.progress = 0
      }
    })

    void this.persistActivePlanTodoFile()

    // Only clear the HUD if ALL tasks are successfully completed (not failed)
    const allTasksSuccessfullyCompleted = this.nikCLI.activePlanForHud.todos.every(
      (todo: any) => todo.status === 'completed'
    )

    if (allTasksSuccessfullyCompleted && state === 'completed') {
      // Send plan completion notification (silent)
      void this.nikCLI.sendPlanCompletionNotification(this.nikCLI.activePlanForHud, true)

      // Clear the HUD completely when ALL tasks are successfully completed
      this.nikCLI.activePlanForHud = undefined
      console.log(chalk.green('\n🎉 All tasks completed successfully! HUD cleared.'))
    }

    this.clearPlanHudSubscription()
    void this.nikCLI.renderPromptArea()
    void this.nikCLI.cleanupPlanArtifacts()
  }

  initializePlanHud(plan: any): void {
    if (!plan || !Array.isArray(plan.todos)) return

    this.clearPlanHudSubscription()
    this.nikCLI.activePlanForHud = {
      id: String(plan.id || nanoid()),
      title: plan.title || 'Plan Todos',
      description: plan.description,
      userRequest: plan.userRequest,
      estimatedTotalDuration: plan.estimatedTotalDuration,
      riskAssessment: plan.riskAssessment,
      todos: plan.todos.map((todo: any) => ({
        id: String(todo.id || nanoid()),
        title: todo.title || todo.description || 'Untitled task',
        description: todo.description,
        status: (todo.status || 'pending') as 'pending' | 'in_progress' | 'completed' | 'failed',
        priority: todo.priority,
        progress: todo.progress,
        reasoning: todo.reasoning,
        tools: todo.tools,
      })),
    }
    void this.nikCLI.renderPromptArea()
  }

  updatePlanHudTodoStatus(todoId: string, status: 'pending' | 'in_progress' | 'completed' | 'failed'): void {
    if (!this.nikCLI.activePlanForHud) return

    const todo = this.nikCLI.activePlanForHud.todos.find((t: any) => t.id === todoId)
    if (!todo) return

    todo.status = status
    if (status === 'completed') {
      todo.progress = 100
    } else if (status === 'in_progress') {
      todo.progress = Math.max(todo.progress ?? 0, 15)
    } else if (status === 'failed') {
      todo.progress = 0
    }

    void this.persistActivePlanTodoFile()
    if (this.nikCLI.activePlanForHud?.todos.every((t: any) => t.status === 'completed' || t.status === 'failed')) {
      // Check if all tasks were completed successfully vs some failed
      const allSuccessful = this.nikCLI.activePlanForHud.todos.every((t: any) => t.status === 'completed')

      // Add delay to ensure all streaming output is flushed before cleanup
      setTimeout(() => {
        this.finalizePlanHud(allSuccessful ? 'completed' : 'failed')
      }, 500) // 500ms delay to ensure output is complete
    } else {
      void this.nikCLI.renderPromptArea()
    }
  }

  async cleanupPlanArtifacts(): Promise<void> {
    // CRITICAL: Prevent race conditions with cleanup lock
    if (this.nikCLI.cleanupInProgress) {
      advancedUI.logFunctionUpdate('info', 'Cleanup already in progress, skipping...')
      return
    }

    this.nikCLI.cleanupInProgress = true
    advancedUI.logFunctionCall('cleanup_plan_artifacts')

    try {
      // Cleanup todo.md with error handling
      const todoPath = path.join(this.nikCLI.workingDirectory, 'todo.md')
      try {
        await fs.unlink(todoPath)
        advancedUI.logFunctionUpdate('info', 'Removed todo.md')
      } catch (error: any) {
        // Only log if file exists but deletion failed (not if file doesn't exist)
        if (error.code !== 'ENOENT') {
          advancedUI.logFunctionUpdate('warning', `Could not remove todo.md: ${error.message}`)
        }
      }

      // Cleanup taskmaster directory with error handling
      const taskmasterDir = path.join(this.nikCLI.workingDirectory, '.nikcli', 'taskmaster')
      try {
        await fs.rm(taskmasterDir, { recursive: true, force: true })
        advancedUI.logFunctionUpdate('info', 'Cleaned taskmaster directory')
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          advancedUI.logFunctionUpdate('warning', `Could not clean taskmaster directory: ${error.message}`)
        }
      }

      advancedUI.logFunctionUpdate('success', 'Plan artifacts cleanup completed')
    } catch (error: any) {
      advancedUI.logFunctionUpdate('error', `Cleanup error: ${error.message}`)
    } finally {
      // CRITICAL: Always reset cleanup flag
      this.nikCLI.cleanupInProgress = false
    }
  }

  async persistActivePlanTodoFile(): Promise<void> {
    if (!this.nikCLI.activePlanForHud) return
    try {
      await this.nikCLI.saveTaskMasterPlanToFile(this.nikCLI.activePlanForHud, 'todo.md', { silent: true })
    } catch (error: any) {
      advancedUI.logFunctionUpdate('warning', `Could not update todo.md: ${error.message}`)
    }
  }

  buildPlanHudLines(maxWidth: number): string[] {
    if (!this.nikCLI.activePlanForHud) return []
    const todos = this.nikCLI.activePlanForHud.todos
    if (!todos || todos.length === 0) return []

    const usableWidth = Math.max(20, maxWidth - 2)
    const lines: string[] = [chalk.bold('Todos')]

    for (const todo of todos) {
      const icon =
        todo.status === 'completed'
          ? chalk.green('☑')
          : todo.status === 'in_progress'
            ? chalk.yellow('▸')
            : todo.status === 'failed'
              ? chalk.red('✖')
              : chalk.gray('☐')

      let label: string
      if (todo.status === 'completed') {
        label = chalk.gray.strikethrough(todo.title)
      } else if (todo.status === 'failed') {
        label = chalk.red(todo.title)
      } else if (todo.status === 'in_progress') {
        label = chalk.bold(todo.title)
      } else {
        label = chalk.white(todo.title)
      }

      const cleanedDescription =
        typeof todo.description === 'string' ? todo.description.replace(/\s+/g, ' ').trim() : ''
      if (cleanedDescription) {
        const descStyle = todo.status === 'in_progress' ? chalk.gray : chalk.dim
        label += descStyle(` — ${cleanedDescription}`)
      }

      const iconSegment = ` ${icon} `
      const iconWidth = this.nikCLI._stripAnsi(iconSegment).length
      const remainingWidth = Math.max(5, usableWidth - iconWidth)

      let detailSegment = label
      const plainDetail = this.nikCLI._stripAnsi(detailSegment)
      if (plainDetail.length > remainingWidth) {
        const truncated = `${plainDetail.slice(0, Math.max(1, remainingWidth - 1))}…`
        detailSegment = truncated
      }

      lines.push(`${iconSegment}${detailSegment}`)
    }

    return lines
  }
}
