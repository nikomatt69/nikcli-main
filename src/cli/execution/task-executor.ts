import chalk from 'chalk'
import { advancedUI } from '../ui/advanced-cli-ui'
import { advancedAIProvider } from '../ai/advanced-ai-provider'
import { getUnifiedToolRenderer } from '../services/unified-tool-renderer'

/**
 * TaskExecutor - Handles task execution
 * Extracted from lines 4575-5551 in nik-cli.ts
 */
export class TaskExecutor {
  private nikCLI: any

  constructor(nikCLI: any) {
    this.nikCLI = nikCLI
  }

  async startFirstTask(plan: any): Promise<void> {
    advancedUI.logFunctionCall('task_execution_step_by_step')

    const todos = Array.isArray(plan?.todos) ? plan.todos : []
    if (todos.length === 0) {
      advancedUI.logFunctionUpdate('warning', 'No tasks found in the plan')
      return
    }

    // Find first pending task
    let currentTaskIndex = 0
    let currentTask = todos.find((t: { status: string }) => t.status === 'pending')

    if (!currentTask && todos.length > 0) {
      // If no pending tasks, start with first task
      currentTask = todos[0]
      currentTaskIndex = 0
    }

    if (!currentTask) {
      advancedUI.logFunctionUpdate('warning', 'No tasks to execute')
      return
    }

    // Execute tasks one by one
    while (currentTask) {
      advancedUI.logFunctionUpdate('info', `Task ${currentTaskIndex + 1}/${todos.length}: ${currentTask.title}`)
      if (currentTask.description) {
        advancedUI.logFunctionUpdate('info', `${currentTask.description}`)
      }

      try {
        // Mark task as in progress
        currentTask.status = 'in_progress'
        currentTask.progress = 0
        this.nikCLI.updatePlanHudTodoStatus(currentTask.id, 'in_progress')

        // Send task started notification
        void this.nikCLI.sendTaskStartedNotification(plan, currentTask, [])

        // Execute the task using existing logic
        await this.executeTaskWithToolchains(currentTask, plan)

        // Mark task as completed
        currentTask.status = 'completed'
        currentTask.progress = 100
        currentTask.completedAt = new Date()
        this.nikCLI.updatePlanHudTodoStatus(currentTask.id, 'completed')

        // Send task completion notification
        void this.nikCLI.sendTaskCompletionNotification(plan, currentTask, [], true)

        advancedUI.logFunctionUpdate('success', `Task ${currentTaskIndex + 1} completed: ${currentTask.title}`)

        // Find next pending task
        currentTaskIndex++
        const nextTask = todos.slice(currentTaskIndex).find((t: { status: string }) => t.status === 'pending')

        if (nextTask) {
          // Ask if user wants to continue with next task
          const { approvalSystem } = await import('../ui/approval-system')
          const continueNext = await approvalSystem.confirmPlanAction(
            `Continue with next task? (${currentTaskIndex + 1}/${todos.length})`,
            `Next: ${nextTask.title}`,
            true
          )

          if (continueNext) {
            currentTask = nextTask
            currentTaskIndex = todos.indexOf(nextTask)
          } else {
            console.log(chalk.yellow('⏸️ Task execution stopped by user'))
            break
          }
        } else {
          currentTask = null // No more tasks
        }
      } catch (error: any) {
        advancedUI.logFunctionUpdate('error', `Task execution error: ${error.message}`)

        // Mark task as failed
        currentTask.status = 'failed'
        this.nikCLI.updatePlanHudTodoStatus(currentTask.id, 'failed')

        // Send task completion notification (failed)
        void this.nikCLI.sendTaskCompletionNotification(plan, currentTask, [], false)

        // Ask if user wants to continue with next task despite the error
        const { approvalSystem } = await import('../ui/approval-system')
        const continueAfterError = await approvalSystem.confirmPlanAction(
          'Task failed. Continue with next task?',
          'You can continue with other tasks or stop execution',
          false
        )

        if (continueAfterError) {
          currentTaskIndex++
          currentTask = todos.slice(currentTaskIndex).find((t: { status: string }) => t.status === 'pending')
          if (currentTask) {
            currentTaskIndex = todos.indexOf(currentTask)
          }
        } else {
          break
        }
      }
    }

    // Show final summary
    const completed = todos.filter((t: { status: string }) => t.status === 'completed').length
    const failed = todos.filter((t: { status: string }) => t.status === 'failed').length
    const pending = todos.filter((t: { status: string }) => t.status === 'pending').length

    advancedUI.logFunctionCall('task_execution_summary')
    advancedUI.logFunctionUpdate('success', `Completed: ${completed}`)
    if (failed > 0) advancedUI.logFunctionUpdate('error', `Failed: ${failed}`)
    if (pending > 0) advancedUI.logFunctionUpdate('warning', `Remaining: ${pending}`)
  }

