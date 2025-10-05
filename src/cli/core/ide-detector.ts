/**
 * IDE Detection Module
 * Detects the current IDE/editor environment and capabilities
 */

export interface IDECapabilities {
  name: 'vscode' | 'cursor' | 'jetbrains' | 'vim' | 'terminal' | 'unknown'
  hasGUI: boolean
  hasFileTree: boolean
  hasTerminalIntegration: boolean
  hasDebugger: boolean
  hasExtensionSupport: boolean
  version?: string
}

export class IDEDetector {
  private static cachedCapabilities: IDECapabilities | null = null

  /**
   * Detect current IDE/editor environment
   */
  static detect(): IDECapabilities {
    if (IDEDetector.cachedCapabilities) {
      return IDEDetector.cachedCapabilities
    }

    // VS Code / Cursor detection
    if (process.env.TERM_PROGRAM === 'vscode' || process.env.VSCODE_INJECTION) {
      const isCursor = process.env.VSCODE_GIT_ASKPASS_MAIN?.includes('Cursor.app')

      IDEDetector.cachedCapabilities = {
        name: isCursor ? 'cursor' : 'vscode',
        hasGUI: true,
        hasFileTree: true,
        hasTerminalIntegration: true,
        hasDebugger: true,
        hasExtensionSupport: true,
        version: process.env.TERM_PROGRAM_VERSION,
      }

      return IDEDetector.cachedCapabilities
    }

    // JetBrains IDEs detection (IntelliJ, WebStorm, etc.)
    if (process.env.TERMINAL_EMULATOR?.includes('JetBrains') || process.env.TERM_PROGRAM?.includes('jetbrains')) {
      IDEDetector.cachedCapabilities = {
        name: 'jetbrains',
        hasGUI: true,
        hasFileTree: true,
        hasTerminalIntegration: true,
        hasDebugger: true,
        hasExtensionSupport: true,
      }

      return IDEDetector.cachedCapabilities
    }

    // Vim/Neovim detection
    if (process.env.VIM || process.env.NVIM) {
      IDEDetector.cachedCapabilities = {
        name: 'vim',
        hasGUI: false,
        hasFileTree: false,
        hasTerminalIntegration: true,
        hasDebugger: false,
        hasExtensionSupport: true,
      }

      return IDEDetector.cachedCapabilities
    }

    // Check if running in a terminal with GUI capabilities
    const hasTTY = process.stdout.isTTY

    IDEDetector.cachedCapabilities = {
      name: 'terminal',
      hasGUI: false,
      hasFileTree: false,
      hasTerminalIntegration: hasTTY,
      hasDebugger: false,
      hasExtensionSupport: false,
    }

    return IDEDetector.cachedCapabilities
  }

  /**
   * Check if running in VS Code
   */
  static isVSCode(): boolean {
    const caps = IDEDetector.detect()
    return caps.name === 'vscode' || caps.name === 'cursor'
  }

  /**
   * Check if GUI features are available
   */
  static hasGUI(): boolean {
    return IDEDetector.detect().hasGUI
  }

  /**
   * Check if extension support is available
   */
  static hasExtensionSupport(): boolean {
    return IDEDetector.detect().hasExtensionSupport
  }

  /**
   * Get VS Code extension context if available
   */
  static getVSCodeExtensionContext(): {
    available: boolean
    canUseWebviews: boolean
    canUseTreeViews: boolean
  } {
    const isVSCode = IDEDetector.isVSCode()

    return {
      available: isVSCode,
      canUseWebviews: isVSCode,
      canUseTreeViews: isVSCode,
    }
  }

  /**
   * Get IDE-specific formatting preferences
   */
  static getFormattingPreferences(): {
    supportsMarkdown: boolean
    supportsAnsiColors: boolean
    supportsInteractiveUI: boolean
    preferredWidth: number
  } {
    const caps = IDEDetector.detect()

    if (caps.name === 'vscode' || caps.name === 'cursor') {
      return {
        supportsMarkdown: true,
        supportsAnsiColors: true,
        supportsInteractiveUI: true,
        preferredWidth: 120,
      }
    }

    if (caps.name === 'jetbrains') {
      return {
        supportsMarkdown: true,
        supportsAnsiColors: true,
        supportsInteractiveUI: true,
        preferredWidth: 120,
      }
    }

    if (caps.name === 'vim') {
      return {
        supportsMarkdown: false,
        supportsAnsiColors: true,
        supportsInteractiveUI: false,
        preferredWidth: 80,
      }
    }

    // Terminal fallback
    return {
      supportsMarkdown: false,
      supportsAnsiColors: process.stdout.isTTY,
      supportsInteractiveUI: process.stdout.isTTY,
      preferredWidth: process.stdout.columns || 80,
    }
  }

  /**
   * Get recommended UI mode based on IDE
   */
  static getRecommendedUIMode(): 'gui' | 'tui' | 'cli' {
    const caps = IDEDetector.detect()

    if (caps.hasGUI && caps.hasExtensionSupport) {
      return 'gui'
    }

    if (caps.hasTerminalIntegration) {
      return 'tui'
    }

    return 'cli'
  }

  /**
   * Clear cached detection (for testing)
   */
  static clearCache(): void {
    IDEDetector.cachedCapabilities = null
  }
}

/**
 * Singleton instance for convenience
 */
export const ideDetector = IDEDetector
