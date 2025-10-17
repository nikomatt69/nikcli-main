import { Streamtty } from 'streamtty'
import { terminalOutputManager, TerminalOutputManager } from './terminal-output-manager'

import type { EnhancedFeaturesConfig, MermaidTTYConfig, MathRenderConfig, SecurityConfig } from 'streamtty'

export interface StreamttyOptions {
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

/**
 * Internal adapter for StreamttyService
 * Handles low-level streamtty instance management and fallback logic
 * Simplified visual-only rendering without interactive controls
 */
export class StreamttyAdapter {
  private streamtty: Streamtty | null = null
  private isInitialized = false
  private useBlessedMode = false

  constructor(private options: StreamttyOptions = {}) {
    this.useBlessedMode = options.useBlessedMode ?? false
    
    // Auto-enable enhanced visual features if not explicitly configured
    if (!this.options.enhancedFeatures && this.useBlessedMode) {
      this.options.enhancedFeatures = {
        math: true,
        mermaid: true, // With mermaid-ascii integration
        shiki: true,
        security: true,
        interactiveControls: false, // Always disabled - visual-only rendering
        advancedTables: true, // With tty-table and asciichart integration
      }
    }
    
    // Auto-configure security if not set
    if (!this.options.security && this.useBlessedMode) {
      this.options.security = {
        enabled: true,
        stripDangerousAnsi: true,
        allowedLinkPrefixes: ['http://', 'https://'],
        allowedImagePrefixes: ['http://', 'https://'],
      }
    }
    
    // Auto-configure default languages for Shiki if not set
    if (!this.options.shikiLanguages && this.useBlessedMode && this.options.enhancedFeatures?.shiki !== false) {
      this.options.shikiLanguages = [
        'typescript', 'javascript', 'python', 'bash', 'json',
        'markdown', 'yaml', 'sql', 'html', 'css'
      ]
    }
    
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
          // Pass through enhanced visual features (no interactive controls)
          enhancedFeatures: this.options.enhancedFeatures,
          theme: this.options.theme,
          mermaidConfig: this.options.mermaidConfig,
          mathConfig: this.options.mathConfig,
          security: this.options.security,
          shikiLanguages: this.options.shikiLanguages,
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
   * Render streaming markdown content using simplified Streamtty
   * Visual-only rendering without interactive controls
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
    let currentOutputId: string | null = null

    for await (const chunk of stream) {
      if (isCancelled()) break

      accumulated += chunk

      // Track chunk output
      const chunkLines = TerminalOutputManager.calculateLines(chunk)
      const outputId = terminalOutputManager.reserveSpace('StreamChunk', chunkLines)
      process.stdout.write(chunk)
      terminalOutputManager.confirmOutput(outputId, 'StreamChunk', chunkLines, {
        persistent: false,
        expiryMs: 30000
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
   * Check if enhanced features are enabled
   */
  areEnhancedFeaturesEnabled(): boolean {
    return this.isAvailable() && 
           this.useBlessedMode && 
           Object.values(this.options.enhancedFeatures || {}).some(v => v === true)
  }

  /**
   * Get current enhanced features configuration
   */
  getEnhancedFeaturesConfig(): EnhancedFeaturesConfig | undefined {
    return this.options.enhancedFeatures
  }

  /**
   * Enable specific enhanced feature
   */
  enableEnhancedFeature(feature: keyof EnhancedFeaturesConfig): void {
    if (!this.options.enhancedFeatures) {
      this.options.enhancedFeatures = {}
    }
    this.options.enhancedFeatures[feature] = true
  }

  /**
   * Disable specific enhanced feature
   */
  disableEnhancedFeature(feature: keyof EnhancedFeaturesConfig): void {
    if (!this.options.enhancedFeatures) {
      return
    }
    this.options.enhancedFeatures[feature] = false
  }

  /**
   * Set theme (light/dark/auto)
   */
  setTheme(theme: 'light' | 'dark' | 'auto'): void {
    this.options.theme = theme
  }

  /**
   * Update security configuration
   */
  updateSecurityConfig(security: Partial<SecurityConfig>): void {
    this.options.security = {
      ...this.options.security,
      ...security
    }
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
 * Legacy function - use the simplified streamttyService for better performance
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