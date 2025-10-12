import { Streamtty } from 'streamtty'
import { TerminalOutputManager, terminalOutputManager } from './terminal-output-manager'

export interface StreamttyOptions {
  parseIncompleteMarkdown?: boolean
  syntaxHighlight?: boolean
  autoScroll?: boolean
  maxWidth?: number
  gfm?: boolean
  useBlessedMode?: boolean
}

/**
 * Internal adapter for StreamttyService
 * Handles low-level streamtty instance management and fallback logic
 */
export class StreamttyAdapter {
  private streamtty: Streamtty | null = null
  private isInitialized = false
  private useBlessedMode = false

  constructor(private options: StreamttyOptions = {}) {
    this.useBlessedMode = options.useBlessedMode ?? false
    this.initialize()
  }

  private async initialize(): Promise<void> {
    try {
      // Only create blessed instance if blessed mode requested and TTY available
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
        // Non-blessed mode - will use stdout
        this.isInitialized = true
      }
    } catch (error) {
      console.warn('Failed to initialize Streamtty, falling back to basic rendering:', error)
      this.isInitialized = false
    }
  }

  /**
   * Render a streaming markdown content using Streamtty
   * Supports both blessed and non-blessed modes
   */
  async renderStream(
    stream: AsyncGenerator<string, void, unknown>,
    options: {
      isCancelled?: () => boolean
      chunkType?: string
    } = {}
  ): Promise<string> {
    const isCancelled = options.isCancelled || (() => false)

    // If blessed mode is active with valid instance
    if (this.useBlessedMode && this.isInitialized && this.streamtty) {
      try {
        let accumulated = ''

        for await (const chunk of stream) {
          if (isCancelled()) break

          accumulated += chunk
          this.streamtty.stream(chunk)
        }

        return accumulated
      } catch (error) {
        console.warn('Streamtty blessed rendering failed, falling back to stdout:', error)
        return this.fallbackRender(stream, isCancelled)
      }
    }

    // Non-blessed mode or not initialized - use stdout rendering
    return this.fallbackRender(stream, isCancelled)
  }

  /**
   * Render static markdown content using Streamtty
   */
  async renderStatic(content: string): Promise<void> {
    if (!this.isInitialized || !this.streamtty) {
      console.log(content)
      return
    }

    try {
      this.streamtty.setContent(content)
    } catch (error) {
      console.warn('Streamtty static rendering failed, falling back to basic output:', error)
      console.log(content)
    }
  }

  /**
   * Clear the Streamtty display
   */
  clear(): void {
    if (this.streamtty) {
      this.streamtty.clear()
    }
  }

  /**
   * Fallback rendering when Streamtty is not available
   */
  private async fallbackRender(
    stream: AsyncGenerator<string, void, unknown>,
    isCancelled: () => boolean
  ): Promise<string> {
    let accumulated = ''
    let printedLines = 0
    const currentOutputId: string | null = null

    for await (const chunk of stream) {
      if (isCancelled()) break

      accumulated += chunk

      // Track chunk output
      const chunkLines = TerminalOutputManager.calculateLines(chunk)
      const outputId = terminalOutputManager.reserveSpace('StreamChunk', chunkLines)
      process.stdout.write(chunk)
      terminalOutputManager.confirmOutput(outputId, 'StreamChunk', chunkLines, {
        persistent: false,
        expiryMs: 30000,
      })

      printedLines += chunkLines
    }

    return accumulated
  }

  /**
   * Check if Streamtty is available and initialized
   */
  isAvailable(): boolean {
    return this.isInitialized
  }

  /**
   * Check if blessed mode is active
   */
  isBlessedMode(): boolean {
    return this.useBlessedMode && this.streamtty !== null
  }

  /**
   * Get Streamtty instance (for advanced usage)
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
      } catch {
        // Ignore cleanup errors
      }
      this.streamtty = null
    }
  }
}

/**
 * @deprecated Use streamttyService from services/streamtty-service.ts instead
 * Convenience function to render streaming markdown - kept for backward compatibility
 */
export async function renderMarkdownStream(
  stream: AsyncGenerator<string, void, unknown>,
  options: {
    isCancelled?: () => boolean
    streamttyOptions?: StreamttyOptions
  } = {}
): Promise<string> {
  // Import streamttyService dynamically to avoid circular deps
  const { streamttyService } = await import('../services/streamtty-service')

  let accumulated = ''
  for await (const chunk of stream) {
    if (options.isCancelled?.()) break
    accumulated += chunk
    await streamttyService.streamChunk(chunk, 'ai')
  }

  return accumulated
}

/**
 * @deprecated Use streamttyService from services/streamtty-service.ts instead
 * Convenience function to render static markdown - kept for backward compatibility
 */
export async function renderMarkdownStatic(
  content: string,
  options: {
    streamttyOptions?: StreamttyOptions
  } = {}
): Promise<void> {
  const { streamttyService } = await import('../services/streamtty-service')
  await streamttyService.renderBlock(content, 'ai')
}

/**
 * @deprecated Use streamttyService from services/streamtty-service.ts instead
 */
export function getStreamttyAdapter(options?: StreamttyOptions): StreamttyAdapter {
  console.warn('getStreamttyAdapter is deprecated, use streamttyService instead')
  return new StreamttyAdapter(options)
}
