import { execSync } from 'child_process'

export interface TerminalCapabilities {
  /** Terminal supports inline images (iTerm2, Kitty, WezTerm) */
  supportsInlineImages: boolean
  /** Specific inline image protocol supported */
  imageProtocol?: 'iterm2' | 'kitty' | 'sixel' | 'ansi-fallback'
  /** Terminal name/type */
  terminalType: string
  /** mermaid-ascii binary is available */
  hasMermaidAsciiBinary: boolean
  /** Terminal width in columns */
  width: number
  /** Terminal height in rows */
  height: number
}

/**
 * Detect terminal capabilities for rendering Mermaid diagrams
 */
export class TerminalCapabilityDetector {
  private static cachedCapabilities: TerminalCapabilities | null = null

  /**
   * Get terminal capabilities (cached)
   */
  static getCapabilities(): TerminalCapabilities {
    if (TerminalCapabilityDetector.cachedCapabilities) {
      return TerminalCapabilityDetector.cachedCapabilities
    }

    TerminalCapabilityDetector.cachedCapabilities = TerminalCapabilityDetector.detectCapabilities()
    return TerminalCapabilityDetector.cachedCapabilities
  }

  /**
   * Force re-detection of capabilities (useful if terminal changes)
   */
  static refresh(): TerminalCapabilities {
    TerminalCapabilityDetector.cachedCapabilities = null
    return TerminalCapabilityDetector.getCapabilities()
  }

  /**
   * Detect all terminal capabilities
   */
  private static detectCapabilities(): TerminalCapabilities {
    const capabilities: TerminalCapabilities = {
      supportsInlineImages: false,
      terminalType: TerminalCapabilityDetector.detectTerminalType(),
      hasMermaidAsciiBinary: TerminalCapabilityDetector.checkMermaidAsciiBinary(),
      width: process.stdout.columns || 80,
      height: process.stdout.rows || 24,
    }

    // Detect inline image support
    const imageSupport = TerminalCapabilityDetector.detectImageSupport()
    capabilities.supportsInlineImages = imageSupport.supported
    capabilities.imageProtocol = imageSupport.protocol

    return capabilities
  }

  /**
   * Detect terminal type from environment variables
   */
  private static detectTerminalType(): string {
    // iTerm2
    if (process.env.TERM_PROGRAM === 'iTerm.app') {
      return 'iTerm2'
    }

    // Kitty
    if (process.env.TERM === 'xterm-kitty' || process.env.KITTY_WINDOW_ID) {
      return 'Kitty'
    }

    // WezTerm
    if (process.env.TERM_PROGRAM === 'WezTerm') {
      return 'WezTerm'
    }

    // VS Code integrated terminal
    if (process.env.TERM_PROGRAM === 'vscode') {
      return 'VSCode'
    }

    // Hyper
    if (process.env.TERM_PROGRAM === 'Hyper') {
      return 'Hyper'
    }

    // Generic fallback
    return process.env.TERM || 'unknown'
  }

  /**
   * Detect if terminal supports inline images and which protocol
   */
  private static detectImageSupport(): {
    supported: boolean
    protocol?: 'iterm2' | 'kitty' | 'sixel' | 'ansi-fallback'
  } {
    const termType = TerminalCapabilityDetector.detectTerminalType()

    // iTerm2 supports inline images protocol
    if (termType === 'iTerm2') {
      return { supported: true, protocol: 'iterm2' }
    }

    // Kitty supports its own graphics protocol
    if (termType === 'Kitty') {
      return { supported: true, protocol: 'kitty' }
    }

    // WezTerm supports iTerm2 protocol
    if (termType === 'WezTerm') {
      return { supported: true, protocol: 'iterm2' }
    }

    // Check if terminal supports sixel
    if (TerminalCapabilityDetector.checkSixelSupport()) {
      return { supported: true, protocol: 'sixel' }
    }

    // Fallback to ANSI block characters (terminal-image does this automatically)
    return { supported: true, protocol: 'ansi-fallback' }
  }

  /**
   * Check if terminal supports sixel graphics
   */
  private static checkSixelSupport(): boolean {
    // Check TERM variable for sixel support
    const term = process.env.TERM || ''
    if (term.includes('sixel')) {
      return true
    }

    // mlterm and xterm with sixel support
    if (term.includes('mlterm') || term.includes('yaft')) {
      return true
    }

    return false
  }

  /**
   * Check if mermaid-ascii binary is available in PATH
   */
  private static checkMermaidAsciiBinary(): boolean {
    try {
      // Try to find mermaid-ascii in PATH
      execSync('which mermaid-ascii', {
        encoding: 'utf8',
        stdio: 'pipe',
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Get recommended rendering strategy based on capabilities
   */
  static getRecommendedStrategy(): 'inline-image' | 'ascii-art' | 'fallback' {
    const caps = TerminalCapabilityDetector.getCapabilities()

    // Prefer inline images for best quality
    if (caps.supportsInlineImages && caps.imageProtocol !== 'ansi-fallback') {
      return 'inline-image'
    }

    // Use ASCII art if binary available
    if (caps.hasMermaidAsciiBinary) {
      return 'ascii-art'
    }

    // Fallback to code display with link
    return 'fallback'
  }

  /**
   * Check if a specific capability is available
   */
  static hasCapability(capability: keyof TerminalCapabilities): boolean {
    const caps = TerminalCapabilityDetector.getCapabilities()
    return Boolean(caps[capability])
  }

  /**
   * Get a human-readable description of terminal capabilities
   */
  static getCapabilitiesDescription(): string {
    const caps = TerminalCapabilityDetector.getCapabilities()
    const lines: string[] = []

    lines.push(`Terminal: ${caps.terminalType}`)
    lines.push(`Dimensions: ${caps.width}x${caps.height}`)
    lines.push(`Inline Images: ${caps.supportsInlineImages ? '✓' : '✗'}`)

    if (caps.supportsInlineImages && caps.imageProtocol) {
      lines.push(`Image Protocol: ${caps.imageProtocol}`)
    }

    lines.push(`Mermaid ASCII Binary: ${caps.hasMermaidAsciiBinary ? '✓ available' : '✗ not found'}`)
    lines.push(`Recommended Strategy: ${TerminalCapabilityDetector.getRecommendedStrategy()}`)

    return lines.join('\n')
  }
}

/**
 * Convenience export for getting capabilities
 */
export const getTerminalCapabilities = () => TerminalCapabilityDetector.getCapabilities()

/**
 * Convenience export for getting recommended strategy
 */
export const getRecommendedRenderingStrategy = () => TerminalCapabilityDetector.getRecommendedStrategy()
