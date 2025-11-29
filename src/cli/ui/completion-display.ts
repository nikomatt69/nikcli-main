import chalk from 'chalk'
import type { UnifiedCompletion } from '../core/smart-completion-manager'

// ====================== TYPES ======================

type ChalkColor = 'cyan' | 'green' | 'yellow' | 'blue' | 'magenta' | 'red' | 'white' | 'gray' | 'grey'

// ====================== COMPLETION DISPLAY SYSTEM ======================

export interface CompletionDisplayOptions {
  maxWidth: number
  showConfidence: boolean
  showSource: boolean
  showDescription: boolean
  colorMode: 'full' | 'minimal' | 'mono'
  layout: 'compact' | 'detailed'
}

export class CompletionDisplay {
  private options: CompletionDisplayOptions

  constructor(options: Partial<CompletionDisplayOptions> = {}) {
    this.options = {
      maxWidth: 80,
      showConfidence: true,
      showSource: true,
      showDescription: true,
      colorMode: 'full',
      layout: 'compact',
      ...options,
    }
  }

  /**
   * Format completions for display with enhanced visual indicators
   */
  formatCompletions(completions: UnifiedCompletion[]): string[] {
    if (completions.length === 0) {
      return [chalk.dim('No completions available')]
    }

    return completions.map((comp, index) => {
      if (this.options.layout === 'detailed') {
        return this.formatDetailedCompletion(comp, index)
      } else {
        return this.formatCompactCompletion(comp, index)
      }
    })
  }

  /**
   * Format compact completion (single line)
   */
  private formatCompactCompletion(comp: UnifiedCompletion, index: number): string {
    const parts: string[] = []

    // Index number
    parts.push(chalk.dim(`${index + 1}.`))

    // Icon and completion text
    const icon = this.getSourceIcon(comp.source)
    const coloredCompletion = this.colorizeCompletion(comp)
    parts.push(`${icon} ${coloredCompletion}`)

    // Confidence indicator
    if (this.options.showConfidence && comp.source === 'ai') {
      const confidence = Math.round(comp.confidence * 100)
      const confidenceText = this.colorizeText(`${confidence}%`, this.getConfidenceColor(confidence))
      parts.push(confidenceText)
    }

    // Description (truncated)
    if (this.options.showDescription && comp.description) {
      const maxDescLength = Math.max(20, this.options.maxWidth - 40)
      const desc =
        comp.description.length > maxDescLength
          ? `${comp.description.substring(0, maxDescLength)}...`
          : comp.description
      parts.push(chalk.dim(`- ${desc}`))
    }

    // Approval indicator
    if (comp.requiresApproval) {
      parts.push(chalk.yellow('⚠︎'))
    }

    return parts.join(' ')
  }

  /**
   * Format detailed completion (multi-line)
   */
  private formatDetailedCompletion(comp: UnifiedCompletion, index: number): string {
    const lines: string[] = []

    // Main completion line
    const icon = this.getSourceIcon(comp.source)
    const coloredCompletion = this.colorizeCompletion(comp)
    const indexStr = chalk.dim(`[${index + 1}]`)

    lines.push(`${indexStr} ${icon} ${coloredCompletion}`)

    // Metadata line
    const metadata: string[] = []

    if (this.options.showSource) {
      const sourceText = this.colorizeText(comp.source.toUpperCase(), this.getSourceColor(comp.source))
      metadata.push(sourceText)
    }

    if (this.options.showConfidence) {
      const confidence = Math.round(comp.confidence * 100)
      const confidenceText = this.colorizeText(`${confidence}%`, this.getConfidenceColor(confidence))
      metadata.push(confidenceText)
    }

    metadata.push(chalk.dim(`Priority: ${comp.priority}`))

    if (comp.requiresApproval) {
      metadata.push(chalk.yellow('REQUIRES APPROVAL'))
    }

    lines.push(`    ${chalk.dim('↳')} ${metadata.join(chalk.dim(' • '))}`)

    // Description line
    if (this.options.showDescription && comp.description) {
      lines.push(`    ${chalk.dim('↳')} ${chalk.gray(comp.description)}`)
    }

    return lines.join('\n')
  }

  /**
   * Colorize completion text based on category and source
   */
  private colorizeCompletion(comp: UnifiedCompletion): string {
    if (this.options.colorMode === 'mono') {
      return comp.completion
    }

    const baseColor = this.validateColor(comp.color) || this.getCategoryColor(comp.category)

    if (this.options.colorMode === 'minimal') {
      return this.colorizeText(comp.completion, baseColor)
    }

    // Full color mode - different styles based on category
    switch (comp.category) {
      case 'command':
        return this.colorizeText(comp.completion, baseColor, 'bold')
      case 'agent':
        return this.colorizeText(comp.completion, baseColor)
      case 'path':
        return this.colorizeText(comp.completion, baseColor, 'underline')
      case 'tool':
        return this.colorizeText(comp.completion, baseColor)
      default:
        return this.colorizeText(comp.completion, baseColor)
    }
  }

  /**
   * Validate and convert string to ChalkColor
   */
  private validateColor(color?: string): ChalkColor | null {
    if (!color) return null

    const validColors: ChalkColor[] = ['cyan', 'green', 'yellow', 'blue', 'magenta', 'red', 'white', 'gray', 'grey']
    return validColors.includes(color as ChalkColor) ? (color as ChalkColor) : null
  }

