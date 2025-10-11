import chalk from 'chalk'
import type { EnhancedSessionManager } from '../persistence/enhanced-session-manager'
import { getMobileUI } from '../ui/mobile-ui-adapter'

export interface MobileCommandAlias {
  alias: string
  command: string
  description: string
  mobileOnly?: boolean
  requiresArgs?: boolean
}

export interface MobileCommandResult {
  success: boolean
  output?: string
  originalCommand?: string
  error?: string
}

/**
 * Mobile Command Aliases System
 * Provides short, easy-to-type aliases for mobile keyboards
 */
export class MobileCommandHandler {
  private aliases: Map<string, MobileCommandAlias> = new Map()
  private isEnabled = false

  constructor(sessionManager: EnhancedSessionManager) {
    this.sessionManager = sessionManager
    this.isEnabled = sessionManager.isMobile()
    this.setupDefaultAliases()

    if (this.isEnabled) {
      console.log(chalk.blue('📱 Mobile command aliases enabled'))
    }
  }

  /**
   * Setup default mobile command aliases
   */
  private setupDefaultAliases(): void {
    const defaultAliases: MobileCommandAlias[] = [
      // Essential shortcuts
      { alias: '/q', command: '/quit', description: 'Quit application' },
      { alias: '/h', command: '/help', description: 'Show help' },
      { alias: '/s', command: '/status', description: 'Show system status' },
      { alias: '/c', command: '/clear', description: 'Clear screen' },

      // Model and configuration
      { alias: '/m', command: '/models', description: 'List AI models' },
      { alias: '/cfg', command: '/config', description: 'Show configuration' },
      { alias: '/set', command: '/model', description: 'Set AI model', requiresArgs: true },

      // File operations
      { alias: '/r', command: '/read', description: 'Read file', requiresArgs: true },
      { alias: '/w', command: '/write', description: 'Write file', requiresArgs: true },
      { alias: '/ls', command: '/list', description: 'List files' },
      { alias: '/find', command: '/search', description: 'Search files', requiresArgs: true },

      // Execution
      { alias: '/run', command: '/execute', description: 'Execute command', requiresArgs: true },
      { alias: '/cmd', command: '/run', description: 'Run shell command', requiresArgs: true },
      { alias: '/test', command: '/run test', description: 'Run tests' },
      { alias: '/build', command: '/run build', description: 'Build project' },

      // Session management
      { alias: '/save', command: '/session-save', description: 'Save current session' },
      { alias: '/load', command: '/session-load', description: 'Load session', requiresArgs: true },
      { alias: '/list-sessions', command: '/sessions', description: 'List all sessions' },

      // Agent operations
      { alias: '/a', command: '/agents', description: 'List agents' },
      { alias: '/ag', command: '/agent', description: 'Run agent', requiresArgs: true },

      // Planning and execution
      { alias: '/p', command: '/plan', description: 'Create execution plan', requiresArgs: true },
      { alias: '/todo', command: '/show-todos', description: 'Show current todos' },

      // Advanced features
      { alias: '/snap', command: '/snapshot', description: 'Create snapshot' },
      { alias: '/vm', command: '/virtual-machine', description: 'VM operations' },
      { alias: '/debug', command: '/debug-info', description: 'Show debug information' },

      // Mobile-specific commands
      {
        alias: '/mobile',
        command: '/mobile-mode',
        description: 'Toggle mobile optimizations',
        mobileOnly: true,
      },
      {
        alias: '/compact',
        command: '/compact-view',
        description: 'Toggle compact display',
        mobileOnly: true,
      },
      {
        alias: '/menu',
        command: '/mobile-menu',
        description: 'Show numbered selection menu',
        mobileOnly: true,
      },

      // Quick numbers for selection
      { alias: '1', command: '/select 1', description: 'Select option 1', mobileOnly: true },
      { alias: '2', command: '/select 2', description: 'Select option 2', mobileOnly: true },
      { alias: '3', command: '/select 3', description: 'Select option 3', mobileOnly: true },
      { alias: '4', command: '/select 4', description: 'Select option 4', mobileOnly: true },
      { alias: '5', command: '/select 5', description: 'Select option 5', mobileOnly: true },
    ]

    for (const alias of defaultAliases) {
      this.aliases.set(alias.alias, alias)
    }
  }

  /**
   * Process potential mobile command alias
   */
  processCommand(input: string): MobileCommandResult {
    if (!this.isEnabled) {
      return { success: false, error: 'Mobile commands not enabled' }
    }

    const trimmed = input.trim()

    // Check for exact alias match
    if (this.aliases.has(trimmed)) {
      const alias = this.aliases.get(trimmed) || {}
      return {
        success: true,
        originalCommand: alias.command,
        output: this.expandAlias(alias, ''),
      }
    }

    // Check for alias with arguments
    const parts = trimmed.split(' ')
    if (parts.length > 1 && this.aliases.has(parts[0])) {
      const alias = this.aliases.get(parts[0]) || {}
      const args = parts.slice(1).join(' ')

      return {
        success: true,
        originalCommand: `${alias.command} ${args}`,
        output: this.expandAlias(alias, args),
      }
    }

    // Check for numeric selection (mobile-specific)
    const mobileUI = getMobileUI()
    if (mobileUI) {
      const selection = mobileUI.parseNumberSelection(trimmed, 10)
      if (selection !== null) {
        return {
          success: true,
          originalCommand: `/select ${selection + 1}`,
          output: `/select ${selection + 1}`,
        }
      }
    }

    return { success: false, error: 'No matching mobile alias found' }
  }

