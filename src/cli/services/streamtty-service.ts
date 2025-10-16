import chalk from 'chalk'
import {
  Streamtty,
  applySyntaxHighlight,
  colorizeBlock,
  syntaxColors,
  StreamEvent,
  StreamEventType,
  StreamProtocol,
  type EnhancedFeaturesConfig,
  type TTYControlsConfig,
  type MermaidTTYConfig,
  type MathRenderConfig,
  type SecurityConfig
} from 'streamtty'
import { terminalOutputManager, TerminalOutputManager } from '../ui/terminal-output-manager'

export type ChunkType = 'ai' | 'tool' | 'thinking' | 'system' | 'error' | 'user' | 'vm' | 'agent'

export interface StreamttyServiceOptions {
  parseIncompleteMarkdown?: boolean
  syntaxHighlight?: boolean
  autoScroll?: boolean
  maxWidth?: number
  gfm?: boolean
  useBlessedMode?: boolean

  // Enhanced features (native integration)
  enhancedFeatures?: EnhancedFeaturesConfig
  theme?: 'light' | 'dark' | 'auto'
  controls?: boolean | TTYControlsConfig
  mermaidConfig?: MermaidTTYConfig
  mathConfig?: MathRenderConfig
  security?: SecurityConfig
  shikiLanguages?: string[]
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
  private streamtty: Streamtty | null = null
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
      // Only use blessed mode if explicitly requested AND TTY is available
      if (this.useBlessedMode && process.stdout.isTTY) {
        // Auto-enable enhanced features for blessed mode if not explicitly disabled
        const enhancedFeatures: EnhancedFeaturesConfig = {
          math: true,
          mermaid: true,
          shiki: true,
          security: true,
          interactiveControls: true, // Disabled by default to not interfere with existing workflows
          advancedTables: true,
          ...this.options.enhancedFeatures
        }

        this.streamtty = new Streamtty({
          parseIncompleteMarkdown: this.options.parseIncompleteMarkdown ?? true,
          syntaxHighlight: this.options.syntaxHighlight ?? true,
          autoScroll: this.options.autoScroll ?? true,
          maxWidth: this.options.maxWidth ?? 120,
          gfm: this.options.gfm ?? true,
          // Enhanced features integration
          enhancedFeatures,
          theme: this.options.theme ?? 'dark',
          controls: this.options.controls,
          mermaidConfig: this.options.mermaidConfig,
          mathConfig: this.options.mathConfig,
          security: this.options.security ?? {
            enabled: true,
            stripDangerousAnsi: true,
            allowedLinkPrefixes: ['http://', 'https://'],
            allowedImagePrefixes: ['http://', 'https://'],
          },
          shikiLanguages: this.options.shikiLanguages ?? [
            'typescript', 'javascript', 'python', 'bash', 'json',
            'markdown', 'yaml', 'sql', 'html', 'css'
          ],
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
    // Only apply ANSI highlighting in fallback mode (stdout direct) 
    // In blessed mode, streamtty handles highlighting internally to avoid double-processing
    let processedChunk = chunk

    // Check if chunk already contains ANSI codes (to avoid double-processing)
    const hasAnsiCodes = /\x1b\[[\d;]*m/.test(chunk)
    const shouldHighlight = type !== 'tool' &&
      (!this.streamtty || this.stats.fallbackUsed) &&
      !hasAnsiCodes // Don't highlight if already has ANSI codes

    if (shouldHighlight) {
      // Apply ANSI syntax highlighting for stdout mode only
      processedChunk = applySyntaxHighlight(chunk)

      // Apply type-specific coloring
      if (type === 'thinking') {
        processedChunk = colorizeBlock(processedChunk, syntaxColors.comment)
      } else if (type === 'error') {
        processedChunk = colorizeBlock(processedChunk, syntaxColors.error)
      }
    }

    this.streamBuffer += processedChunk

    // If blessed mode is active, use streamtty (pass raw chunk to let streamtty handle highlighting)
    if (this.streamtty && this.isInitialized && !this.stats.fallbackUsed) {
      try {
        // Pass original chunk in blessed mode, streamtty will handle the formatting
        this.streamtty.stream(chunk)
        return
      } catch (error) {
        console.warn('Streamtty stream failed, falling back:', error)
        this.stats.fallbackUsed = true
      }
    }

    // Fallback: direct stdout with terminal output tracking (use highlighted version)
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

    // If blessed mode is active, use streamtty with raw content
    if (this.streamtty && this.isInitialized && !this.stats.fallbackUsed) {
      try {
        // Let streamtty handle formatting internally
        this.streamtty.stream(content)
        this.streamtty.render()
        return
      } catch (error) {
        console.warn('Streamtty block render failed, falling back:', error)
        this.stats.fallbackUsed = true
      }
    }

    // Fallback: format for stdout and output with tracking
    const formattedContent = this.formatContentByType(content, type)
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
    // Check if content already has ANSI codes to avoid double-processing
    const hasAnsiCodes = /\x1b\[[\d;]*m/.test(content)

    switch (type) {
      case 'error':
        // Red for errors with unicode symbol
        const highlighted = hasAnsiCodes ? content : applySyntaxHighlight(content)
        const errorPrefix = `${syntaxColors.error}▸ ERROR${syntaxColors.reset}\n`
        return errorPrefix + colorizeBlock(highlighted, syntaxColors.error)

      case 'thinking':
        // Dark gray for thinking/cognitive blocks with unicode symbol
        const highlightedThinking = hasAnsiCodes ? content : applySyntaxHighlight(content)
        const thinkingPrefix = `${syntaxColors.comment}▸ ${syntaxColors.reset}`
        return thinkingPrefix + colorizeBlock(highlightedThinking, syntaxColors.comment)

      case 'tool':
        // Tool output without formatting (raw content)
        const toolPrefix = `${syntaxColors.path}▸ TOOL${syntaxColors.reset}\n`
        return toolPrefix + content

      case 'system':
        // Light gray for system messages with unicode symbol
        const highlightedSystem = hasAnsiCodes ? content : applySyntaxHighlight(content)
        const systemPrefix = `${syntaxColors.reset}▸ ${syntaxColors.reset}`
        return systemPrefix + highlightedSystem

      case 'user':
        // Bright cyan for user messages with unicode symbol
        const highlightedUser = hasAnsiCodes ? content : applySyntaxHighlight(content)
        const userPrefix = `${syntaxColors.title}▸ USER${syntaxColors.reset}\n`
        return userPrefix + colorizeBlock(highlightedUser, syntaxColors.title)

      case 'vm':
        // Bright blue for VM messages with unicode symbol
        const highlightedVm = hasAnsiCodes ? content : applySyntaxHighlight(content)
        const vmPrefix = `${syntaxColors.title}▸ VM${syntaxColors.reset}\n`
        return vmPrefix + highlightedVm

      case 'agent':
        // Magenta for agent messages with unicode symbol
        const highlightedAgent = hasAnsiCodes ? content : applySyntaxHighlight(content)
        const agentPrefix = `${syntaxColors.keyword}▸ AGENT${syntaxColors.reset}\n`
        return agentPrefix + colorizeBlock(highlightedAgent, syntaxColors.keyword)

      case 'ai':
      default:
        // AI content with syntax highlighting applied
        const highlightedAi = hasAnsiCodes ? content : applySyntaxHighlight(content)
        return highlightedAi
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
  getStreamttyInstance(): Streamtty | null {
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

      case 'tool_call':
        const toolArgs = JSON.stringify(event.toolArgs, null, 2)
        return `\n🔧 ${chalk.bold(event.toolName)}\n${chalk.gray('```json')}\n${toolArgs}\n${chalk.gray('```')}\n\n`

      case 'tool_result':
        const resultPreview = typeof event.toolResult === 'string'
          ? event.toolResult
          : JSON.stringify(event.toolResult, null, 2)
        const truncated = resultPreview.length > 200
          ? resultPreview.slice(0, 200) + '...'
          : resultPreview
        return `\n✓ ${chalk.bold('Result')}: ${truncated}\n\n`

      case 'thinking':
        return `\n${chalk.gray('> 💭')} ${chalk.italic(event.content)}\n\n`

      case 'reasoning':
        return `\n${chalk.gray('> ⚡')} ${chalk.italic(event.content)}\n\n`

      case 'status':
      case 'step':
        const statusIcon = this.getStatusIcon(event.metadata?.status)
        return `\n${statusIcon} ${chalk.bold(event.content)}\n\n`

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
      'pending': '⏳',
      'running': '🔄',
      'completed': '✅',
      'failed': '❌',
      'info': 'ℹ️',
    }
    return iconMap[status || 'info'] || 'ℹ️'
  }

  /**
   * Handle an AI SDK stream with full event processing
   */
  async *handleAIStream(
    stream: AsyncGenerator<StreamEvent>
  ): AsyncGenerator<string> {
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
        return StreamProtocol.createStatus(chunk, 'pending')

      default:
        return null
    }
  }

  /**
   * Enable specific enhanced feature
   */
  enableEnhancedFeature(feature: keyof EnhancedFeaturesConfig): void {
    if (!this.options.enhancedFeatures) {
      this.options.enhancedFeatures = {}
    }
    this.options.enhancedFeatures[feature] = true

    // Re-initialize if using blessed mode
    if (this.useBlessedMode && process.stdout.isTTY) {
      this.destroy()
      this.initialize()
    }
  }

  /**
   * Disable specific enhanced feature
   */
  disableEnhancedFeature(feature: keyof EnhancedFeaturesConfig): void {
    if (!this.options.enhancedFeatures) {
      return
    }
    this.options.enhancedFeatures[feature] = false

    // Re-initialize if using blessed mode
    if (this.useBlessedMode && process.stdout.isTTY) {
      this.destroy()
      this.initialize()
    }
  }

  /**
   * Set theme
   */
  setTheme(theme: 'light' | 'dark' | 'auto'): void {
    this.options.theme = theme

    // Re-initialize if using blessed mode
    if (this.useBlessedMode && process.stdout.isTTY) {
      this.destroy()
      this.initialize()
    }
  }

  /**
   * Configure interactive controls
   */
  setControls(controls: boolean | TTYControlsConfig): void {
    this.options.controls = controls

    // Re-initialize if using blessed mode
    if (this.useBlessedMode && process.stdout.isTTY) {
      this.destroy()
      this.initialize()
    }
  }

  /**
   * Update security configuration
   */
  setSecurityConfig(security: Partial<SecurityConfig>): void {
    this.options.security = {
      ...this.options.security,
      ...security
    }

    // Re-initialize if using blessed mode
    if (this.useBlessedMode && process.stdout.isTTY) {
      this.destroy()
      this.initialize()
    }
  }

  /**
   * Check if enhanced features are enabled
   */
  areEnhancedFeaturesEnabled(): boolean {
    return this.isBlessedModeActive() &&
      Object.values(this.options.enhancedFeatures || {}).some(v => v === true)
  }

  /**
   * Get current enhanced features configuration
   */
  getEnhancedFeaturesConfig(): EnhancedFeaturesConfig | undefined {
    return this.options.enhancedFeatures
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

// Singleton instance - centralized rendering service with enhanced features enabled
export const streamttyService = new StreamttyService({
  parseIncompleteMarkdown: true,
  syntaxHighlight: true,
  autoScroll: true,
  maxWidth: 120,
  gfm: true,
  useBlessedMode: false, // Default to stdout mode for broader compatibility
  // Enhanced features are auto-enabled when blessed mode is used
  enhancedFeatures: {
    math: true,
    mermaid: true,
    shiki: true,
    security: true,
    interactiveControls: false,
    advancedTables: true,
  },
  theme: 'dark',
  security: {
    enabled: true,
    stripDangerousAnsi: true,
    allowedLinkPrefixes: ['http://', 'https://'],
    allowedImagePrefixes: ['http://', 'https://'],
  },
  shikiLanguages: [
    'typescript', 'javascript', 'python', 'bash', 'json',
    'markdown', 'yaml', 'sql', 'html', 'css', 'go', 'rust'
  ],
})

// Re-export AI SDK types for convenience
export type { StreamEvent, StreamEventType } from 'streamtty'
export { StreamProtocol } from 'streamtty'

