import chalk from 'chalk'
import { agentService } from '../services/agent-service'
import { advancedUI } from '../ui/advanced-cli-ui'

export class EventHandlers {
  private nikCLI: any // Reference to main NikCLI instance
  private orchestratorEventsInitialized = false
  private eventsSubscribed = false

  constructor(nikCLI: any) {
    this.nikCLI = nikCLI
  }

  /**
   * Setup core process event handlers (SIGINT, SIGTERM, errors)
   * EXACT COPY from lines 1103-1131
   */
  setupEventHandlers(): void {
    // Handle Ctrl+C gracefully
    process.on('SIGINT', async () => {
      await this.nikCLI.shutdown()
    })

    process.on('SIGTERM', async () => {
      await this.nikCLI.shutdown()
    })

    // Always keep prompt alive on unexpected errors
    process.on('unhandledRejection', (reason: any) => {
      try {
        console.log(require('chalk').red(`\n❌ Unhandled rejection: ${reason?.message || reason}`))
      } catch { }
      try {
        this.nikCLI.renderPromptAfterOutput()
      } catch { }
    })

    process.on('uncaughtException', (err: any) => {
      try {
        console.log(require('chalk').red(`\n❌ Uncaught exception: ${err?.message || err}`))
      } catch { }
      try {
        this.nikCLI.renderPromptAfterOutput()
      } catch { }
    })
  }

  /**
   * Bridge StreamingOrchestrator agent lifecycle events into NikCLI output
   * EXACT COPY from lines 1134-1190
   */
  setupOrchestratorEventBridge(): void {
    if (this.orchestratorEventsInitialized) return
    this.orchestratorEventsInitialized = true

    agentService.on('task_start', (task) => {
      const indicator = this.nikCLI.createStatusIndicator(`task-${task.id}`, `Agent ${task.agentType}`, task.task)
      this.nikCLI.updateStatusIndicator(indicator.id, { status: 'running' })

      // Always show in default chat mode and structured UI via addLiveUpdate
      if (this.nikCLI.currentMode === 'default') {
        this.nikCLI.addLiveUpdate({ type: 'info', content: task.task, source: `agent_${task.agentType}` })
      }

      // Render prompt after output
      setTimeout(() => this.nikCLI.renderPromptAfterOutput(), 30)
    })

    agentService.on('task_progress', (_task, update) => {
      const progress = typeof update.progress === 'number' ? `${update.progress}% ` : ''
      const desc = update.description ? `- ${update.description}` : ''
      this.nikCLI.addLiveUpdate({ type: 'progress', content: `${progress}${desc}`, source: 'agentprogress' })

      // Render prompt after output
      this.nikCLI.renderPromptAfterOutput()
    })

    agentService.on('tool_use', (_task, update) => {
      this.nikCLI.addLiveUpdate({ type: 'info', content: `${update.tool}: ${update.description}`, source: 'tooluse' })

      // Render prompt after output
      this.nikCLI.renderPromptAfterOutput()
    })

    agentService.on('task_complete', (task) => {
      const indicatorId = `task-${task.id}`
      if (task.status === 'completed') {
        this.nikCLI.updateStatusIndicator(indicatorId, { status: 'completed', details: 'Task completed successfully' })

        // Show in default mode and structured UI
        if (this.nikCLI.currentMode === 'default') {
          this.nikCLI.addLiveUpdate({ type: 'log', content: 'Task completed successfully', source: `agent_${task.agentType}` })
        }
      } else {
        this.nikCLI.updateStatusIndicator(indicatorId, { status: 'failed', details: task.error || 'Unknown error' })
        this.nikCLI.addLiveUpdate({ type: 'error', content: `Failed: ${task.error}`, source: `agent_${task.agentType}` })

        // Show in default mode and structured UI
        if (this.nikCLI.currentMode === 'default') {
          advancedUI.logError(`Agent ${task.agentType}`, task.error || 'Unknown error')
        }
      }
      // Add delay before showing prompt to let output be visible
      setTimeout(() => {
        this.nikCLI.renderPromptAfterOutput()
      }, 500)
    })
  }

