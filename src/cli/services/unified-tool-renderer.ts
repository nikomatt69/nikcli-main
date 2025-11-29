import chalk from 'chalk'
import type { AdvancedCliUI } from '../ui/advanced-cli-ui'
import type { StreamttyService } from './streamtty-service'
import { StreamProtocol } from './streamtty-service'
import { terminalOutputManager, TerminalOutputManager } from '../ui/terminal-output-manager'

/** 
 * Unified Tool Rendering Service
 *
 * Centralizes tool call rendering across all execution modes (default, plan, VM, parallel)
 * to ensure consistent display in Recent Updates and terminal output.
 */

export interface ToolCallMetadata {
  agentName?: string
  mode?: 'default' | 'plan' | 'vm' | 'parallel'
  toolCallId?: string
  timestamp?: Date
  persistent?: boolean
  [key: string]: any
}

export interface ToolRenderOptions {
  showInRecentUpdates?: boolean
  streamToTerminal?: boolean
  persistent?: boolean
  expiryMs?: number
}

export class UnifiedToolRenderer {
  private advancedUI: AdvancedCliUI
  private streamttyService: StreamttyService
  private activeToolCalls: Map<string, { name: string; startTime: number; metadata: ToolCallMetadata }> = new Map()
  private isExecutionActive = false
  private toolLogsPersistent = true

  constructor(advancedUI: AdvancedCliUI, streamttyService: StreamttyService) {
    this.advancedUI = advancedUI
    this.streamttyService = streamttyService
  }

  /**
   * Start execution mode - makes tool logs persistent
   */
  startExecution(mode: 'default' | 'plan' | 'vm' | 'parallel'): void {
    this.isExecutionActive = true
    this.toolLogsPersistent = true

    // Disable ephemeral cleanup during execution
    if (this.advancedUI && typeof (this.advancedUI as any).pauseEphemeralCleanup === 'function') {
      ; (this.advancedUI as any).pauseEphemeralCleanup()
    }
  }

  /**
   * End execution mode - resume normal cleanup
   */
  endExecution(): void {
    this.isExecutionActive = false
    this.activeToolCalls.clear()

    // Resume ephemeral cleanup
    if (this.advancedUI && typeof (this.advancedUI as any).resumeEphemeralCleanup === 'function') {
      ; (this.advancedUI as any).resumeEphemeralCleanup()
    }
  }

  /**
   * Log tool call start with unified formatting
   */
  async logToolCall(
    toolName: string,
    toolArgs?: Record<string, any>,
    metadata: ToolCallMetadata = {},
    options: ToolRenderOptions = {}
  ): Promise<void> {
    const {
      showInRecentUpdates = true,
      streamToTerminal = true,
      persistent = this.toolLogsPersistent,
      expiryMs = persistent ? undefined : 30000
    } = options

    const toolCallId = metadata.toolCallId || `${toolName}-${Date.now()}`
    const agentPrefix = metadata.agentName ? `${metadata.agentName}:` : ''
    const formattedName = `${agentPrefix}${toolName}`.toLowerCase()

    // Track active tool call
    this.activeToolCalls.set(toolCallId, {
      name: toolName,
      startTime: Date.now(),
      metadata
    })

    // 1. Log to terminal output directly with proper formatting
    // This ensures tool calls are visible during execution with ⏺ format
    const outputText = chalk.cyan(`⏺ ${formattedName}()`)
    console.log(outputText)

    // Track terminal output for management
    const lines = TerminalOutputManager.calculateLines(outputText)
    const outputId = terminalOutputManager.reserveSpace('UnifiedToolCall', lines)
    terminalOutputManager.confirmOutput(outputId, 'UnifiedToolCall', lines, {
      persistent,
      expiryMs
    })

    // 2. Log to Recent Updates via advancedUI (for UI panels, not console output)
    // Skip console output since we already printed above
    if (showInRecentUpdates) {
      // Add to recent updates tracking without duplicate console.log
      this.advancedUI.addLiveUpdate({
        type: 'info',
        content: `${formattedName}()`,
        source: metadata.agentName || 'System'
      })
    }

    // 3. Stream to terminal via streamtty if in streaming mode
    // This is for markdown rendering in compatible terminals
    // Use AI SDK events for better formatting
    if (streamToTerminal) {
      const toolCallEvent = StreamProtocol.createToolCall(
        toolName,
        toolArgs || {},
        {
          agentId: metadata.agentName,
          timestamp: Date.now()
        }
      )
      await this.streamttyService.streamAISDKEvent(toolCallEvent)
    }
  }

  /**
   * Log tool call update/progress
   */
  async logToolUpdate(
    toolCallId: string,
    level: 'info' | 'success' | 'warning' | 'error',
    message: string,
    options: ToolRenderOptions = {}
  ): Promise<void> {
    const {
      showInRecentUpdates = true,
      streamToTerminal = true,
      persistent = this.toolLogsPersistent
    } = options

    // 1. Log to Recent Updates
    if (showInRecentUpdates) {
      this.advancedUI.logFunctionUpdate(level, message)
    }

    // 2. Stream to terminal
    if (streamToTerminal) {
      const icon = this.getIconForLevel(level)
      const color = this.getColorForLevel(level)
      const updateMarkdown = `  ${icon} ${color(message)}\n`
      await this.streamttyService.streamChunk(updateMarkdown, 'tool')
    }
  }

