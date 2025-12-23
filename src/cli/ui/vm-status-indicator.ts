import { EventEmitter } from 'node:events'
import chalk from 'chalk'
import type { SecureVirtualizedAgent, VMState } from '../virtualized-agents/secure-vm-agent'
import { advancedUI } from './advanced-cli-ui'

/**
 * VMStatusIndicator - UI system for showing VM agent status
 *
 * Features:
 * - Real-time status indicators in CLI prompt
 * - Agent activity icons and states
 * - Token usage visual indicators
 * - Security status displays
 * - Interactive status panels
 * - Log streaming interfaces
 */
export class VMStatusIndicator extends EventEmitter {
  private static instance: VMStatusIndicator
  private activeAgents: Map<string, VMAgentStatus> = new Map()
  private agentLogDeduplication: Map<string, Map<string, number>> = new Map() // agentId -> messageKey -> timestamp
  private displayMode: StatusDisplayMode = 'compact'
  private updateInterval: NodeJS.Timeout | null = null

  // UI Configuration
  private readonly UPDATE_INTERVAL = 2000 // 2 seconds
  private readonly LOG_BUFFER_SIZE = 1000

  private constructor() {
    super()
    this.startStatusUpdates()
  }

  /**
   * Get singleton instance
   */
  static getInstance(): VMStatusIndicator {
    if (!VMStatusIndicator.instance) {
      VMStatusIndicator.instance = new VMStatusIndicator()
    }
    return VMStatusIndicator.instance
  }

  /**
   * Register VM agent for status tracking
   */
  registerAgent(agentOrId: SecureVirtualizedAgent | string, _name?: string, status?: VMState): void {
    // Handle overloaded method - can accept agent instance or parameters
    if (typeof agentOrId === 'string') {
      const agentStatus: VMAgentStatus = {
        agentId: agentOrId,
        vmState: status || 'stopped',
        containerId: undefined,
        tokenUsage: { used: 0, budget: 50000, remaining: 50000 },
        startTime: new Date(),
        lastActivity: new Date(),
        logs: [],
        metrics: {
          cpuUsage: 0,
          memoryUsage: 0,
          networkActivity: 0,
          diskUsage: 0,
        },
      }

      this.activeAgents.set(agentOrId, agentStatus)
      this.agentLogDeduplication.set(agentOrId, new Map())
      this.emit('agent_registered', agentStatus)
      return
    }

    // Original implementation for agent instance
    const agent = agentOrId
    const agentStatus: VMAgentStatus = {
      agentId: agent.id,
      vmState: agent.getVMState(),
      containerId: agent.getContainerId(),
      tokenUsage: agent.getTokenUsage(),
      vscodePort: agent.getVSCodePort(),
      startTime: new Date(),
      lastActivity: new Date(),
      logs: [],
      metrics: {
        cpuUsage: 0,
        memoryUsage: 0,
        networkActivity: 0,
        diskUsage: 0,
      },
    }

    this.activeAgents.set(agent.id, agentStatus)
    this.agentLogDeduplication.set(agent.id, new Map())

    advancedUI.logSuccess(`📊 VM agent ${agent.id} registered for status tracking`)
    this.emit('agent:registered', { agentId: agent.id })
  }

  /**
   * Unregister VM agent
   */
  unregisterAgent(agentId: string): void {
    if (this.activeAgents.has(agentId)) {
      this.activeAgents.delete(agentId)
      this.agentLogDeduplication.delete(agentId)

      advancedUI.logInfo(`📊 VM agent ${agentId} unregistered from status tracking`)
      this.emit('agent:unregistered', { agentId })
    }
  }

  /**
   * Update agent status
   */
  updateAgentStatus(agentId: string, updates: Partial<VMAgentStatus>): void {
    const status = this.activeAgents.get(agentId)
    if (status) {
      Object.assign(status, updates, { lastActivity: new Date() })
      this.activeAgents.set(agentId, status)

      this.emit('agent:updated', { agentId, status })
    }
  }

  /**
   * Add log entry for agent
   */
  addAgentLog(agentId: string, log: AgentLogEntry): void {
    const status = this.activeAgents.get(agentId)
    if (status) {
      const TIME_WINDOW = 5000 // 5 seconds
      const deduplicationMap = this.agentLogDeduplication.get(agentId)

      if (deduplicationMap) {
        const messageKey = log.message.slice(0, 100) // Deduplicate based on first 100 chars
        const lastTimestamp = deduplicationMap.get(messageKey)
        const currentTime = log.timestamp.getTime()

        if (lastTimestamp && currentTime - lastTimestamp < TIME_WINDOW) {
          return // Duplicate found within the time window, so we skip it.
        }
        deduplicationMap.set(messageKey, currentTime)
      }

      status.logs.push(log)

      // Maintain log buffer size
      if (status.logs.length > this.LOG_BUFFER_SIZE) {
        status.logs = status.logs.slice(-this.LOG_BUFFER_SIZE / 2)
      }

      this.emit('agent:log', { agentId, log })
    }
  }