  /**
   * Subscribe to all event sources for Default Mode Unified Aggregator
   * EXACT COPY from lines 1197-1296
   */
  subscribeToAllEventSources(): void {
    if (this.eventsSubscribed) return
    this.eventsSubscribed = true

    // 1. Approval Prompts (approvalSystem.request)
    // Already handled by existing approvalSystem integration

    // 2. Planning Events (planningManager emits: stepStart, stepProgress, stepComplete)
    this.nikCLI.planningManager.on('stepStart', (event: any) => {
      this.nikCLI.routeEventToUI('planning_step_start', { step: event.step, description: event.description })
    })

    this.nikCLI.planningManager.on('stepProgress', (event: any) => {
      this.nikCLI.routeEventToUI('planning_step_progress', { step: event.step, progress: event.progress })
    })

    this.nikCLI.planningManager.on('stepComplete', (event: any) => {
      this.nikCLI.routeEventToUI('planning_step_complete', { step: event.step, result: event.result })
    })

    // 3. Tool/Agent Events (agentService emits: file_read, file_write, file_list, grep_results, tool_call, tool_result, error)
    agentService.on('file_read', (data) => {
      this.nikCLI.routeEventToUI('agent_file_read', data)
    })

    agentService.on('file_written', (data) => {
      this.nikCLI.routeEventToUI('agent_file_written', data)
    })

    agentService.on('file_list', (data) => {
      this.nikCLI.routeEventToUI('agent_file_list', data)
    })

    agentService.on('grep_results', (data) => {
      this.nikCLI.routeEventToUI('agent_grep_results', data)
    })

    // 4. Background Agents Events (AgentManager emits: agent.task.started, agent.task.progress, agent.task.completed, agent.tool.call)
    this.nikCLI.agentManager.on('agent.task.started', (event: any) => {
      this.nikCLI.routeEventToUI('bg_agent_task_start', {
        agentId: event.agentId,
        agentName: event.agentName || event.agentId,
        taskDescription: event.task?.description || event.task?.prompt || 'Background task',
        taskType: event.task?.type || 'unknown',
      })
    })

    this.nikCLI.agentManager.on('agent.task.progress', (event: any) => {
      this.nikCLI.routeEventToUI('bg_agent_task_progress', {
        agentId: event.agentId,
        progress: event.progress || 0,
        currentStep: event.currentStep || event.step || 'Processing...',
      })
    })

    this.nikCLI.agentManager.on('agent.task.completed', (event: any) => {
      this.nikCLI.routeEventToUI('bg_agent_task_complete', {
        agentId: event.agentId,
        result: event.result?.summary || event.result || 'Task completed',
        duration: event.duration || 0,
      })
    })

    this.nikCLI.agentManager.on('agent.tool.call', (event: any) => {
      this.nikCLI.routeEventToUI('bg_agent_tool_call', {
        agentId: event.agentId,
        toolName: event.toolName || event.tool,
        parameters: event.parameters || event.args,
      })
    })

    // 4.1 Background Agent Service Events (job lifecycle)
    import('../background-agents/background-agent-service')
      .then(({ backgroundAgentService }) => {
        backgroundAgentService.on('job:created', (jobId: string, job: any) => {
          this.nikCLI.showBackgroundJobPanel('created', jobId, job)
        })

        backgroundAgentService.on('job:started', (jobId: string, job: any) => {
          this.nikCLI.showBackgroundJobPanel('started', jobId, job)
        })

        backgroundAgentService.on('job:completed', (jobId: string, job: any) => {
          this.nikCLI.showBackgroundJobPanel('completed', jobId, job)
        })

        backgroundAgentService.on('job:failed', (jobId: string, job: any) => {
          this.nikCLI.showBackgroundJobPanel('failed', jobId, job)
        })
      })
      .catch((err) => console.error('Failed to setup background agent listeners:', err))

    // 5. Chat Stream (modelProvider.streamResponse(messages) events)
    // This is handled in the streaming loop in handleDefaultMode - chat stream events are processed inline
    // when streaming responses from advancedAIProvider.streamChatWithFullAutonomy()

    console.log(
      chalk.dim('✓ Default Mode Unified Aggregator subscribed to all event sources (including background agents)')
    )
  }

  /**
   * Central Event Router - routes events to UI based on structuredUI decision
   * EXACT COPY from lines 1301-1482
   */
  routeEventToUI(eventType: string, eventData: any): void {
    // Decision Point: structuredUI vs Console stdout (as per diagram)
    const useStructuredUI = this.nikCLI.isStructuredUIActive()

    if (useStructuredUI) {
      // Route to AdvancedCliUI panels
      this.routeToAdvancedUI(eventType, eventData)
    } else {
      // Fallback to Console stdout
      this.routeToConsole(eventType, eventData)
    }
  }