  async executeAgentWithPlanModeStreaming(
    agent: any,
    task: string,
    agentName: string,
    tools: any[]
  ): Promise<void> {
    advancedUI.logInfo(`⚡︎ Executing: ${agentName} - ${task}`, 'plan-exec')

    // Get unified tool renderer
    const unifiedRenderer = getUnifiedToolRenderer()
    try {
      // Start parallel execution mode - pauses ephemeral cleanup and makes tool logs persistent
      unifiedRenderer.startExecution('parallel')

      // Create messages like plan mode
      const messages = [{ role: 'user' as const, content: task }]
      let streamCompleted = false
      // Track streaming output for formatting (same as default mode)
      let assistantText = ''
      let shouldFormatOutput = false
      let streamedLines = 0
      const terminalWidth = process.stdout.columns || 80
      let lastToolName: string | undefined // Track last tool for result correlation
      let activeToolCallId: string | undefined // Track active tool call ID

      // Stream directly through streamttyService (no bridge needed)
      const { streamttyService } = await import('../services/streamtty-service')

      // Use the same streaming as plan mode
      for await (const ev of advancedAIProvider.streamChatWithFullAutonomy(messages)) {
        // Handle all streaming events exactly like plan mode
        switch (ev.type) {
          case 'text_delta':
            // Stream text in dark gray like default mode
            if (ev.content) {
              assistantText += ev.content
              await streamttyService.streamChunk(ev.content, 'ai')

              // Track lines for clearing (same as default mode)
              const visualContent = ev.content.replace(/\x1b\[[0-9;]*m/g, '')
              const newlines = (visualContent.match(/\n/g) || []).length
              const charsWithoutNewlines = visualContent.replace(/\n/g, '').length
              const wrappedLines = Math.ceil(charsWithoutNewlines / terminalWidth)
              streamedLines += newlines + wrappedLines
            }
            break

          case 'tool_call': {
            // Use unified renderer for tool call logging (same as default mode)
            const toolName = ev.toolName || 'unknown_tool'
            const toolCallId = `plan-${toolName}-${Date.now()}`
            await unifiedRenderer.logToolCall(
              toolName,
              ev.toolArgs,
              { mode: 'plan', toolCallId, agentName },
              { showInRecentUpdates: true, streamToTerminal: true, persistent: true }
            )
            activeToolCallId = toolCallId
            lastToolName = toolName
            break
          }

          case 'tool_result': {
            // Use unified renderer for tool result logging (same as default mode)
            if (activeToolCallId) {
              await unifiedRenderer.logToolResult(
                activeToolCallId,
                ev.toolResult,
                { mode: 'plan', agentName },
                { showInRecentUpdates: true, streamToTerminal: true, persistent: true }
              )
            }
            activeToolCallId = undefined
            break
          }

          case 'complete':
            // Mark that we should format output after stream ends (like default mode)
            if (assistantText.length > 200) {
              shouldFormatOutput = true
            }
            streamCompleted = true
            break

          case 'error':
            // Stream error
            this.nikCLI.addLiveUpdate({ type: 'error', content: `❌ ${agentName} error: ${ev.error}`, source: 'plan-exec' })
            throw new Error(ev.error)
        }
      }

      // Clear streamed output and show formatted version if needed (same as default mode)
      if (shouldFormatOutput) {
        // Just add spacing
        console.log('')
      } else {
        // No formatting needed - add spacing after stream
        console.log('\n')
      }

      if (!streamCompleted) {
        throw new Error('Stream did not complete properly')
      }

      // Store agent's output in collaboration context if it exists
      if ((agent as any).collaborationContext) {
        const ctx = (agent as any).collaborationContext
        ctx.sharedData.set(`${agent.id}:current-output`, assistantText)
      }
    } catch (error: any) {
      this.nikCLI.addLiveUpdate({
        type: 'error',
        content: `❌ ${agentName} execution failed: ${error.message}`,
        source: 'plan-exec',
      })
      throw error
    } finally {
      const unifiedRenderer = getUnifiedToolRenderer()
      unifiedRenderer.endExecution()
      // End parallel execution mode - resume ephemeral cleanup
    }
  }

  async executeTaskWithToolchains(task: any, _plan: any): Promise<void> {
    // CRITICAL: Validate task before execution
    if (!task) {
      throw new Error('Task is null or undefined')
    }

    if (!task.title) {
      throw new Error('Task has no title')
    }

    advancedUI.logFunctionCall('execute_task')
    advancedUI.logFunctionUpdate('info', `Executing: ${task.title}`)

    // Set up task timeout to prevent hanging
    const taskTimeout = this.nikCLI.safeTimeout(() => {
      throw new Error(`Task timeout: ${task.title} (exceeded 30 minutes)`)
    }, 1800000) // 30 minutes

    try {
      // Execute task exactly like default mode using tool router
      const { toolRouter } = await import('../core/tool-router')
      const { toolService } = await import('../services/tool-service')
      const taskMessage = { role: 'user' as const, content: task.description || task.title }
      const toolRecommendations = toolRouter.analyzeMessage(taskMessage)

      this.nikCLI.addLiveUpdate({ type: 'info', content: `⚡︎ Analyzing task with tool router...`, source: 'task-exec' })

      if (toolRecommendations.length > 0) {
        const topRecommendation = toolRecommendations[0]
        advancedUI.logFunctionUpdate(
          'info',
          chalk.blue(
            ` Detected ${topRecommendation.tool} intent (${Math.round(topRecommendation.confidence * 100)}% confidence)`
          )
        )

        // Execute like default mode - start structured UI
        let interactiveStarted = false
        try {
          advancedUI.startInteractiveMode()
          interactiveStarted = true

          // Execute the task using AI provider like default mode
          const messages = [{ role: 'user' as const, content: task.description || task.title }]
          let streamCompleted = false

          // Track streaming output for formatting (same as default mode)
          let assistantText = ''
          let shouldFormatOutput = false
          let streamedLines = 0
          const terminalWidth = process.stdout.columns || 80

          // Stream directly through streamttyService
          const { streamttyService } = await import('../services/streamtty-service')

          for await (const ev of advancedAIProvider.streamChatWithFullAutonomy(messages)) {
            // Handle all streaming events like default mode
            switch (ev.type) {
              case 'text_delta':
                // Stream text through streamttyService
                if (ev.content) {
                  assistantText += ev.content
                  await streamttyService.streamChunk(ev.content, 'ai')

                  // Track lines for clearing (same as default mode)
                  const visualContent = ev.content.replace(/\x1b\[[0-9;]*m/g, '')
                  const newlines = (visualContent.match(/\n/g) || []).length
                  const charsWithoutNewlines = visualContent.replace(/\n/g, '').length
                  const wrappedLines = Math.ceil(charsWithoutNewlines / terminalWidth)
                  streamedLines += newlines + wrappedLines
                }
                break

              case 'tool_call': {
                // Tool execution events with parameter info
                const toolInfo = this.nikCLI.formatToolCallInfo(ev)
                {
                  advancedUI.logFunctionCall(toolInfo.functionName)
                  if (toolInfo.details) {
                    advancedUI.logFunctionUpdate('info', toolInfo.details, 'ℹ')
                  }
                }
                break
              }

              case 'tool_result':
                // Tool results
                if (ev.toolResult) {
                  {
                    advancedUI.logFunctionUpdate('success', 'Tool completed', '✓')
                  }
                }
                break

              case 'complete':
                // Mark that we should format output after stream ends (like default mode)
                if (assistantText.length > 200) {
                  shouldFormatOutput = true
                }
                streamCompleted = true
                break

              case 'error':
                // Stream error
                console.log(chalk.red(`❌ Stream error: ${ev.error}`))
                throw new Error(ev.error)

              default:
                // Handle other event types silently
                break
            }
          }

          // Content already streamed through streamttyService
          if (shouldFormatOutput) {
            // Just add spacing
            console.log('')
          } else {
            // No formatting needed - add spacing after stream
            console.log('\n')
          }

          // Ensure stream completed before proceeding
          if (!streamCompleted) {
            console.log(chalk.yellow(`⚠️ Stream may not have completed properly`))
          }

          // Add a small delay to ensure all output is flushed
          await new Promise((resolve) => setTimeout(resolve, 100))

          advancedUI.logFunctionUpdate('success', `Task completed successfully: ${task.title}`)
        } catch (error: any) {
          advancedUI.logFunctionUpdate('error', `Task execution failed: ${error.message}`)
          throw error
        } finally {
          if (interactiveStarted) {
            try {
              advancedUI.stopInteractiveMode()
            } catch {
              // Ignore cleanup errors
            }
          }
        }
      } else {
        // Fallback for tasks without clear tool intent
        advancedUI.logFunctionUpdate('info', `Performing analysis for: ${task.title}`)

        // Simple execution without phases
        const projectAnalysis = await toolService.executeTool('analyze_project', {})
        advancedUI.logFunctionUpdate(
          'success',
          `Project analyzed: ${Object.keys(projectAnalysis || {}).length} components`
        )

        // If task has specific requirements, try to read relevant files
        const relevantFiles = await this.nikCLI.findRelevantFiles(task)
        for (const filePath of relevantFiles.slice(0, 3)) {
          try {
            const { content } = await toolService.executeTool('read_file', { filePath })
            advancedUI.logFunctionUpdate('success', `Analyzed ${filePath}: ${content.length} characters`)
          } catch (error: any) {
            advancedUI.logFunctionUpdate('warning', `Could not read ${filePath}: ${error.message}`)
          }
        }

        advancedUI.logFunctionUpdate('success', `Task analysis completed: ${task.title}`)
      }
    } catch (error: any) {
      // Enhanced error handling
      const errorMsg = error.message || 'Unknown execution error'
      advancedUI.logFunctionUpdate('error', `Task execution failed: ${errorMsg}`)

      // Re-throw with enhanced context
      throw new Error(`Task execution failed: ${task.title} - ${errorMsg}`)
    } finally {
      // CRITICAL: Always clear the timeout
      try {
        clearTimeout(taskTimeout)
        this.nikCLI.activeTimers.delete(taskTimeout)
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