  /**
   * Log tool call result/completion
   */
  async logToolResult(
    toolCallId: string,
    result: any,
    metadata: ToolCallMetadata = {},
    options: ToolRenderOptions = {}
  ): Promise<void> {
    const activeCall = this.activeToolCalls.get(toolCallId)
    if (!activeCall) return

    const duration = Date.now() - activeCall.startTime
    const {
      showInRecentUpdates = true,
      streamToTerminal = true,
      persistent = this.toolLogsPersistent
    } = options

    const success = !result?.error
    const level = success ? 'success' : 'error'
    const resultMessage = success
      ? `${activeCall.name} completed (${duration}ms)`
      : `${activeCall.name} failed: ${result.error}`

    // Log completion update
    await this.logToolUpdate(toolCallId, level, resultMessage, options)

    // Stream tool result as AI SDK event
    if (streamToTerminal) {
      const toolResultEvent = StreamProtocol.createToolResult(
        result,
        {
          toolName: activeCall.name,
          duration,
          success,
          timestamp: Date.now()
        }
      )
      await this.streamttyService.streamAISDKEvent(toolResultEvent)
    }

    // Show result details if available
    if (result && typeof result === 'object') {
      await this.showToolResultDetails(activeCall.name, result, options)
    }

    // Clean up tracking
    this.activeToolCalls.delete(toolCallId)
  }

  /**
   * Show detailed tool result (file diffs, content, etc.)
   */
  private async showToolResultDetails(
    toolName: string,
    result: any,
    options: ToolRenderOptions
  ): Promise<void> {
    const { streamToTerminal = true } = options

    switch (toolName) {
      case 'read_file':
      case 'Read':
        if (result.path && result.content) {
          this.advancedUI.showFileContent(result.path, result.content)
        }
        break

      case 'write_file':
      case 'Write':
      case 'edit_file':
      case 'Edit':
        if (result.path) {
          if (result.originalContent && result.newContent) {
            this.advancedUI.showFileDiff(result.path, result.originalContent, result.newContent)
          } else if (result.content) {
            this.advancedUI.showFileContent(result.path, result.content)
          }
        }
        break

      case 'grep':
      case 'Grep':
      case 'search_files':
        if (result.matches && Array.isArray(result.matches)) {
          const pattern = result.pattern || 'search'
          this.advancedUI.showGrepResults(pattern, result.matches)
        }
        break

      case 'glob':
      case 'Glob':
      case 'list_files':
        if (result.files && Array.isArray(result.files)) {
          const files = result.files.map((f: any) => f.path || f.name || f)
          this.advancedUI.showFileList(files, result.path || 'Files')
        }
        break

      case 'bash':
      case 'Bash':
      case 'execute_command':
        if (result.stdout || result.stderr) {
          const output = result.stdout || result.stderr
          if (streamToTerminal) {
            await this.streamttyService.streamChunk(`\`\`\`\n${output}\n\`\`\`\n`, 'tool')
          }
        }
        break
    }
  }

  /**
   * Format tool call as markdown for streaming
   */
  private formatToolCallMarkdown(
    toolName: string,
    toolArgs?: Record<string, any>,
    metadata: ToolCallMetadata = {}
  ): string {
    const agentPrefix = metadata.agentName ? `**[${metadata.agentName}]** ` : ''
    const argsStr = toolArgs ? this.formatToolArgs(toolArgs) : ''

    return `\n${agentPrefix}**${toolName}**${argsStr ? ` \`${argsStr}\`` : ''}\n`
  }

  /**
   * Format tool arguments for display
   */
  private formatToolArgs(args: Record<string, any>): string {
    const keys = Object.keys(args)
    if (keys.length === 0) return ''

    if (keys.length === 1) {
      const value = args[keys[0]]
      if (typeof value === 'string' && value.length < 50) {
        return value
      }
    }

    return keys.join(', ')
  }

  /**
   * Get icon for update level
   */
  private getIconForLevel(level: 'info' | 'success' | 'warning' | 'error'): string {
    switch (level) {
      case 'success': return '✓'
      case 'info': return 'ℹ'
      case 'warning': return '⚠︎'
      case 'error': return '✖'
      default: return '•'
    }
  }

  /**
   * Get color function for update level
   */
  private getColorForLevel(level: 'info' | 'success' | 'warning' | 'error'): (text: string) => string {
    switch (level) {
      case 'success': return chalk.green
      case 'info': return chalk.white
      case 'warning': return chalk.yellow
      case 'error': return chalk.red
      default: return chalk.gray
    }
  }

  /**
   * Get all active tool calls
   */
  getActiveToolCalls(): Map<string, { name: string; startTime: number; metadata: ToolCallMetadata }> {
    return new Map(this.activeToolCalls)
  }

  /**
   * Check if execution is active
   */
  isActive(): boolean {
    return this.isExecutionActive
  }
}

// Singleton instance
let unifiedToolRendererInstance: UnifiedToolRenderer | null = null

export function initializeUnifiedToolRenderer(
  advancedUI: AdvancedCliUI,
  streamttyService: StreamttyService
): UnifiedToolRenderer {
  if (!unifiedToolRendererInstance) {
    unifiedToolRendererInstance = new UnifiedToolRenderer(advancedUI, streamttyService)
  }
  return unifiedToolRendererInstance
}

export function getUnifiedToolRenderer(): UnifiedToolRenderer {
  if (!unifiedToolRendererInstance) {
    throw new Error('UnifiedToolRenderer not initialized. Call initializeUnifiedToolRenderer first.')
  }
  return unifiedToolRendererInstance
}