  /**
   * Expand alias to full command
   */
  private expandAlias(alias: MobileCommandAlias, args: string): string {
    if (alias.requiresArgs && !args.trim()) {
      throw new Error(`Command '${alias.alias}' requires arguments`)
    }

    return args.trim() ? `${alias.command} ${args}` : alias.command
  }

  /**
   * Get all available aliases
   */
  getAliases(): MobileCommandAlias[] {
    const aliases = Array.from(this.aliases.values())

    if (this.isEnabled) {
      return aliases
    } else {
      // Return only non-mobile-only aliases for desktop
      return aliases.filter((alias) => !alias.mobileOnly)
    }
  }

  /**
   * Get aliases by category for help display
   */
  getAliasesByCategory(): Map<string, MobileCommandAlias[]> {
    const categories = new Map<string, MobileCommandAlias[]>()

    const categoryMap = {
      Essential: ['/q', '/h', '/s', '/c'],
      Files: ['/r', '/w', '/ls', '/find'],
      Execution: ['/run', '/cmd', '/test', '/build'],
      Models: ['/m', '/cfg', '/set'],
      Sessions: ['/save', '/load', '/list-sessions'],
      Agents: ['/a', '/ag', '/auto'],
      Planning: ['/p', '/todo'],
      Advanced: ['/snap', '/vm', '/debug'],
      Mobile: ['/mobile', '/compact', '/menu'],
      Selection: ['1', '2', '3', '4', '5'],
    }

    for (const [category, aliasNames] of Object.entries(categoryMap)) {
      const categoryAliases: MobileCommandAlias[] = []

      for (const aliasName of aliasNames) {
        const alias = this.aliases.get(aliasName)
        if (alias && (!alias.mobileOnly || this.isEnabled)) {
          categoryAliases.push(alias)
        }
      }

      if (categoryAliases.length > 0) {
        categories.set(category, categoryAliases)
      }
    }

    return categories
  }

  /**
   * Add custom alias
   */
  addAlias(alias: MobileCommandAlias): boolean {
    if (this.aliases.has(alias.alias)) {
      return false // Alias already exists
    }

    this.aliases.set(alias.alias, alias)
    return true
  }

  /**
   * Remove alias
   */
  removeAlias(alias: string): boolean {
    return this.aliases.delete(alias)
  }

  /**
   * Generate mobile help text
   */
  generateMobileHelp(): string {
    const mobileUI = getMobileUI()
    if (!mobileUI) {
      return 'Mobile UI not available'
    }

    const categories = this.getAliasesByCategory()
    const commands: Array<{ name: string; description: string; category: string }> = []

    for (const [category, aliases] of categories) {
      for (const alias of aliases) {
        commands.push({
          name: alias.alias,
          description: alias.description + (alias.requiresArgs ? ' (requires args)' : ''),
          category,
        })
      }
    }

    return mobileUI.createMobileHelp(commands)
  }

  /**
   * Create numbered menu from commands
   */
  createCommandMenu(commands: string[], title = 'Available Commands'): string {
    const mobileUI = getMobileUI()
    if (!mobileUI || !this.isEnabled) {
      return commands.map((cmd, i) => `${i + 1}. ${cmd}`).join('\n')
    }

    return mobileUI.createNumberedMenu(commands, title)
  }

  /**
   * Check if mobile mode is enabled
   */
  isMobileEnabled(): boolean {
    return this.isEnabled
  }

  /**
   * Toggle mobile mode
   */
  toggleMobileMode(enabled?: boolean): boolean {
    this.isEnabled = enabled ?? !this.isEnabled

    if (this.isEnabled) {
      console.log(chalk.green('📱 Mobile command aliases enabled'))
    } else {
      console.log(chalk.blue('🖥️  Mobile command aliases disabled'))
    }

    return this.isEnabled
  }

  /**
   * Get command suggestion based on partial input
   */
  getSuggestions(partial: string): string[] {
    if (!partial.startsWith('/')) return []

    const suggestions: string[] = []
    const lowerPartial = partial.toLowerCase()

    for (const alias of this.aliases.values()) {
      if (alias.alias.toLowerCase().startsWith(lowerPartial)) {
        suggestions.push(alias.alias)
      }
    }

    return suggestions.sort()
  }

  /**
   * Validate command before execution
   */
  validateCommand(command: string): { valid: boolean; error?: string; suggestion?: string } {
    const trimmed = command.trim()

    if (!trimmed.startsWith('/')) {
      return { valid: true } // Not a command, pass through
    }

    const parts = trimmed.split(' ')
    const cmd = parts[0]

    if (this.aliases.has(cmd)) {
      const alias = this.aliases.get(cmd) || {}

      if (alias.requiresArgs && parts.length === 1) {
        return {
          valid: false,
          error: `Command '${cmd}' requires arguments`,
          suggestion: `Try: ${cmd} <arguments>`,
        }
      }

      return { valid: true }
    }

    // Suggest similar commands
    const suggestions = this.getSuggestions(cmd)
    if (suggestions.length > 0) {
      return {
        valid: true, // Let it pass through, but provide suggestion
        suggestion: `Did you mean: ${suggestions.slice(0, 3).join(', ')}?`,
      }
    }

    return { valid: true } // Unknown command, let it pass through
  }
}

// Export singleton instance
export let mobileCommandHandler: MobileCommandHandler | null = null

export function initializeMobileCommands(sessionManager: EnhancedSessionManager): MobileCommandHandler {
  mobileCommandHandler = new MobileCommandHandler(sessionManager)
  return mobileCommandHandler
}

export function getMobileCommands(): MobileCommandHandler | null {
  return mobileCommandHandler
}
