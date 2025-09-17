import chalk from 'chalk'
import { type EnhancedSessionManager } from '../persistence/enhanced-session-manager'

export interface MobileUIConfig {
  maxLineLength: number
  truncateAfter: number
  useCompactMode: boolean
  showProgressBars: boolean
  enableNumberSelection: boolean
}

export interface CompressedOutput {
  content: string
  truncated: boolean
  originalLength: number
  compressionRatio: number
}

/**
 * Mobile UI Adapter for optimizing CLI interface on small screens
 */
export class MobileUIAdapter {
  private sessionManager: EnhancedSessionManager
  private config: MobileUIConfig
  private isMobileMode = false

  constructor(sessionManager: EnhancedSessionManager) {
    this.sessionManager = sessionManager
    this.config = this.getDefaultMobileConfig()
    this.isMobileMode = sessionManager.isMobile()

    if (this.isMobileMode) {
      this.optimizeForMobile()
    }
  }

  /**
   * Get default mobile configuration based on screen size
   */
  private getDefaultMobileConfig(): MobileUIConfig {
    const { width } = this.sessionManager.getScreenDimensions()

    return {
      maxLineLength: Math.min(width - 4, 76), // Leave margin for mobile
      truncateAfter: width <= 60 ? 300 : 600, // Shorter on very small screens
      useCompactMode: width <= 80,
      showProgressBars: width > 50, // Hide on very small screens
      enableNumberSelection: true
    }
  }

  /**
   * Optimize interface for mobile usage
   */
  private optimizeForMobile(): void {
    // Reduce chalk colors for better mobile readability
    if (process.env.FORCE_COLOR !== '3') {
      process.env.FORCE_COLOR = '1' // Use basic colors only
    }

    console.log(chalk.blue('📱 Mobile UI optimizations enabled'))
  }

  /**
   * Compress long output for mobile screens
   */
  compressOutput(content: string, options?: {
    preserveFormatting?: boolean
    maxLines?: number
  }): CompressedOutput {
    const { preserveFormatting = false, maxLines } = options || {}
    const originalLength = content.length

    if (!this.isMobileMode) {
      return {
        content,
        truncated: false,
        originalLength,
        compressionRatio: 1
      }
    }

    let compressed = content

    // 1. Line length optimization
    compressed = this.wrapLines(compressed)

    // 2. Remove excessive whitespace
    if (!preserveFormatting) {
      compressed = compressed.replace(/\n\s*\n\s*\n/g, '\n\n') // Max 2 consecutive newlines
      compressed = compressed.replace(/[ \t]+/g, ' ') // Collapse multiple spaces
    }

    // 3. Truncate if too long
    let truncated = false
    if (compressed.length > this.config.truncateAfter) {
      const cutPoint = this.findGoodCutPoint(compressed, this.config.truncateAfter)
      compressed = compressed.substring(0, cutPoint) +
        chalk.gray('\n\n[... content truncated for mobile view ...]')
      truncated = true
    }

    // 4. Line limit for very small screens
    if (maxLines && compressed.split('\n').length > maxLines) {
      const lines = compressed.split('\n')
      compressed = lines.slice(0, maxLines).join('\n') +
        chalk.gray(`\n[... ${lines.length - maxLines} more lines ...]`)
      truncated = true
    }

    return {
      content: compressed,
      truncated,
      originalLength,
      compressionRatio: compressed.length / originalLength
    }
  }

  /**
   * Wrap long lines for mobile display
   */
  private wrapLines(content: string): string {
    const lines = content.split('\n')
    const wrapped: string[] = []

    for (const line of lines) {
      if (line.length <= this.config.maxLineLength) {
        wrapped.push(line)
        continue
      }

      // Smart wrapping - try to break at word boundaries
      const words = line.split(' ')
      let currentLine = ''

      for (const word of words) {
        if ((currentLine + ' ' + word).length <= this.config.maxLineLength) {
          currentLine += (currentLine ? ' ' : '') + word
        } else {
          if (currentLine) wrapped.push(currentLine)

          // Handle very long words
          if (word.length > this.config.maxLineLength) {
            // Break long words
            let remaining = word
            while (remaining.length > this.config.maxLineLength) {
              wrapped.push(remaining.substring(0, this.config.maxLineLength - 1) + '-')
              remaining = remaining.substring(this.config.maxLineLength - 1)
            }
            currentLine = remaining
          } else {
            currentLine = word
          }
        }
      }

      if (currentLine) wrapped.push(currentLine)
    }

    return wrapped.join('\n')
  }

  /**
   * Find a good point to cut content (prefer end of sentences/paragraphs)
   */
  private findGoodCutPoint(content: string, maxLength: number): number {
    if (maxLength >= content.length) return content.length

    // Look for good break points near the cut point
    const searchStart = Math.max(0, maxLength - 100)
    const searchEnd = Math.min(content.length, maxLength + 50)
    const segment = content.substring(searchStart, searchEnd)

    // Preferred break points (in order of preference)
    const breakPoints = ['\n\n', '. ', '.\n', '!\n', '?\n', '\n', '. ']

    for (const breakPoint of breakPoints) {
      const lastIndex = segment.lastIndexOf(breakPoint)
      if (lastIndex !== -1) {
        return searchStart + lastIndex + breakPoint.length
      }
    }

    // Fallback to character limit
    return maxLength
  }