  /**
   * Helper method to safely colorize text
   */
  private colorizeText(text: string, color: ChalkColor, style?: 'bold' | 'underline'): string {
    let chalkFn: any

    switch (color) {
      case 'cyan':
        chalkFn = chalk.cyan
        break
      case 'green':
        chalkFn = chalk.green
        break
      case 'yellow':
        chalkFn = chalk.yellow
        break
      case 'blue':
        chalkFn = chalk.blue
        break
      case 'magenta':
        chalkFn = chalk.magenta
        break
      case 'red':
        chalkFn = chalk.red
        break
      case 'white':
        chalkFn = chalk.white
        break
      case 'gray':
        chalkFn = chalk.gray
        break
      case 'grey':
        chalkFn = chalk.grey
        break
      default:
        chalkFn = chalk.white
        break
    }

    if (style === 'bold') {
      chalkFn = chalkFn.bold
    } else if (style === 'underline') {
      chalkFn = chalkFn.underline
    }

    return chalkFn(text)
  }

  /**
   * Get icon for completion source
   */
  private getSourceIcon(source: string): string {
    const icons: Record<string, string> = {
      static: '📋',
      ml: '⚡︎',
      ai: '✨',
      agent: '🔌',
      tool: '🔧',
      path: '📁',
    }
    return icons[source] || '▶️'
  }

  /**
   * Get color for completion source
   */
  private getSourceColor(source: string): ChalkColor {
    const colors: Record<string, ChalkColor> = {
      static: 'cyan',
      ml: 'green',
      ai: 'magenta',
      agent: 'blue',
      tool: 'yellow',
      path: 'white',
    }
    return colors[source] || 'white'
  }

  /**
   * Get color for completion category
   */
  private getCategoryColor(category: string): ChalkColor {
    const colors: Record<string, ChalkColor> = {
      command: 'cyan',
      parameter: 'yellow',
      path: 'magenta',
      agent: 'blue',
      tool: 'yellow',
      code: 'green',
      natural: 'white',
    }
    return colors[category] || 'white'
  }

  /**
   * Get color for confidence level
   */
  private getConfidenceColor(confidence: number): ChalkColor {
    if (confidence >= 90) return 'green'
    if (confidence >= 70) return 'yellow'
    if (confidence >= 50) return 'cyan'
    return 'red'
  }

  /**
   * Create completion header with statistics
   */
  createHeader(completions: UnifiedCompletion[], inputText: string): string {
    const totalCompletions = completions.length
    const sourceBreakdown = this.getSourceBreakdown(completions)
    const hasAI = completions.some((c) => c.source === 'ai')

    const headerParts: string[] = []

    // Main header
    headerParts.push(chalk.bold.cyan(`📝 Completions for "${inputText}"`))

    // Statistics
    const stats: string[] = []
    stats.push(chalk.dim(`${totalCompletions} suggestions`))

    if (hasAI) {
      stats.push(chalk.magenta('✨ AI-enhanced'))
    }

    // Source breakdown
    const sources = Object.entries(sourceBreakdown)
      .filter(([_, count]) => count > 0)
      .map(([source, count]) => {
        const icon = this.getSourceIcon(source)
        const color = this.getSourceColor(source)
        return this.colorizeText(`${icon} ${count}`, color)
      })

    if (sources.length > 0) {
      stats.push(`(${sources.join(' ')})`)
    }

    headerParts.push(chalk.dim(stats.join(' • ')))

    return headerParts.join('\n')
  }

  /**
   * Create completion footer with tips
   */
  createFooter(): string {
    const tips = [chalk.dim('Tab: Accept • Ctrl+C: Cancel'), chalk.dim('↑/↓: Navigate • Enter: Execute')]

    return `${chalk.dim('─'.repeat(Math.min(this.options.maxWidth, 60)))}\n${tips.join(' • ')}`
  }

  /**
   * Get source breakdown statistics
   */
  private getSourceBreakdown(completions: UnifiedCompletion[]): Record<string, number> {
    const breakdown: Record<string, number> = {}

    completions.forEach((comp) => {
      breakdown[comp.source] = (breakdown[comp.source] || 0) + 1
    })

    return breakdown
  }

  /**
   * Create full completion display
   */
  createFullDisplay(completions: UnifiedCompletion[], inputText: string): string {
    const sections: string[] = []

    // Header
    sections.push(this.createHeader(completions, inputText))
    sections.push('') // Empty line

    // Completions
    const formatted = this.formatCompletions(completions)
    sections.push(...formatted)
    sections.push('') // Empty line

    // Footer
    sections.push(this.createFooter())

    return sections.join('\n')
  }

  /**
   * Update display options
   */
  updateOptions(options: Partial<CompletionDisplayOptions>): void {
    this.options = { ...this.options, ...options }
  }

  /**
   * Get current options
   */
  getOptions(): CompletionDisplayOptions {
    return { ...this.options }
  }
}

// Default display instance
export const completionDisplay = new CompletionDisplay()

// Preset configurations
export const displayPresets = {
  minimal: new CompletionDisplay({
    colorMode: 'minimal',
    showConfidence: false,
    showSource: false,
    showDescription: false,
    layout: 'compact',
  }),

  detailed: new CompletionDisplay({
    colorMode: 'full',
    showConfidence: true,
    showSource: true,
    showDescription: true,
    layout: 'detailed',
  }),

  compact: new CompletionDisplay({
    colorMode: 'full',
    showConfidence: true,
    showSource: false,
    showDescription: true,
    layout: 'compact',
  }),
}
