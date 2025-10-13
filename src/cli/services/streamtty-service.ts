import chalk from 'chalk'
// Optional import of streamtty with graceful fallback if not installed
let applySyntaxHighlight: any
let colorizeBlock: any
let StreamProtocol: any
let Streamtty: any
let syntaxColors: any
type StreamEvent = any
let StreamEventType: any
try {
  ;({
    applySyntaxHighlight,
    colorizeBlock,
    StreamProtocol,
    Streamtty,
    syntaxColors,
    StreamEventType,
  } = require('streamtty'))
} catch {
  // Minimal fallbacks for build environments without streamtty
  applySyntaxHighlight = (s: string) => s
  colorizeBlock = (s: string) => s
  StreamProtocol = {
    createTextDelta: (s: string) => ({ type: 'text_delta', content: s }),
    createThinking: (s: string) => ({ type: 'thinking', content: s }),
    createError: (s: string) => ({ type: 'error', content: s }),
    createStatus: (s: string) => ({ type: 'status', content: s }),
  }
  Streamtty = null
  syntaxColors = { comment: '', error: '', reset: '', path: '', title: '', keyword: '' }
  StreamEventType = {}
}
import { TerminalOutputManager, terminalOutputManager } from '../ui/terminal-output-manager'

export type ChunkType = 'ai' | 'tool' | 'thinking' | 'system' | 'error' | 'user' | 'vm' | 'agent'

export interface StreamttyServiceOptions {
  parseIncompleteMarkdown?: boolean
  syntaxHighlight?: boolean
  autoScroll?: boolean
  maxWidth?: number
  gfm?: boolean
  useBlessedMode?: boolean
}

export interface RenderStats {
  totalChunks: number
  totalBlocks: number
  aiChunks: number
  toolChunks: number
  errorChunks: number
  fallbackUsed: boolean
  lastRenderTime: number
  aiSdkEvents: number
  toolCallEvents: number
  toolResultEvents: number
}

/**
 * Centralized StreamttyService that manages all terminal rendering through streamtty
 * Routes all AI chunks, UI messages, and system output through streamtty for consistent formatting
 */
export class StreamttyService {
  private streamtty: any | null = null
  private isInitialized = false
  private useBlessedMode = false
  private stats: RenderStats = {
    totalChunks: 0,
    totalBlocks: 0,
    aiChunks: 0,
    toolChunks: 0,
    errorChunks: 0,
    fallbackUsed: false,
    lastRenderTime: 0,
    aiSdkEvents: 0,
    toolCallEvents: 0,
    toolResultEvents: 0,
  }
  private streamBuffer = ''
  private currentOutputId: string | null = null

  constructor(private options: StreamttyServiceOptions = {}) {
    this.useBlessedMode = options.useBlessedMode ?? false
    this.initialize()
  }

  private initialize(): void {
    try {
      // Allow complete disable via env for troubleshooting
      const disable = (process.env.NIKCLI_NO_STREAMTTY || '').toLowerCase()
      if (disable && !['0', 'false', ''].includes(disable)) {
        this.isInitialized = true
        this.stats.fallbackUsed = true
        return
      }

      // Only use blessed mode if explicitly requested AND TTY is available
      if (this.useBlessedMode && process.stdout.isTTY) {
        this.streamtty = new Streamtty({
          parseIncompleteMarkdown: this.options.parseIncompleteMarkdown ?? true,
          syntaxHighlight: this.options.syntaxHighlight ?? true,
          autoScroll: this.options.autoScroll ?? true,
          maxWidth: this.options.maxWidth ?? 120,
          gfm: this.options.gfm ?? true,
        })
        this.isInitialized = true
      } else {
        // Use stdout mode (non-blessed)
        this.isInitialized = true
        this.stats.fallbackUsed = true
      }
    } catch (error) {
      console.warn('Failed to initialize Streamtty, using fallback mode:', error)
      this.isInitialized = true
      this.stats.fallbackUsed = true
    }
  }