  /**
   * Create mobile-friendly progress indicator
   */
  createMobileProgress(current: number, total: number, label?: string): string {
    if (!this.config.showProgressBars) {
      return chalk.gray(`${label ? label + ': ' : ''}${current}/${total}`)
    }

    const percentage = Math.round((current / total) * 100)
    const barWidth = Math.min(20, this.config.maxLineLength - 20)
    const filled = Math.round((percentage / 100) * barWidth)
    const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled)

    return chalk.cyan(`${label ? label + ': ' : ''}${bar} ${percentage}%`)
  }

  /**
   * Create numbered selection menu for mobile
   */
  createNumberedMenu(items: string[], title?: string): string {
    const lines: string[] = []

    if (title) {
      lines.push(chalk.bold(title))
      lines.push('')
    }

    items.forEach((item, index) => {
      const number = chalk.cyan(`${index + 1}.`)
      const wrapped = this.wrapLines(item)
      const firstLine = wrapped.split('\n')[0]
      const restLines = wrapped.split('\n').slice(1)

      lines.push(`${number} ${firstLine}`)
      restLines.forEach(line => {
        lines.push(`   ${line}`) // Indent continuation lines
      })
    })

    lines.push('')
    lines.push(chalk.gray('Enter number to select, or type command:'))

    return lines.join('\n')
  }

  /**
   * Parse number selection from user input
   */
  parseNumberSelection(input: string, maxOptions: number): number | null {
    if (!this.config.enableNumberSelection) return null

    const trimmed = input.trim()
    const number = parseInt(trimmed, 10)

    if (isNaN(number) || number < 1 || number > maxOptions) {
      return null
    }

    return number - 1 // Convert to 0-based index
  }

  /**
   * Create mobile-friendly table
   */
  createMobileTable(data: Array<Record<string, string>>, maxColumns = 2): string {
    if (data.length === 0) return 'No data'

    const lines: string[] = []

    for (const row of data) {
      const entries = Object.entries(row)

      if (this.config.useCompactMode) {
        // Compact mode - one row per item
        const values = entries.slice(0, maxColumns).map(([key, value]) =>
          `${chalk.gray(key)}: ${value}`
        )
        lines.push(values.join(' | '))
      } else {
        // Detailed mode - multiple lines per item
        lines.push(chalk.bold('─'.repeat(this.config.maxLineLength)))
        entries.forEach(([key, value]) => {
          lines.push(`${chalk.cyan(key)}: ${value}`)
        })
      }
    }

    return lines.join('\n')
  }

  /**
   * Check if mobile mode is active
   */
  isMobile(): boolean {
    return this.isMobileMode
  }

  /**
   * Get current mobile configuration
   */
  getConfig(): MobileUIConfig {
    return { ...this.config }
  }

  /**
   * Update mobile configuration
   */
  updateConfig(updates: Partial<MobileUIConfig>): void {
    this.config = { ...this.config, ...updates }
  }

  /**
   * Toggle mobile mode manually
   */
  toggleMobileMode(enabled?: boolean): boolean {
    this.isMobileMode = enabled ?? !this.isMobileMode

    if (this.isMobileMode) {
      this.optimizeForMobile()
      console.log(chalk.green('📱 Mobile mode enabled'))
    } else {
      console.log(chalk.blue('🖥️  Desktop mode enabled'))
    }

    return this.isMobileMode
  }

  /**
   * Create mobile-friendly help text
   */
  createMobileHelp(commands: Array<{ name: string; description: string; category?: string }>): string {
    const lines: string[] = []
    const categories = new Map<string, Array<{ name: string; description: string }>>()

    // Group by category
    for (const cmd of commands) {
      const category = cmd.category || 'General'
      if (!categories.has(category)) {
        categories.set(category, [])
      }
      categories.get(category)!.push({ name: cmd.name, description: cmd.description })
    }

    // Render categories
    for (const [category, categoryCommands] of categories) {
      lines.push(chalk.bold.cyan(category))
      lines.push('')

      for (const cmd of categoryCommands) {
        if (this.config.useCompactMode) {
          lines.push(`${chalk.green(cmd.name)} - ${cmd.description}`)
        } else {
          lines.push(chalk.green(cmd.name))
          lines.push(`  ${cmd.description}`)
          lines.push('')
        }
      }
    }

    return lines.join('\n')
  }
}

// Export singleton instance
export let mobileUIAdapter: MobileUIAdapter | null = null

export function initializeMobileUI(sessionManager: EnhancedSessionManager): MobileUIAdapter {
  mobileUIAdapter = new MobileUIAdapter(sessionManager)
  return mobileUIAdapter
}

export function getMobileUI(): MobileUIAdapter | null {
  return mobileUIAdapter
}