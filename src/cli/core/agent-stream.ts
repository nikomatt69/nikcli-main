import { randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'
import chalk from 'chalk'
import { advancedUI } from '../ui/advanced-cli-ui'
import { MemoryManager } from '../utils/memory-manager'
import { taskChainManager } from './task-chain-manager'

export interface StreamEvent {
  type: 'thinking' | 'planning' | 'executing' | 'progress' | 'result' | 'error' | 'info'
  agentId: string
  message: string
  data?: any
  timestamp: Date
  progress?: number
}

export interface AgentAction {
  id: string
  agentId: string
  type: 'file_read' | 'file_write' | 'command' | 'analysis' | 'decision'
  description: string
  status: 'pending' | 'executing' | 'completed' | 'failed'
  startTime: Date
  endTime?: Date
  input?: any
  output?: any
  error?: string
}

export class AgentStreamManager extends EventEmitter {
  private streams: Map<string, StreamEvent[]> = new Map()
  private actions: Map<string, AgentAction[]> = new Map()
  private activeAgents: Set<string> = new Set()
  private silentMode = false // Disable direct console output in plan/launch-agent mode

  // 🔒 FIXED: Memory managers to prevent memory leaks
  private streamMemoryManager = new MemoryManager<StreamEvent[]>({
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    maxSize: 10000,
    cleanupInterval: 60000, // 1 minute
  })
  private actionMemoryManager = new MemoryManager<AgentAction[]>({
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    maxSize: 10000,
    cleanupInterval: 60000, // 1 minute
  })

  // Start streaming for an agent
  startAgentStream(agentId: string): void {
    this.activeAgents.add(agentId)
    this.streams.set(agentId, [])
    this.actions.set(agentId, [])

    this.emitEvent(agentId, 'info', `🚀 Agent ${agentId} stream started`)
  }

  // Stop streaming for an agent
  stopAgentStream(agentId: string): void {
    this.activeAgents.delete(agentId)
    this.emitEvent(agentId, 'info', `✓ Agent ${agentId} stream completed`)
  }

  // Enable/disable direct console output (for plan/launch-agent mode)
  setSilentMode(enabled: boolean): void {
    this.silentMode = enabled
  }

  /**
   * Emit a stream event
   * FIXED: Added automatic cleanup to prevent memory leaks
   */
  emitEvent(agentId: string, type: StreamEvent['type'], message: string, data?: any, progress?: number): void {
    const event: StreamEvent = {
      type,
      agentId,
      message,
      data,
      timestamp: new Date(),
      progress,
    }

    // Add to agent's stream with memory management
    const agentStream = this.streams.get(agentId) || []
    agentStream.push(event)

    // Keep only last 1000 events per agent to prevent unbounded growth
    if (agentStream.length > 1000) {
      agentStream.splice(0, agentStream.length - 1000)
    }

    this.streams.set(agentId, agentStream)

    // Also store in memory manager for time-based cleanup
    this.streamMemoryManager.add(agentId, agentStream)

    // Display in real-time
    this.displayEvent(event)

    // Emit to listeners
    this.emit('stream', event)
  }

  private displayEvent(event: StreamEvent): void {
    // Skip direct display if in silent mode (logs will be handled by listeners via addLiveUpdate)
    if (this.silentMode) {
      return
    }

    // Map event type to icon
    const typeIconMap: Record<string, string> = {
      thinking: '⚡︎',
      planning: '📋',
      executing: '⚡',
      progress: '📊',
      result: '✓',
      error: '✖',
      info: 'ℹ',
    }

    const icon = typeIconMap[event.type] || '•'
    const content = `${icon} ${event.message}`

    // Use advancedUI.logInfo for consistent formatting with ⏺ and ⎿
    advancedUI.logInfo(content, event.agentId)

    // Log data if present
    if (event.data && typeof event.data === 'object') {
      advancedUI.logInfo(chalk.gray(`    ${JSON.stringify(event.data, null, 2)}`))
    }
  }

  /**
   * Track agent actions
   * FIXED: Added memory management to prevent action accumulation
   */
  trackAction(agentId: string, actionType: AgentAction['type'], description: string, input?: any): string {
    const action: AgentAction = {
      id: `${agentId}-${Date.now()}-${randomBytes(6).toString('base64url')}`,
      agentId,
      type: actionType,
      description,
      status: 'pending',
      startTime: new Date(),
      input,
    }

    const agentActions = this.actions.get(agentId) || []
    agentActions.push(action)

    // Keep only last 500 actions per agent to prevent unbounded growth
    if (agentActions.length > 500) {
      agentActions.splice(0, agentActions.length - 500)
    }

    this.actions.set(agentId, agentActions)

    // Store in memory manager for time-based cleanup
    this.actionMemoryManager.add(agentId, agentActions)

    this.emitEvent(agentId, 'executing', `Starting: ${description}`)

    return action.id
  }

  // Update action status
  updateAction(actionId: string, status: AgentAction['status'], output?: any, error?: string): void {
    // Find the action across all agents
    for (const [agentId, actions] of Array.from(this.actions.entries())) {
      const action = actions.find((a) => a.id === actionId)
      if (action) {
        action.status = status
        action.endTime = new Date()
        action.output = output
        action.error = error

        const duration = action.endTime.getTime() - action.startTime.getTime()

        if (status === 'completed') {
          this.emitEvent(agentId, 'result', `Completed: ${action.description} (${duration}ms)`, output)
        } else if (status === 'failed') {
          this.emitEvent(agentId, 'error', `Failed: ${action.description} - ${error}`, { error })
        }

        break
      }
    }
  }

  // Stream thinking process
  async streamThinking(agentId: string, thoughts: string[]): Promise<void> {
    this.emitEvent(agentId, 'thinking', 'Analyzing requirements...')

    for (const thought of thoughts) {
      await new Promise((resolve) => setTimeout(resolve, 200)) // Simulate thinking time
      this.emitEvent(agentId, 'thinking', thought)
    }
  }

  // Stream planning process
  async streamPlanning(agentId: string, planSteps: string[]): Promise<void> {
    this.emitEvent(agentId, 'planning', 'Creating execution plan...')

    for (let i = 0; i < planSteps.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 150))
      this.emitEvent(agentId, 'planning', `${i + 1}. ${planSteps[i]}`)
    }

    this.emitEvent(agentId, 'planning', `Plan created with ${planSteps.length} steps`)
  }

  // Stream progress updates
  streamProgress(agentId: string, current: number, total: number, message?: string): void {
    const progress = Math.round((current / total) * 100)
    const progressMessage = message || `Progress: ${current}/${total}`

    this.emitEvent(agentId, 'progress', progressMessage, { current, total }, progress)
  }

  /**
   * Get agent stream history
   * FIXED: Check memory manager first for potentially cleaned data
   */
  getAgentStream(agentId: string, limit?: number): StreamEvent[] {
    // Try memory manager first
    const managedStream = this.streamMemoryManager.get(agentId)
    const stream = managedStream || this.streams.get(agentId) || []
    return limit ? stream.slice(-limit) : stream
  }

  /**
   * Get agent actions
   * FIXED: Check memory manager first for potentially cleaned data
   */
  getAgentActions(agentId: string): AgentAction[] {
    const managedActions = this.actionMemoryManager.get(agentId)
    return managedActions || this.actions.get(agentId) || []
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats(): {
    streams: ReturnType<MemoryManager['getStats']>
    actions: ReturnType<MemoryManager['getStats']>
    totalStreams: number
    totalActions: number
  } {
    let totalStreams = 0
    let totalActions = 0

    for (const stream of this.streams.values()) {
      totalStreams += stream.length
    }

    for (const actions of this.actions.values()) {
      totalActions += actions.length
    }

    return {
      streams: this.streamMemoryManager.getStats(),
      actions: this.actionMemoryManager.getStats(),
      totalStreams,
      totalActions,
    }
  }

  /**
   * Manually trigger cleanup (for testing or debugging)
   */
  cleanup(): void {
    this.streamMemoryManager.cleanup()
    this.actionMemoryManager.cleanup()
  }

  /**
   * Destroy the stream manager and cleanup resources
   */
  destroy(): void {
    this.streamMemoryManager.destroy()
    this.actionMemoryManager.destroy()
    this.streams.clear()
    this.actions.clear()
    this.activeAgents.clear()
  }

  // Get all active agents
  getActiveAgents(): string[] {
    return Array.from(this.activeAgents)
  }

  // Display live dashboard for all active agents
  showLiveDashboard(): void {
    const activeAgents = this.getActiveAgents()
    const chainStatus = taskChainManager.getChainStatus()

    // Show taskchain info at top if there are active chains
    let taskchainInfo = ''
    if (chainStatus.activeChains > 0) {
      taskchainInfo = chalk.cyan(
        ` | TaskChains: ${chainStatus.activeChains} active, ${chainStatus.protectedAgents} protected`
      )
    }

    if (activeAgents.length === 0 && chainStatus.activeChains === 0) {
      advancedUI.logInfo(chalk.yellow('📊 No active agents'))
      return
    }

    advancedUI.logInfo(chalk.blue.bold('\n📺 Live Agent Dashboard'))
    advancedUI.logInfo(chalk.gray('═'.repeat(60)) + taskchainInfo)

    // Show active taskchains first
    const activeChains = taskChainManager.getActiveChains()
    if (activeChains.length > 0) {
      advancedUI.logInfo(chalk.blue.bold('\n⚡ Active TaskChains:'))
      for (const chain of activeChains) {
        const bar = '█'.repeat(Math.round(chain.progress / 5)) + '░'.repeat(20 - Math.round(chain.progress / 5))
        advancedUI.logInfo(`  ${chalk.cyan('⚡')} ${chalk.bold(chain.name)} [${bar}] ${chain.progress}%`)
        advancedUI.logInfo(chalk.gray(`     Agents: ${chain.agents.join(', ')}`))
      }
    }

    activeAgents.forEach((agentId) => {
      const recentEvents = this.getAgentStream(agentId, 3)
      const actions = this.getAgentActions(agentId)
      const completedActions = actions.filter((a) => a.status === 'completed').length
      const failedActions = actions.filter((a) => a.status === 'failed').length

      advancedUI.logInfo(chalk.cyan.bold(`\n🔌 Agent: ${agentId}`))
      advancedUI.logInfo(chalk.gray('─'.repeat(30)))
      advancedUI.logInfo(`📊 Actions: ${completedActions} completed, ${failedActions} failed`)
      advancedUI.logInfo(
        `🕐 Last Activity: ${recentEvents[recentEvents.length - 1]?.timestamp.toLocaleTimeString() || 'None'}`
      )

      advancedUI.logInfo(chalk.yellow('Recent Events:'))
      recentEvents.forEach((event) => {
        const icon =
          event.type === 'result' ? '✓' : event.type === 'error' ? '✖' : event.type === 'executing' ? '⚡' : '•'
        advancedUI.logInfo(`  ${icon} ${event.message}`)
      })
    })
  }

  // Stream agent collaboration
  streamCollaboration(fromAgent: string, toAgent: string, message: string, data?: any): void {
    this.emitEvent(fromAgent, 'info', `📤 Sent to ${toAgent}: ${message}`, data)
    this.emitEvent(toAgent, 'info', `📥 Received from ${fromAgent}: ${message}`, data)
  }

  // Clear stream history for an agent
  clearAgentStream(agentId: string): void {
    this.streams.delete(agentId)
    this.actions.delete(agentId)
    this.emitEvent(agentId, 'info', 'Stream history cleared')
  }

  // Export stream to file
  exportStream(agentId: string, filename?: string): string {
    const stream = this.getAgentStream(agentId)
    const actions = this.getAgentActions(agentId)

    const exportData = {
      agentId,
      exportedAt: new Date(),
      events: stream,
      actions,
      summary: {
        totalEvents: stream.length,
        totalActions: actions.length,
        completedActions: actions.filter((a) => a.status === 'completed').length,
        failedActions: actions.filter((a) => a.status === 'failed').length,
      },
    }

    const fileName = filename || `agent-${agentId}-stream-${Date.now()}.json`
    require('node:fs').writeFileSync(fileName, JSON.stringify(exportData, null, 2))

    advancedUI.logInfo(chalk.green(`📄 Stream exported to ${fileName}`))
    return fileName
  }

  // Real-time metrics
  getMetrics(): {
    activeAgents: number
    totalEvents: number
    totalActions: number
    eventsPerMinute: number
    averageActionDuration: number
  } {
    const activeAgents = this.activeAgents.size
    const totalEvents = Array.from(this.streams.values()).reduce((sum, events) => sum + events.length, 0)
    const totalActions = Array.from(this.actions.values()).reduce((sum, actions) => sum + actions.length, 0)

    // Calculate events per minute (last 60 seconds)
    const oneMinuteAgo = new Date(Date.now() - 60000)
    const recentEvents = Array.from(this.streams.values())
      .flat()
      .filter((e) => e.timestamp > oneMinuteAgo)

    // Calculate average action duration
    const completedActions = Array.from(this.actions.values())
      .flat()
      .filter((a) => a.status === 'completed' && a.endTime)

    const averageActionDuration =
      completedActions.length > 0
        ? completedActions.reduce((sum, action) => sum + (action.endTime!.getTime() - action.startTime.getTime()), 0) /
          completedActions.length
        : 0

    return {
      activeAgents,
      totalEvents,
      totalActions,
      eventsPerMinute: recentEvents.length,
      averageActionDuration: Math.round(averageActionDuration),
    }
  }
}

export const agentStream = new AgentStreamManager()