  /**
   * Stream a single chunk with type metadata for appropriate formatting
   */
  async streamChunk(chunk: string, type: ChunkType = 'ai'): Promise<void> {
    if (!chunk) return

    this.stats.totalChunks++
    this.stats.lastRenderTime = Date.now()

    // Track chunk type stats
    switch (type) {
      case 'ai':
        this.stats.aiChunks++
        break
      case 'tool':
        this.stats.toolChunks++
        break
      case 'error':
        this.stats.errorChunks++
        break
    }

    // Apply syntax highlighting based on chunk type (except tools which stay raw)
    let processedChunk = chunk
    if (type !== 'tool') {
      // Apply ANSI syntax highlighting for stdout mode
      processedChunk = applySyntaxHighlight(chunk)

      // Apply type-specific coloring
      if (type === 'thinking') {
        processedChunk = colorizeBlock(processedChunk, syntaxColors.comment)
      } else if (type === 'error') {
        processedChunk = colorizeBlock(processedChunk, syntaxColors.error)
      }
    }

    this.streamBuffer += processedChunk

    // If blessed mode is active, use streamtty
    if (this.streamtty && this.isInitialized && !this.stats.fallbackUsed) {
      try {
        this.streamtty.stream(processedChunk)
        return
      } catch (error) {
        console.warn('Streamtty stream failed, falling back:', error)
        this.stats.fallbackUsed = true
      }
    }

    // Fallback: direct stdout with terminal output tracking
    const chunkLines = TerminalOutputManager.calculateLines(processedChunk)
    const outputId = terminalOutputManager.reserveSpace('StreamttyChunk', chunkLines)
    process.stdout.write(processedChunk)
    terminalOutputManager.confirmOutput(outputId, 'StreamttyChunk', chunkLines, {
      persistent: false,
      expiryMs: 30000,
    })
  }

  /**
   * Render a complete block of content with formatting
   */
  async renderBlock(content: string, type: ChunkType = 'system'): Promise<void> {
    if (!content) return

    this.stats.totalBlocks++
    this.stats.lastRenderTime = Date.now()

    const formattedContent = this.formatContentByType(content, type)

    // If blessed mode is active, use streamtty
    if (this.streamtty && this.isInitialized && !this.stats.fallbackUsed) {
      try {
        this.streamtty.stream(formattedContent)
        this.streamtty.render()
        return
      } catch (error) {
        console.warn('Streamtty block render failed, falling back:', error)
        this.stats.fallbackUsed = true
      }
    }

    // Fallback: direct output with tracking
    const lines = TerminalOutputManager.calculateLines(formattedContent)
    const outputId = terminalOutputManager.reserveSpace('StreamttyBlock', lines)
    console.log(formattedContent)
    terminalOutputManager.confirmOutput(outputId, 'StreamttyBlock', lines, {
      persistent: false,
      expiryMs: 30000,
    })
  }

  /**
   * Format content as markdown based on chunk type
   * Uses ANSI colors and syntax highlighting (no emoji)
   */
  private formatContentByType(content: string, type: ChunkType): string {
    switch (type) {
      case 'error': {
        // Red for errors with unicode symbol
        const highlighted = applySyntaxHighlight(content)
        const errorPrefix = `${syntaxColors.error}▸ ERROR${syntaxColors.reset}\n`
        return errorPrefix + colorizeBlock(highlighted, syntaxColors.error)
      }

      case 'thinking': {
        // Dark gray for thinking/cognitive blocks with unicode symbol
        const highlightedThinking = applySyntaxHighlight(content)
        const thinkingPrefix = `${syntaxColors.comment}▸ ${syntaxColors.reset}`
        return thinkingPrefix + colorizeBlock(highlightedThinking, syntaxColors.comment)
      }

      case 'tool': {
        // Tool output without formatting (raw content)
        const toolPrefix = `${syntaxColors.path}▸ TOOL${syntaxColors.reset}\n`
        return toolPrefix + content
      }

      case 'system': {
        // Light gray for system messages with unicode symbol
        const highlightedSystem = applySyntaxHighlight(content)
        const systemPrefix = `${syntaxColors.reset}▸ ${syntaxColors.reset}`
        return systemPrefix + highlightedSystem
      }

      case 'user': {
        // Bright cyan for user messages with unicode symbol
        const highlightedUser = applySyntaxHighlight(content)
        const userPrefix = `${syntaxColors.title}▸ USER${syntaxColors.reset}\n`
        return userPrefix + colorizeBlock(highlightedUser, syntaxColors.title)
      }

      case 'vm': {
        // Bright blue for VM messages with unicode symbol
        const highlightedVm = applySyntaxHighlight(content)
        const vmPrefix = `${syntaxColors.title}▸ VM${syntaxColors.reset}\n`
        return vmPrefix + highlightedVm
      }

      case 'agent': {
        // Magenta for agent messages with unicode symbol
        const highlightedAgent = applySyntaxHighlight(content)
        const agentPrefix = `${syntaxColors.keyword}▸ AGENT${syntaxColors.reset}\n`
        return agentPrefix + colorizeBlock(highlightedAgent, syntaxColors.keyword)
      }

      case 'ai':
      default: {
        // AI content with syntax highlighting applied
        const highlightedAi = applySyntaxHighlight(content)
        return highlightedAi
      }
    }
  }

