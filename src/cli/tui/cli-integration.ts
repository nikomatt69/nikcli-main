/**
 * CLI Integration
 * Integrates TUI with the main NikCLI application
 */

import { TUIApplication } from './TUIApplication'
import { startTUI, isTUISupported, getTUICapabilities } from './index'

export interface CLIOptions {
  tui?: boolean
  theme?: string
  layout?: 'single' | 'dual' | 'triple' | 'quad'
  noMouse?: boolean
  noKeyboard?: boolean
}

/**
 * Check if TUI should be used based on options and environment
 */
export function shouldUseTUI(options: CLIOptions): boolean {
  // Explicit flag
  if (options.tui) {
    // Check if supported
    if (!isTUISupported()) {
      console.warn('⚠️  TUI not supported in this environment, falling back to stdout mode')
      return false
    }
    return true
  }

  // Auto-detect if in interactive terminal
  return isTUISupported() && process.stdin.isTTY
}

/**
 * Start TUI based on CLI options
 */
export async function startTUIFromCLI(options: CLIOptions): Promise<void> {
  const shouldUse = shouldUseTUI(options)

  if (!shouldUse) {
    console.log('Using stdout mode (non-TTY environment)')
    return
  }

  console.log('🚀 Starting NikCLI TUI...')
  console.log('Press ESC or q to exit\n')

  try {
    // Create TUI application
    const app = new TUIApplication({
      title: 'NikCLI',
      theme: options.theme || 'default',
      defaultLayout: options.layout || 'dual',
      enableMouse: !options.noMouse,
      enableKeyboard: !options.noKeyboard
    })

    // Initialize
    await app.initialize()

    // Show capabilities
    const capabilities = getTUICapabilities()
    console.log('TUI Capabilities:')
    console.log(`  Mouse: ${capabilities.mouse ? '✓' : '✗'}`)
    console.log(`  Keyboard: ${capabilities.keyboard ? '✓' : '✗'}`)
    console.log(`  Colors: ${capabilities.colors ? '✓' : '✗'}`)
    console.log(`  Unicode: ${capabilities.unicode ? '✓' : '✗'}`)
    console.log('')

    // Start the TUI
    await app.start()

  } catch (error) {
    console.error('\n❌ Failed to start TUI:', error)
    console.log('\nFalling back to stdout mode...')

    // In case of error, we could fallback to the original stdout mode
    // This would require integration with the existing nik-cli.ts
    throw error
  }
}

/**
 * Add TUI options to CLI parser
 */
export function addTUIOptions(parser: any): void {
  parser.option('--tui', 'Enable TUI mode', {
    default: false,
    type: 'boolean'
  })

  parser.option('--theme <theme>', 'TUI theme', {
    default: 'default',
    choices: ['default', 'dracula', 'monokai', 'nord', 'solarized', 'cyberpunk']
  })

  parser.option('--layout <layout>', 'Default layout', {
    default: 'dual',
    choices: ['single', 'dual', 'triple', 'quad']
  })

  parser.option('--no-mouse', 'Disable mouse support', {
    default: false,
    type: 'boolean'
  })

  parser.option('--no-keyboard', 'Disable keyboard support', {
    default: false,
    type: 'boolean'
  })
}

/**
 * Handle TUI mode selection
 */
export async function handleTUIMode(options: CLIOptions): Promise<'tui' | 'stdout' | 'error'> {
  try {
    if (shouldUseTUI(options)) {
      await startTUIFromCLI(options)
      return 'tui'
    } else {
      return 'stdout'
    }
  } catch (error) {
    console.error('TUI error:', error)
    return 'error'
  }
}

/**
 * Get TUI help text
 */
export function getTUIHelp(): string {
  return `
TUI Options:
  --tui              Enable TUI mode
  --theme <theme>    Set TUI theme (default, dracula, monokai, nord, solarized, cyberpunk)
  --layout <layout>  Set default layout (single, dual, triple, quad)
  --no-mouse         Disable mouse support
  --no-keyboard      Disable keyboard support

TUI Features:
  • Modern terminal UI with OpenTUI
  • Panel-based layout system
  • Real-time output streaming
  • Interactive chat with AI
  • Todo management
  • File diff viewing
  • Keyboard and mouse navigation
  • Multiple themes

Examples:
  nikcli --tui                           # Start in TUI mode
  nikcli --tui --theme dracula          # Start with Dracula theme
  nikcli --tui --layout single          # Start with single panel layout
  nikcli --tui --no-mouse               # Start without mouse support
`
}

/**
 * Integration hook for main CLI
 * This function should be called from the main CLI entry point
 */
export async function integrateWithCLI(argv: string[]): Promise<void> {
  // This is a placeholder for actual CLI integration
  // In a real implementation, this would:
  // 1. Parse command line arguments
  // 2. Check for --tui flag
  // 3. Start TUI if requested
  // 4. Otherwise continue with normal CLI mode

  console.log('CLI Integration Placeholder')
  console.log('To integrate with main CLI, add TUI options to your argument parser')
  console.log('and call handleTUIMode() based on the --tui flag')
}
