import chalk from 'chalk'
import {
  applySyntaxHighlight,
  colorizeBlock,
  syntaxColors,
  StreamEvent,
  StreamProtocol,
  type EnhancedFeaturesConfig,
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

  // Enhanced features (visual-only, no interactive controls)
  enhancedFeatures?: EnhancedFeaturesConfig
  theme?: 'light' | 'dark' | 'auto'
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
  private isInitialized = false
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

  constructor(private options: StreamttyServiceOptions = {}) {
    this.initialize()
  }

  private initialize(): void {
    try {
      // Always use inline mode with enhanced features - no blessed mode
      this.isInitialized = true
      this.stats.fallbackUsed = false // Enhanced inline mode is not fallback
    } catch (error) {
      console.warn('Failed to initialize enhanced inline mode:', error)
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
      !this.stats.fallbackUsed &&
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

    // Apply enhanced features inline processing
    const enhancedChunk = await this.applyEnhancedFeaturesInline(processedChunk)
    this.streamBuffer += enhancedChunk

    // Always use enhanced inline mode - direct stdout with enhanced formatting
    const chunkLines = TerminalOutputManager.calculateLines(enhancedChunk)
    const outputId = terminalOutputManager.reserveSpace('StreamttyChunk', chunkLines)
    process.stdout.write(enhancedChunk)
    terminalOutputManager.confirmOutput(outputId, 'StreamttyChunk', chunkLines, {
      persistent: false,
      expiryMs: 30000,
    })
  }

  /**
   * Apply enhanced features inline processing for tables, mermaid, etc.
   */
  private async applyEnhancedFeaturesInline(content: string): Promise<string> {
    if (!content || !this.options.enhancedFeatures) return content

    let processedContent = content

    // Process tables if advanced tables are enabled
    if (this.options.enhancedFeatures.advancedTables) {
      processedContent = await this.processTablesInline(processedContent)
    }

    // Process mermaid diagrams if mermaid is enabled
    if (this.options.enhancedFeatures.mermaid) {
      processedContent = await this.processMermaidInline(processedContent)
    }

    return processedContent
  }

  /**
   * Process markdown tables and render them with enhanced table renderer
   */
  private async processTablesInline(content: string): Promise<string> {
    // Import the enhanced table renderer
    const { parseMarkdownTable, EnhancedTableRenderer } = await import('../../../streamtty/src/utils/enhanced-table-renderer')

    // Look for markdown table patterns
    const tableRegex = /(\|[^|\n]+\|(?:\n\|[^|\n]*\|)*)/g

    return content.replace(tableRegex, (match) => {
      try {
        const tableData = parseMarkdownTable(match)
        if (tableData && tableData.headers.length > 0) {
          const renderedTable = EnhancedTableRenderer.renderTable(tableData, {
            borderStyle: 'solid',
            compact: false,
            width: this.options.maxWidth || 80
          })
          return '\n' + renderedTable + '\n'
        }
      } catch (error) {
        console.warn('Inline table processing failed:', error)
      }
      return match
    })
  }

  /**
   * Process mermaid diagrams and render them with mermaid-ascii
   */
  private async processMermaidInline(content: string): Promise<string> {
    // Import mermaid-ascii wrapper
    const { convertMermaidToASCII } = await import('../../../streamtty/src/utils/mermaid-ascii')

    // Look for mermaid code blocks
    const mermaidRegex = /```mermaid\s*\n([\s\S]*?)\n```/gi

    let processedContent = content
    const matches = Array.from(content.matchAll(mermaidRegex))

    for (const match of matches) {
      try {
        const mermaidCode = match[1].trim()
        if (mermaidCode) {
          const asciiDiagram = await convertMermaidToASCII(mermaidCode, {
            paddingX: 3,
            paddingY: 2,
            borderPadding: 1
          })
          processedContent = processedContent.replace(match[0], '\n' + asciiDiagram + '\n')
        }
      } catch (error) {
        console.warn('Inline mermaid processing failed:', error)
      }
    }

    return processedContent
  }

  /**
   * Render a complete block of content with formatting
   */
  async renderBlock(content: string, type: ChunkType = 'system'): Promise<void> {
    if (!content) return

    this.stats.totalBlocks++
    this.stats.lastRenderTime = Date.now()

    // Apply enhanced features inline and format for stdout
    const enhancedContent = await this.applyEnhancedFeaturesInline(content)
    const formattedContent = this.formatContentByType(enhancedContent, type)
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
    console.clear() // Simple clear for inline mode
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
   * Check if enhanced inline mode is active
   */
  isEnhancedInlineModeActive(): boolean {
    return this.isInitialized && !this.stats.fallbackUsed
  }

  /**
   * Check if blessed mode is active (always false in new architecture)
   */
  isBlessedModeActive(): boolean {
    return false // Always false - we use enhanced inline mode now
  }

  /**
   * Get streamtty instance for advanced usage (always null in new architecture)
   */
  getStreamttyInstance(): null {
    return null // Always null - we use enhanced inline mode now
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

    // Enhanced inline mode: format and output to stdout with enhanced features
    const enhancedEvent = await this.applyEnhancedFeaturesInline(this.formatAISDKEventFallback(event))
    if (enhancedEvent) {
      const lines = TerminalOutputManager.calculateLines(enhancedEvent)
      const outputId = terminalOutputManager.reserveSpace('AISDKEvent', lines)
      process.stdout.write(enhancedEvent)
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
    // Enhanced inline mode - features are applied dynamically
  }

  /**
   * Disable specific enhanced feature
   */
  disableEnhancedFeature(feature: keyof EnhancedFeaturesConfig): void {
    if (!this.options.enhancedFeatures) {
      return
    }
    this.options.enhancedFeatures[feature] = false
    // Enhanced inline mode - features are applied dynamically
  }

  /**
   * Set theme
   */
  setTheme(theme: 'light' | 'dark' | 'auto'): void {
    this.options.theme = theme
    // Enhanced inline mode - theme changes are applied dynamically
  }

  /**
   * Update security configuration
   */
  setSecurityConfig(security: Partial<SecurityConfig>): void {
    this.options.security = {
      ...this.options.security,
      ...security
    }
    // Enhanced inline mode - security changes are applied dynamically
  }

  /**
   * Check if enhanced features are enabled
   */
  areEnhancedFeaturesEnabled(): boolean {
    return this.isEnhancedInlineModeActive() &&
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
    // Cleanup for inline mode
    this.streamBuffer = ''
    this.isInitialized = false
  }
}

// Singleton instance - simplified visual-only rendering service
export const streamttyService = new StreamttyService({
  parseIncompleteMarkdown: true,
  syntaxHighlight: true,
  autoScroll: true,
  maxWidth: 80,
  gfm: true,

  useBlessedMode: false, // Enable blessed mode for enhanced features (tables, mermaid, etc.)
  // Enhanced visual features (no interactive controls)
  enhancedFeatures: {
    math: true,
    mermaid: true, // With mermaid-ascii integration
    shiki: true,
    security: true,
    interactiveControls: false, // Pure visual rendering only
    advancedTables: true, // With tty-table and asciichart integration
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