  /**
   * Create a streaming generator that outputs through streamtty
   */
  async *createStreamRenderer(
    sourceStream: AsyncGenerator<string, void, unknown>,
    type: ChunkType = 'ai',
    options: {
      isCancelled?: () => boolean
    } = {}
  ): AsyncGenerator<string, void, unknown> {
    const isCancelled = options.isCancelled || (() => false)

    for await (const chunk of sourceStream) {
      if (isCancelled()) break

      await this.streamChunk(chunk, type)
      yield chunk
    }
  }

  /**
   * Clear the display
   */
  clear(): void {
    this.streamBuffer = ''
    if (this.streamtty) {
      try {
        this.streamtty.clear()
      } catch (error) {
        // Fallback clear
        console.clear()
      }
    }
  }

  /**
   * Get rendering statistics
   */
  getStats(): RenderStats {
    return { ...this.stats }
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalChunks: 0,
      totalBlocks: 0,
      aiChunks: 0,
      toolChunks: 0,
      errorChunks: 0,
      fallbackUsed: this.stats.fallbackUsed,
      lastRenderTime: 0,
      aiSdkEvents: 0,
      toolCallEvents: 0,
      toolResultEvents: 0,
    }
  }

  /**
   * Get current buffer content
   */
  getBuffer(): string {
    return this.streamBuffer
  }

  /**
   * Check if blessed mode is active
   */
  isBlessedModeActive(): boolean {
    return this.isInitialized && this.streamtty !== null && !this.stats.fallbackUsed
  }

  /**
   * Get streamtty instance for advanced usage
   */
  getStreamttyInstance(): any | null {
    return this.streamtty
  }

  /**
   * Stream a structured AI SDK event
   */
  async streamAISDKEvent(event: StreamEvent): Promise<void> {
    if (!event) return

    this.stats.aiSdkEvents++
    this.stats.lastRenderTime = Date.now()

    // Track event-specific stats
    if (event.type === 'tool_call') {
      this.stats.toolCallEvents++
    } else if (event.type === 'tool_result') {
      this.stats.toolResultEvents++
    }

    // If blessed mode is active with streamtty, use AI SDK adapter
    if (this.streamtty && this.isInitialized && !this.stats.fallbackUsed) {
      try {
        await this.streamtty.streamEvent(event)
        return
      } catch (error) {
        console.warn('Streamtty AI SDK event failed, falling back:', error)
        this.stats.fallbackUsed = true
      }
    }

    // Fallback: format and output to stdout
    const formattedEvent = this.formatAISDKEventFallback(event)
    if (formattedEvent) {
      const lines = TerminalOutputManager.calculateLines(formattedEvent)
      const outputId = terminalOutputManager.reserveSpace('AISDKEvent', lines)
      process.stdout.write(formattedEvent)
      terminalOutputManager.confirmOutput(outputId, 'AISDKEvent', lines, {
        persistent: false,
        expiryMs: 30000,
      })
    }
  }

  /**
   * Format AI SDK event for fallback stdout rendering
   */
  private formatAISDKEventFallback(event: StreamEvent): string {
    switch (event.type) {
      case 'text_delta':
        return event.content || ''

      case 'tool_call': {
        const toolArgs = JSON.stringify(event.toolArgs, null, 2)
        return `\n🔧 ${chalk.bold(event.toolName)}\n${chalk.gray('```json')}\n${toolArgs}\n${chalk.gray('```')}\n\n`
      }

      case 'tool_result': {
        const resultPreview =
          typeof event.toolResult === 'string' ? event.toolResult : JSON.stringify(event.toolResult, null, 2)
        const truncated = resultPreview.length > 200 ? resultPreview.slice(0, 200) + '...' : resultPreview
        return `\n✓ ${chalk.bold('Result')}: ${truncated}\n\n`
      }

      case 'thinking':
        return `\n${chalk.gray('> 💭')} ${chalk.italic(event.content)}\n\n`

      case 'reasoning':
        return `\n${chalk.gray('> ⚡')} ${chalk.italic(event.content)}\n\n`

      case 'status':
      case 'step': {
        const statusIcon = this.getStatusIcon(event.metadata?.status)
        return `\n${statusIcon} ${chalk.bold(event.content)}\n\n`
      }

      case 'error':
        return `\n❌ ${chalk.red.bold('Error')}: ${event.content}\n\n`

      case 'start':
        return `\n🚀 ${chalk.bold('Starting')}...\n\n`

      case 'complete':
        return `\n✅ ${chalk.bold('Complete')}\n\n`

      default:
        return ''
    }
  }

  /**
   * Get status icon for event metadata
   */
  private getStatusIcon(status?: string): string {
    const iconMap: Record<string, string> = {
      pending: '⏳',
      running: '🔄',
      completed: '✅',
      failed: '❌',
      info: 'ℹ️',
    }
    return iconMap[status || 'info'] || 'ℹ️'
  }

  /**
   * Handle an AI SDK stream with full event processing
   */
  async *handleAIStream(stream: AsyncGenerator<StreamEvent>): AsyncGenerator<string> {
    let accumulated = ''

    for await (const event of stream) {
      await this.streamAISDKEvent(event)

      // Accumulate text content for return value
      if (event.type === 'text_delta' && event.content) {
        accumulated += event.content
        yield event.content
      }
    }

    return accumulated
  }

  /**
   * Convert legacy chunk type to AI SDK event
   */
  async streamChunkAsAIEvent(chunk: string, type: ChunkType = 'ai'): Promise<void> {
    const event = this.chunkTypeToAISDKEvent(chunk, type)
    if (event) {
      await this.streamAISDKEvent(event)
    } else {
      // Fallback to legacy streaming
      await this.streamChunk(chunk, type)
    }
  }

  /**
   * Convert chunk type to AI SDK event
   */
  private chunkTypeToAISDKEvent(chunk: string, type: ChunkType): StreamEvent | null {
    switch (type) {
      case 'ai':
        return StreamProtocol.createTextDelta(chunk)

      case 'thinking':
        return StreamProtocol.createThinking(chunk)

      case 'error':
        return StreamProtocol.createError(chunk)

      case 'system':
        return StreamProtocol.createStatus(chunk)

      default:
        return null
    }
  }

  /**
   * Destroy and cleanup
   */
  destroy(): void {
    if (this.streamtty) {
      try {
        this.streamtty.destroy()
      } catch (error) {
        // Ignore cleanup errors
      }
      this.streamtty = null
    }
    this.isInitialized = false
  }
}

// Singleton instance - centralized rendering service
export const streamttyService = new StreamttyService({
  parseIncompleteMarkdown: true,
  syntaxHighlight: true,
  autoScroll: true,
  maxWidth: 120,
  gfm: true,
  useBlessedMode: false, // Default to stdout mode for broader compatibility
})

// Re-export AI SDK types for convenience
export type { StreamEvent }
export { StreamProtocol }