  /**
   * Generate prompt status indicators
   */
  getPromptIndicators(): string {
    const activeCount = this.activeAgents.size

    if (activeCount === 0) {
      return ''
    }

    const indicators: string[] = []

    // Agent count indicator
    if (activeCount === 1) {
      const agent = Array.from(this.activeAgents.values())[0]
      indicators.push(this.getSingleAgentIndicator(agent))
    } else {
      indicators.push(this.getMultiAgentIndicator(activeCount))
    }

    // Security status
    if (this.hasSecurityIssues()) {
      indicators.push(chalk.red('🔒'))
    } else {
      indicators.push(chalk.green('🔐'))
    }

    return indicators.join('')
  }

  /**
   * Generate detailed status panel
   */
  getStatusPanel(): string {
    if (this.activeAgents.size === 0) {
      return chalk.dim('No active VM agents')
    }

    const lines: string[] = []
    lines.push(chalk.cyan.bold(`🔌 Active VM Agents (${this.activeAgents.size})`))
    lines.push(chalk.gray('─'.repeat(60)))

    for (const [agentId, status] of this.activeAgents.entries()) {
      lines.push(this.formatAgentStatus(agentId, status))
      lines.push('') // Empty line between agents
    }

    return lines.join('\n')
  }

  /**
   * Generate agent logs panel
   */
  getAgentLogsPanel(agentId: string, lines: number = 20): string {
    const status = this.activeAgents.get(agentId)

    if (!status) {
      return chalk.red(`Agent ${agentId} not found`)
    }

    const logLines: string[] = []
    logLines.push(chalk.cyan.bold(`📋 Logs for VM Agent: ${agentId}`))
    logLines.push(chalk.gray('─'.repeat(60)))

    const recentLogs = status.logs.slice(-lines)

    if (recentLogs.length === 0) {
      logLines.push(chalk.dim('No logs available'))
    } else {
      for (const log of recentLogs) {
        logLines.push(this.formatLogEntry(log))
      }
    }

    logLines.push(chalk.gray('─'.repeat(60)))
    logLines.push(chalk.dim(`Showing last ${recentLogs.length} entries`))

    return logLines.join('\n')
  }

  /**
   * Generate security dashboard
   */
  getSecurityDashboard(): string {
    const lines: string[] = []
    lines.push(chalk.cyan.bold('🔐 VM Security Dashboard'))
    lines.push(chalk.gray('─'.repeat(60)))

    let totalTokenUsage = 0
    let totalBudget = 0
    let securityIssues = 0

    for (const [agentId, status] of this.activeAgents.entries()) {
      totalTokenUsage += status.tokenUsage.used
      totalBudget += status.tokenUsage.budget

      // Check for security issues
      const issues = this.checkAgentSecurity(status)
      if (issues.length > 0) {
        securityIssues++
        lines.push(chalk.red(`⚠︎ ${agentId}: ${issues.join(', ')}`))
      } else {
        lines.push(chalk.green(`✓ ${agentId}: Secure`))
      }
    }

    lines.push('')
    lines.push(chalk.white.bold('Summary:'))
    lines.push(
      `Total Token Usage: ${totalTokenUsage}/${totalBudget} (${Math.round((totalTokenUsage / totalBudget) * 100)}%)`
    )
    lines.push(`Security Issues: ${securityIssues}/${this.activeAgents.size} agents`)

    return lines.join('\n')
  }

  /**
   * Set display mode
   */
  setDisplayMode(mode: StatusDisplayMode): void {
    this.displayMode = mode
    this.emit('display:mode_changed', { mode })
  }

  /**
   * Get all active agents
   */
  getActiveAgents(): VMAgentStatus[] {
    return Array.from(this.activeAgents.values())
  }

  /**
   * Clear all agent statuses
   */
  clearAll(): void {
    this.activeAgents.clear()
    this.emit('status:cleared')
  }

  /**
   * Generate single agent indicator
   */
  private getSingleAgentIndicator(agent: VMAgentStatus): string {
    const stateIcon = this.getStateIcon(agent.vmState)
    const usagePercent = Math.round((agent.tokenUsage.used / agent.tokenUsage.budget) * 100)

    let indicator = stateIcon

    // Add usage indicator color
    if (usagePercent > 90) {
      indicator = chalk.red(stateIcon)
    } else if (usagePercent > 70) {
      indicator = chalk.yellow(stateIcon)
    } else {
      indicator = chalk.green(stateIcon)
    }

    return indicator
  }

  /**
   * Generate multi-agent indicator
   */
  private getMultiAgentIndicator(_count: number): string {
    const runningAgents = Array.from(this.activeAgents.values()).filter((agent) => agent.vmState === 'running').length

    return chalk.blue(`${runningAgents}🔌`)
  }

