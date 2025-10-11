/**
 * IDE-Aware Formatting Module
 * Adapts output formatting based on detected IDE capabilities
 */

import chalk from 'chalk'
import { ideDetector } from '../core/ide-detector'

export class IDEAwareFormatter {
  /**
   * Format message based on IDE capabilities
   */
  static formatMessage(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): string {
    const _caps = ideDetector.detect()
    const formatting = ideDetector.getFormattingPreferences()

    if (!formatting.supportsAnsiColors) {
      return message
    }

    switch (type) {
      case 'success':
        return chalk.green(message)
      case 'warning':
        return chalk.yellow(message)
      case 'error':
        return chalk.red(message)
      default:
        return chalk.blue(message)
    }
  }

  /**
   * Create IDE-specific status indicator
   */
  static createStatusIndicator(): string {
    const caps = ideDetector.detect()
    const formatting = ideDetector.getFormattingPreferences()

    if (!formatting.supportsAnsiColors) {
      return `[${caps.name.toUpperCase()}]`
    }

    const icons: Record<string, string> = {
      vscode: '$(code)',
      cursor: '$(cursor)',
      jetbrains: '$(jetbrains)',
      terminal: '$(terminal)',
    }

    const colors: Record<string, (str: string) => string> = {
      vscode: chalk.blueBright,
      cursor: chalk.cyanBright,
      jetbrains: chalk.magentaBright,
      terminal: chalk.gray,
    }

    const icon = icons[caps.name] || '$(unknown)'
    const color = colors[caps.name] || chalk.white

    return color(`${icon} ${caps.name.toUpperCase()}`)
  }

  /**
   * Format environment context display
   */
  static formatEnvironmentContext(): string {
    const caps = ideDetector.detect()
    const formatting = ideDetector.getFormattingPreferences()

    const lines: string[] = []

    lines.push(chalk.bold('🖥️  IDE & Runtime Context'))
    lines.push('═'.repeat(formatting.preferredWidth || 80))

    lines.push(
      chalk.cyan(
        `  * Editor: ${
          caps.name === 'vscode' || caps.name === 'cursor'
            ? `${caps.name.toUpperCase()} (GUI IDE detected)`
            : caps.name === 'terminal'
              ? 'Terminal/CLI (no GUI IDE open)'
              : caps.name.toUpperCase()
        }`
      )
    )

    if (caps.version) {
      lines.push(chalk.gray(`  * Version: ${caps.version}`))
    }

    if (caps.hasGUI) {
      lines.push(chalk.green('  * GUI Features: Available'))
      lines.push(chalk.gray('    - File tree navigation'))
      lines.push(chalk.gray('    - Interactive panels'))
      lines.push(chalk.gray('    - Webview support'))
    }

    if (caps.hasExtensionSupport) {
      const extensionAvailable = ideDetector.isVSCode()
      if (extensionAvailable) {
        lines.push(chalk.green('  * NikCLI Extension: Available'))
        lines.push(chalk.gray('    - Use extension for config management'))
        lines.push(chalk.gray('    - Launch background agents from GUI'))
      }
    }

    lines.push(chalk.cyan(`  * Recommended UI Mode: ${ideDetector.getRecommendedUIMode().toUpperCase()}`))

    return lines.join('\n')
  }

  /**
   * Suggest IDE-specific features
   */
  static getSuggestions(): string[] {
    const caps = ideDetector.detect()
    const suggestions: string[] = []

    if (caps.name === 'vscode' || caps.name === 'cursor') {
      suggestions.push('💡 Install NikCLI VS Code Extension for enhanced features')
      suggestions.push('💡 Use Command Palette (Ctrl/Cmd+Shift+P) → "NikCLI: Open Config"')
      suggestions.push('💡 Launch background agents from the NikCLI sidebar panel')
      suggestions.push('💡 View live job logs in the agent manager webview')
    }

    if (caps.name === 'jetbrains') {
      suggestions.push('💡 JetBrains integration available via terminal')
      suggestions.push('💡 Use built-in terminal for NikCLI commands')
    }

    if (caps.name === 'terminal') {
      suggestions.push('💡 Consider using VS Code for enhanced GUI features')
      suggestions.push('💡 Background agents can still be launched from CLI')
    }

    return suggestions
  }

  /**
   * Create interactive prompt based on IDE
   */
  static createPrompt(context: { workingDir?: string; mode?: string; agentCount?: number } = {}): string {
    const _caps = ideDetector.detect()
    const formatting = ideDetector.getFormattingPreferences()

    if (!formatting.supportsAnsiColors) {
      return '> '
    }

    const ideIndicator = IDEAwareFormatter.createStatusIndicator()
    const dir = context.workingDir ? chalk.green(context.workingDir.split('/').pop() || 'root') : ''
    const mode = context.mode ? chalk.cyan(`[${context.mode}]`) : ''
    const agents = context.agentCount ? chalk.blue(`🔌${context.agentCount}`) : ''

    return `\n┌─[${ideIndicator}${dir ? `:${dir}` : ''}${mode ? ` ${mode}` : ''}${agents ? ` ${agents}` : ''}]\n└─❯ `
  }
}

/**
 * Singleton instance
 */
export const ideAwareFormatter = IDEAwareFormatter
