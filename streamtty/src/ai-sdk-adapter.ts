/**
 * AI SDK Stream Adapter
 * 
 * This module provides an adapter that handles AI SDK streaming events
 * and formats them appropriately for TTY rendering using streamtty.
 */

import {
  StreamEvent,
  StreamEventType,
  StreamEventOptions,
  ToolCallEvent,
  ToolResultEvent,
  TextDeltaEvent,
  ThinkingEvent,
  StatusEvent,
  ErrorEvent
} from './types/stream-events'
import { StreamProtocol } from './stream-protocol'

export interface AISDKStreamAdapterOptions extends StreamEventOptions {
  maxToolResultLength?: number
  formatToolCalls?: boolean
  showThinking?: boolean
  renderTimestamps?: boolean
}

export class AISDKStreamAdapter {
  private options: Required<AISDKStreamAdapterOptions>

  constructor(
    private renderer: { stream: (content: string) => void },
    options: AISDKStreamAdapterOptions = {}
  ) {
    this.options = {
      parseIncompleteMarkdown: true,
      syntaxHighlight: true,
      formatToolCalls: true,
      showThinking: true,
      maxToolResultLength: 200,
      renderTimestamps: false,
      ...options
    }
  }

  /**
   * Handle a stream of AI SDK events
   */
  async *handleAISDKStream(
    stream: AsyncGenerator<StreamEvent>
  ): AsyncGenerator<void> {
    for await (const event of stream) {
      await this.processEvent(event)
      yield
    }
  }

  /**
   * Process a single stream event
   */
  async processEvent(event: StreamEvent): Promise<void> {
    // Validate event
    if (!StreamProtocol.validateEvent(event)) {
      console.warn('Invalid stream event:', event)
      return
    }

    // Check if event should be rendered
    if (!StreamProtocol.shouldRenderEvent(event, this.options)) {
      return
    }

    // Transform and process event
    const transformedEvent = StreamProtocol.transformEvent(event)
    await this.renderEvent(transformedEvent)
  }

  /**
   * Render a validated stream event
   */
  private async renderEvent(event: StreamEvent): Promise<void> {
    switch (event.type) {
      case 'text_delta':
        await this.renderTextDelta(event as TextDeltaEvent)
        break
      case 'tool_call':
        await this.renderToolCall(event as ToolCallEvent)
        break
      case 'tool_result':
        await this.renderToolResult(event as ToolResultEvent)
        break
      case 'thinking':
      case 'reasoning':
        await this.renderThinking(event as ThinkingEvent)
        break
      case 'status':
      case 'step':
        await this.renderStatus(event as StatusEvent)
        break
      case 'error':
        await this.renderError(event as ErrorEvent)
        break
      case 'start':
        await this.renderStart(event)
        break
      case 'complete':
        await this.renderComplete(event)
        break
    }
  }

  /**
   * Render text delta events (streaming text)
   */
  private async renderTextDelta(event: TextDeltaEvent): Promise<void> {
    if (event.content) {
      this.renderer.stream(event.content)
    }
  }

  /**
   * Render tool call events
   */
  private async renderToolCall(event: ToolCallEvent): Promise<void> {
    if (!this.options.formatToolCalls) {
      return
    }

    const formatted = this.formatToolCall(event)
    this.renderer.stream(formatted)
  }

  /**
   * Format a tool call event for display
   */
  private formatToolCall(event: ToolCallEvent): string {
    const timestamp = this.options.renderTimestamps && event.metadata?.timestamp
      ? `[${new Date(event.metadata.timestamp).toLocaleTimeString()}] `
      : ''

    const toolIcon = this.getToolIcon(event.toolName)
    const formattedArgs = this.formatToolArgs(event.toolArgs)

    return `\n\n${timestamp}${toolIcon} **${event.toolName}**\n\`\`\`json\n${formattedArgs}\n\`\`\`\n\n`
  }

  /**
   * Render tool result events
   */
  private async renderToolResult(event: ToolResultEvent): Promise<void> {
    const formatted = this.formatToolResult(event)
    this.renderer.stream(formatted)
  }

  /**
   * Format a tool result event for display
   */
  private formatToolResult(event: ToolResultEvent): string {
    const timestamp = this.options.renderTimestamps && event.metadata?.timestamp
      ? `[${new Date(event.metadata.timestamp).toLocaleTimeString()}] `
      : ''

    const resultPreview = this.formatToolResultContent(event.toolResult)
    const truncated = this.truncateContent(resultPreview, this.options.maxToolResultLength)

    return `\n${timestamp}✓ **Result**: ${truncated}\n\n`
  }