  /**
   * Route events to AdvancedCliUI panels
   * EXACT COPY from lines 1324-1422
   */
  private routeToAdvancedUI(eventType: string, eventData: any): void {
    switch (eventType) {
      case 'planning_step_start':
        advancedUI.logInfo('Planning Step', `Started: ${eventData.description}`)
        break
      case 'planning_step_progress':
        advancedUI.logInfo('Planning Progress', `${eventData.step}: ${eventData.progress}%`)
        break
      case 'planning_step_complete':
        advancedUI.logSuccess('Planning Complete', `${eventData.step}: ${eventData.result}`)
        break
      case 'agent_file_read':
        if (eventData.path && eventData.content) {
          advancedUI.showFileContent(eventData.path, eventData.content)
        }
        break
      case 'agent_file_written':
        if (eventData.originalContent && eventData.content) {
          advancedUI.showFileDiff(eventData.path, eventData.originalContent, eventData.content)
        } else {
          advancedUI.showFileContent(eventData.path, eventData.content)
        }
        break
      case 'agent_file_list':
        if (eventData.files) {
          advancedUI.showFileList(eventData.files, eventData.title || '📁 Files')
        }
        break
      case 'agent_grep_results':
        if (eventData.pattern && eventData.matches) {
          advancedUI.showGrepResults(eventData.pattern, eventData.matches)
        }
        break

      // Background agent events
      case 'bg_agent_task_start':
        advancedUI.logInfo('Background Agent', `🔌 ${eventData.agentName} started: ${eventData.taskDescription}`)
        this.nikCLI.createStatusIndicator(`bg-${eventData.agentId}`, `${eventData.agentName}: ${eventData.taskDescription}`)

        // Update background agents panel
        advancedUI.updateBackgroundAgent({
          id: eventData.agentId,
          name: eventData.agentName,
          status: 'working',
          currentTask: eventData.taskDescription,
          startTime: new Date(),
        })
        break

      case 'bg_agent_task_progress': {
        advancedUI.logInfo('Agent Progress', `⚡︎ ${eventData.currentStep} (${eventData.progress}%)`)
        this.nikCLI.updateStatusIndicator(`bg-${eventData.agentId}`, {
          progress: eventData.progress,
          details: eventData.currentStep,
        })

        // Update background agents panel with progress
        const agent = advancedUI.backgroundAgents?.get(eventData.agentId)
        if (agent) {
          advancedUI.updateBackgroundAgent({
            ...agent,
            progress: eventData.progress,
            currentTask: eventData.currentStep,
          })
        }
        break
      }

      case 'bg_agent_task_complete': {
        advancedUI.logSuccess('Agent Complete', `✓ Completed in ${eventData.duration}ms: ${eventData.result}`)
        this.nikCLI.stopAdvancedSpinner(`bg-${eventData.agentId}`, true, eventData.result)

        // Update background agents panel to completed
        const completedAgent = advancedUI.backgroundAgents.get(eventData.agentId)
        if (completedAgent) {
          advancedUI.updateBackgroundAgent({
            ...completedAgent,
            status: 'completed',
            currentTask: eventData.result,
            progress: 100,
          })
        }
        break
      }

      case 'bg_agent_tool_call': {
        const toolDetails = this.nikCLI.formatToolDetails(eventData.toolName, eventData.parameters)
        advancedUI.logInfo('Background Tool', `🔧 ${eventData.agentId}: ${toolDetails}`)
        break
      }

      case 'bg_agent_orchestrated':
        advancedUI.logInfo(
          'Agent Orchestration',
          `🎭 ${eventData.parentTool} orchestrating ${eventData.agentName} for: ${eventData.task}`
        )
        break
    }
  }

  /**
   * Route events to Console stdout (fallback mode)
   * EXACT COPY from lines 1427-1482
   */
  private routeToConsole(eventType: string, eventData: any): void {
    switch (eventType) {
      case 'planning_step_start':
        this.nikCLI.addLiveUpdate({ type: 'info', content: eventData.description, source: 'planning' })
        break
      case 'planning_step_progress':
        this.nikCLI.addLiveUpdate({ type: 'progress', content: `${eventData.step} - ${eventData.progress}%`, source: 'planning' })
        break
      case 'planning_step_complete':
        this.nikCLI.addLiveUpdate({ type: 'log', content: `Complete: ${eventData.step}`, source: 'planning' })
        break
      case 'agent_file_read':
        this.nikCLI.addLiveUpdate({ type: 'info', content: `File read: ${eventData.path}`, source: 'fileoperations' })
        break
      case 'agent_file_written':
        this.nikCLI.addLiveUpdate({ type: 'log', content: `File written: ${eventData.path}`, source: 'fileoperations' })
        break
      case 'agent_file_list':
        this.nikCLI.addLiveUpdate({ type: 'info', content: `Files listed: ${eventData.files?.length} items`, source: 'fileoperations' })
        break
      case 'agent_grep_results':
        this.nikCLI.addLiveUpdate({ type: 'info', content: `Search: ${eventData.pattern} - ${eventData.matches?.length} matches`, source: 'search' })
        break

      // Background agent events for addLiveUpdate
      case 'bg_agent_task_start':
        this.nikCLI.addLiveUpdate({ type: 'info', content: `${eventData.agentName} working on "${eventData.taskDescription}"`, source: 'backgroundagent' })
        break

      case 'bg_agent_task_progress': {
        // Progress with metadata
        const progressContent = `${eventData.progress}% - ${eventData.currentStep}`
        this.nikCLI.addLiveUpdate({
          type: 'progress',
          content: progressContent,
          source: 'backgroundagent',
          metadata: { progress: eventData.progress }
        })
        break
      }

      case 'bg_agent_task_complete':
        this.nikCLI.addLiveUpdate({ type: 'log', content: `${eventData.agentId} completed successfully (${eventData.duration}ms)`, source: 'backgroundagent' })
        break

      case 'bg_agent_tool_call': {
        const bgToolDetails = this.nikCLI.formatToolDetails(eventData.toolName, eventData.parameters)
        this.nikCLI.addLiveUpdate({ type: 'info', content: `${eventData.agentId} → ${bgToolDetails}`, source: 'backgroundtool' })
        break
      }

      case 'bg_agent_orchestrated':
        this.nikCLI.addLiveUpdate({ type: 'info', content: `Orchestrating: ${eventData.agentName} for "${eventData.task}"`, source: 'orchestration' })
        break
    }
  }
}
