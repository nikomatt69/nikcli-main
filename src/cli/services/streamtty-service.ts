import chalk from 'chalk'
import { Streamtty } from '../../../streamtty/src'
import { terminalOutputManager, TerminalOutputManager } from '../ui/terminal-output-manager'

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

    this.streamBuffer += chunk

    // If blessed mode is active, use streamtty
    if (this.streamtty && this.isInitialized && !this.stats.fallbackUsed) {
      try {
        this.streamtty.stream(chunk)
        return
      } catch (error) {
        console.warn('Streamtty stream failed, falling back:', error)
        this.stats.fallbackUsed = true
      }
    }

    // Fallback: direct stdout with terminal output tracking
    const chunkLines = TerminalOutputManager.calculateLines(chunk)
    const outputId = terminalOutputManager.reserveSpace('StreamttyChunk', chunkLines)
    process.stdout.write(chunk)
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
   */
  private formatContentByType(content: string, type: ChunkType): string {
    switch (type) {
      case 'error':
        return `> ❌ **Error**\n> \n> ${content.replace(/\n/g, '\n> ')}`

      case 'thinking':
        return `> 💭 ${content.replace(/\n/g, '\n> ')}`

      case 'tool':
        return `\`\`\`tool\n${content}\n\`\`\``

      case 'system':
        return `> ℹ️ ${content.replace(/\n/g, '\n> ')}`

      case 'user':
        return `> 💬 ${content.replace(/\n/g, '\n> ')}`

      case 'vm':
        return `> 🐳 ${content.replace(/\n/g, '\n> ')}`

      case 'agent':
        return `> 🔌 ${content.replace(/\n/g, '\n> ')}`

      case 'ai':
      default:
        // AI content is already markdown, pass through
        return content
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