  /**
   * Format tool result content for display
   */
  private formatToolResultContent(result: any): string {
    if (typeof result === 'string') {
      return result
    }

    if (typeof result === 'object' && result !== null) {
      try {
        return JSON.stringify(result, null, 2)
      } catch {
        return String(result)
      }
    }

    return String(result)
  }

  /**
   * Truncate content to specified length
   */
  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content
    }

    return content.slice(0, maxLength) + '...'
  }

  /**
   * Render thinking/reasoning events
   */
  private async renderThinking(event: ThinkingEvent): Promise<void> {
    if (!this.options.showThinking || !event.content) {
      return
    }

    const formatted = this.formatThinking(event)
    this.renderer.stream(formatted)
  }

  /**
   * Format thinking events for display
   */
  private formatThinking(event: ThinkingEvent): string {
    const timestamp = this.options.renderTimestamps && event.metadata?.timestamp
      ? `[${new Date(event.metadata.timestamp).toLocaleTimeString()}] `
      : ''

    const icon = event.type === 'reasoning' ? '⚡' : '💭'

    return `\n${timestamp}> ${icon} *${event.content}*\n\n`
  }

  /**
   * Render status events
   */
  private async renderStatus(event: StatusEvent): Promise<void> {
    const formatted = this.formatStatus(event)
    this.renderer.stream(formatted)
  }

  /**
   * Format status events for display
   */
  private formatStatus(event: StatusEvent): string {
    const timestamp = this.options.renderTimestamps && event.metadata?.timestamp
      ? `[${new Date(event.metadata.timestamp).toLocaleTimeString()}] `
      : ''

    const status = event.metadata?.status || 'info'
    const icon = this.getStatusIcon(status)

    return `\n${timestamp}${icon} **${event.content}**\n\n`
  }

  /**
   * Render error events
   */
  private async renderError(event: ErrorEvent): Promise<void> {
    const formatted = this.formatError(event)
    this.renderer.stream(formatted)
  }

  /**
   * Format error events for display
   */
  private formatError(event: ErrorEvent): string {
    const timestamp = this.options.renderTimestamps && event.metadata?.timestamp
      ? `[${new Date(event.metadata.timestamp).toLocaleTimeString()}] `
      : ''

    const code = event.metadata?.code ? ` (${event.metadata.code})` : ''

    return `\n${timestamp}❌ **Error**${code}: ${event.content}\n\n`
  }

  /**
   * Render start events
   */
  private async renderStart(event: StreamEvent): Promise<void> {
    const timestamp = this.options.renderTimestamps && event.metadata?.timestamp
      ? `[${new Date(event.metadata.timestamp).toLocaleTimeString()}] `
      : ''

    this.renderer.stream(`\n${timestamp}🚀 **Starting**...\n\n`)
  }

  /**
   * Render complete events
   */
  private async renderComplete(event: StreamEvent): Promise<void> {
    const timestamp = this.options.renderTimestamps && event.metadata?.timestamp
      ? `[${new Date(event.metadata.timestamp).toLocaleTimeString()}] `
      : ''

    this.renderer.stream(`\n${timestamp}✅ **Complete**\n\n`)
  }

  /**
   * Get appropriate icon for tool name
   */
  private getToolIcon(toolName: string): string {
    const iconMap: Record<string, string> = {
      'read_file': '📖',
      'write_file': '✏️',
      'edit_file': '🔧',
      'search': '🔍',
      'run_command': '⚡',
      'web_search': '🌐',
      'create_file': '📄',
      'delete_file': '🗑️',
      'list_files': '📁',
      'grep': '🔎',
      'git': '🌿',
      'npm': '📦',
      'docker': '🐳',
      'default': '🔧'
    }

    // Try exact match first
    if (iconMap[toolName]) {
      return iconMap[toolName]
    }

    // Try partial matches
    for (const [key, icon] of Object.entries(iconMap)) {
      if (toolName.includes(key)) {
        return icon
      }
    }

    return iconMap.default
  }

  /**
   * Get appropriate icon for status
   */
  private getStatusIcon(status: string): string {
    const iconMap: Record<string, string> = {
      'pending': '⏳',
      'running': '🔄',
      'completed': '✅',
      'failed': '❌',
      'info': 'ℹ️',
      'warning': '⚠️',
      'success': '✅',
      'error': '❌'
    }

    return iconMap[status] || iconMap.info
  }

  /**
   * Format tool arguments for display
   */
  private formatToolArgs(args: Record<string, any>): string {
    try {
      return JSON.stringify(args, null, 2)
    } catch {
      return String(args)
    }
  }

  /**
   * Update adapter options
   */
  updateOptions(options: Partial<AISDKStreamAdapterOptions>): void {
    this.options = { ...this.options, ...options }
  }

  /**
   * Get current options
   */
  getOptions(): AISDKStreamAdapterOptions {
    return { ...this.options }
  }
}