  /**
   * Get state icon for VM state
   */
  private getStateIcon(state: VMState): string {
    switch (state) {
      case 'running':
        return '🟢'
      case 'starting':
        return '🟡'
      case 'stopping':
        return '🟠'
      case 'stopped':
        return '⚫'
      case 'error':
        return '🔴'
      default:
        return '⚪'
    }
  }

  /**
   * Format agent status for display
   */
  private formatAgentStatus(agentId: string, status: VMAgentStatus): string {
    const stateIcon = this.getStateIcon(status.vmState)
    const truncatedId = agentId.slice(0, 12)
    const uptime = Math.floor((Date.now() - status.startTime.getTime()) / 1000)
    const tokenPercent = Math.round((status.tokenUsage.used / status.tokenUsage.budget) * 100)

    const lines: string[] = []

    // Main status line
    lines.push(
      `${stateIcon} ${chalk.bold(truncatedId)} ${chalk.dim(`(${status.vmState})`)} - ${this.formatUptime(uptime)}`
    )

    // Container info
    if (status.containerId) {
      lines.push(`   📦 Container: ${status.containerId.slice(0, 12)}`)
    }

    // VS Code info
    if (status.vscodePort) {
      lines.push(`   💻 VS Code: localhost:${status.vscodePort}`)
    }

    // Token usage
    const tokenColor = tokenPercent > 90 ? chalk.red : tokenPercent > 70 ? chalk.yellow : chalk.green
    lines.push(
      `   🎫 Tokens: ${tokenColor(`${status.tokenUsage.used}/${status.tokenUsage.budget} (${tokenPercent}%)`)}`
    )

    // System metrics
    if (status.metrics) {
      lines.push(
        `   📊 CPU: ${status.metrics.cpuUsage.toFixed(1)}% | MEM: ${this.formatBytes(status.metrics.memoryUsage)}`
      )
    }

    return lines.join('\n')
  }

  /**
   * Format log entry for display
   */
  private formatLogEntry(log: AgentLogEntry): string {
    const timestamp = log.timestamp.toLocaleTimeString()
    const levelColor = this.getLogLevelColor(log.level)

    return `${chalk.dim(timestamp)} ${levelColor(log.level.toUpperCase().padEnd(5))} ${log.message}`
  }

  /**
   * Get color for log level
   */
  private getLogLevelColor(level: LogLevel): (text: string) => string {
    switch (level) {
      case 'error':
        return chalk.red
      case 'warn':
        return chalk.yellow
      case 'info':
        return chalk.blue
      case 'debug':
        return chalk.gray
      default:
        return chalk.white
    }
  }

  /**
   * Check for security issues in agent
   */
  private checkAgentSecurity(status: VMAgentStatus): string[] {
    const issues: string[] = []

    // Check token usage
    const tokenPercent = (status.tokenUsage.used / status.tokenUsage.budget) * 100
    if (tokenPercent > 95) {
      issues.push('Token budget almost exhausted')
    }

    // Check VM state
    if (status.vmState === 'error') {
      issues.push('VM in error state')
    }

    // Check for old containers
    const ageHours = (Date.now() - status.startTime.getTime()) / (1000 * 60 * 60)
    if (ageHours > 24) {
      issues.push('Long-running container')
    }

    return issues
  }

  /**
   * Check if there are any security issues
   */
  private hasSecurityIssues(): boolean {
    for (const status of this.activeAgents.values()) {
      if (this.checkAgentSecurity(status).length > 0) {
        return true
      }
    }
    return false
  }

  /**
   * Format uptime in human readable format
   */
  private formatUptime(seconds: number): string {
    if (seconds < 60) {
      return `${seconds}s`
    } else if (seconds < 3600) {
      return `${Math.floor(seconds / 60)}m`
    } else {
      const hours = Math.floor(seconds / 3600)
      const minutes = Math.floor((seconds % 3600) / 60)
      return `${hours}h${minutes}m`
    }
  }

  /**
   * Format bytes in human readable format
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(1)}${units[unitIndex]}`
  }

  /**
   * Start periodic status updates
   */
  private startStatusUpdates(): void {
    this.updateInterval = setInterval(() => {
      this.emit('status:update', {
        activeAgents: this.activeAgents.size,
        indicators: this.getPromptIndicators(),
      })
    }, this.UPDATE_INTERVAL)
  }

  /**
   * Stop status updates
   */
  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval)
      this.updateInterval = null
    }
  }
}

// Type definitions
export interface VMAgentStatus {
  agentId: string
  vmState: VMState
  containerId?: string
  tokenUsage: {
    used: number
    budget: number
    remaining: number
  }
  vscodePort?: number
  startTime: Date
  lastActivity: Date
  logs: AgentLogEntry[]
  metrics: {
    cpuUsage: number
    memoryUsage: number
    networkActivity: number
    diskUsage: number
  }
}

export interface AgentLogEntry {
  timestamp: Date
  level: LogLevel
  message: string
  source?: string
  context?: any
}

export type LogLevel = 'error' | 'warn' | 'info' | 'debug'
export type StatusDisplayMode = 'compact' | 'detailed' | 'minimal'
