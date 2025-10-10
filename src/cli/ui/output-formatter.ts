import boxen from 'boxen'
import chalk from 'chalk'

/**
 * OutputFormatter - now returns markdown strings for streamttyService rendering
 * No longer performs direct console.log/stdout.write - all rendering through streamttyService
 */

export interface StructuredReport {
  title: string
  summary?: string
  metrics?: Record<string, number | string>
  critical?: string[]
  high?: string[]
  medium?: string[]
  low?: string[]
  recommendations?: string[]
}

export class OutputFormatter {
  /**
   * @deprecated Content is now rendered as raw markdown through streamttyService
   * This method now just returns the original markdown content with minimal processing
   */
  static formatFinalOutput(content: string): string {
    // Return content as-is - streamttyService handles all markdown rendering
    // Just ensure proper spacing at the end for prompt area
    const bottomPadding = OutputFormatter.getBottomPadding()
    const paddingStr = '\n'.repeat(bottomPadding)
    return content + paddingStr
  }

  /**
   * Calculate bottom padding based on terminal size to avoid overlap with HUD/prompt
   */
  private static getBottomPadding(): number {
    const terminalHeight = process.stdout.rows || 24

    if (terminalHeight < 20) {
      return 3 // Minimal padding for small terminals
    } else if (terminalHeight < 40) {
      return 5 // Standard padding for medium terminals
    } else {
      return 6 // Extra padding for large terminals
    }
  }

  static formatHeader(text: string): string {
    const cleaned = text.trim()
    return `\n${chalk.blueBright.bold('═'.repeat(60))}\n${chalk.white.bold(`  ${cleaned}`)}\n${chalk.blueBright.bold('═'.repeat(60))}`
  }

  static formatListItem(text: string): string {
    const match = text.match(/^[-*•]\s+(.+)$/)
    if (!match) return text
    const content = match[1]

    if (content.match(/^(Fix|Resolve|Implement|Add|Create)/i)) {
      return `  ${chalk.green('+')} ${chalk.white(content)}`
    }
    if (content.match(/^(Critical|Error|Fail|Bug)/i)) {
      return `  ${chalk.red('x')} ${chalk.white(content)}`
    }
    if (content.match(/^(Warning|Caution|Note)/i)) {
      return `  ${chalk.yellow('!')} ${chalk.white(content)}`
    }
    return `  ${chalk.cyan('*')} ${chalk.white(content)}`
  }

  static formatNumberedItem(text: string): string {
    const match = text.match(/^(\d+)\.\s+(.+)$/)
    if (!match) return text
    const num = match[1]
    const content = match[2]
    return `  ${chalk.yellow(num + '.')} ${chalk.white(content)}`
  }

  static formatCodeBlock(code: string): string {
    return boxen(chalk.white(code), {
      padding: 1,
      margin: { top: 1, bottom: 1, left: 2, right: 2 },
      borderStyle: 'round',
      borderColor: 'cyan',
      backgroundColor: '#1e1e1e',
    })
  }

  static formatInlineCode(text: string): string {
    return text.replace(/`([^`]+)`/g, (_match, code) => {
      return chalk.bgHex('#2b2b2b').white(` ${code} `)
    })
  }

  static formatFilePath(text: string): string {
    // Match file paths with extensions
    let formatted = text.replace(/([a-zA-Z0-9_\-./]+\.[a-z]{2,4})/gi, (match) => {
      return chalk.blueBright.bold.underline(match)
    })
    // Match paths without extensions (like /api/github/webhook or src/cli/utils)
    formatted = formatted.replace(/(\/?(?:[a-zA-Z0-9_-]+\/)+[a-zA-Z0-9_-]+)/g, (match) => {
      // Avoid re-formatting already formatted paths
      if (match.match(/\.[a-z]{2,4}$/i)) return match
      return chalk.blueBright.bold(match)
    })
    return formatted
  }

  static formatStatusLine(text: string): string {
    if (text.match(/^(✓|✅|\[OK\]|\[DONE\])/)) {
      return chalk.green(text)
    }
    if (text.match(/^(❌|x|\[ERR\]|\[FAIL\])/)) {
      return chalk.red(text)
    }
    if (text.match(/^(⚠️|!|\[WARN\])/)) {
      return chalk.yellow(text)
    }
    return text
  }

  static formatPriorityLine(text: string): string {
    const match = text.match(/^(P\d+|Critical|High|Medium|Low):\s*(.+)$/i)
    if (!match) return text
    const priority = match[1].toUpperCase()
    const content = match[2]

    let badge = ''
    if (priority.includes('CRITICAL') || priority === 'P0') {
      badge = chalk.bgHex('#8B0000').white.bold(` ${priority} `)
    } else if (priority.includes('HIGH') || priority === 'P1') {
      badge = chalk.bgHex('#B8860B').black.bold(` ${priority} `)
    } else if (priority.includes('MEDIUM') || priority === 'P2') {
      badge = chalk.bgHex('#1E3A8A').white(` ${priority} `)
    } else {
      badge = chalk.bgHex('#374151').white(` ${priority} `)
    }

    return `${badge} ${chalk.white(content)}`
  }

  static formatKeyValue(text: string): string {
    const match = text.match(/^([^:]+):\s*(.+)$/)
    if (!match) return text
    const key = match[1]
    const value = match[2]
    return `${chalk.blue.bold(key + ':')} ${chalk.white(value)}`
  }

  static formatPlainText(text: string): string {
    let formatted = text

    // URLs first (to avoid conflicts with paths)
    formatted = formatted.replace(/(https?:\/\/[^\s]+)/g, (match) => {
      return chalk.blueBright.underline(match)
    })

    // File paths WITH extensions - include brackets for [jobId] patterns
    // Match: bin/cli.ts, api/jobs/[jobId].ts, dist/cli/vim/ui/vim-renderer.js
    formatted = formatted.replace(/\b([a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_\-[\]]+)+\.[a-z]{2,4})\b/gi, (match) => {
      return chalk.blueBright.bold.underline(match)
    })

    // File paths WITHOUT extensions - like api/github/webhook
    // Must have at least one slash to be considered a path
    formatted = formatted.replace(/\b([a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)+)\b/g, (match) => {
      // Skip if already has extension or is a URL
      if (match.match(/\.[a-z]{2,4}$/i) || match.includes(':')) {
        return match
      }
      return chalk.blueBright.bold(match)
    })

    // Numbers in yellow
    formatted = formatted.replace(/\b\d+(\.\d+)?%?\b/g, (match) => {
      return chalk.yellow(match)
    })

    return formatted
  }

  static createSummaryBox(title: string, items: string[]): string {
    const content = items.map((item) => `  ${chalk.cyan('•')} ${item}`).join('\n')
    return boxen(content, {
      title: chalk.bold(title),
      titleAlignment: 'left',
      padding: 1,
      margin: { top: 1, bottom: 1, left: 0, right: 0 },
      borderStyle: 'round',
      borderColor: 'cyan',
    })
  }

  static createFindingsBox(
    severity: 'critical' | 'high' | 'medium' | 'low',
    title: string,
    findings: string[]
  ): string {
    const colors: Record<'critical' | 'high' | 'medium' | 'low', string> = {
      critical: 'red',
      high: 'yellow',
      medium: 'blue',
      low: 'gray',
    }
    const icons: Record<'critical' | 'high' | 'medium' | 'low', string> = {
      critical: '[!]',
      high: '[!]',
      medium: '[i]',
      low: '[-]',
    }

    const content = findings.map((finding) => `  ${icons[severity]} ${finding}`).join('\n')
    return boxen(content, {
      title: `${icons[severity]} ${title}`,
      titleAlignment: 'left',
      padding: 1,
      margin: { top: 1, bottom: 1, left: 0, right: 0 },
      borderStyle: 'round',
      borderColor: colors[severity],
    })
  }

  static createMetricsDashboard(metrics: Record<string, number | string>): string {
    const lines: string[] = []
    for (const [key, value] of Object.entries(metrics)) {
      const formattedKey = chalk.blue.bold(key.padEnd(25))
      if (typeof value === 'number') {
        if (value >= 0 && value <= 100) {
          const bar = OutputFormatter.createProgressBar(value, 20)
          lines.push(`${formattedKey} ${bar}`)
        } else {
          lines.push(`${formattedKey} ${chalk.yellow(value.toString())}`)
        }
      } else {
        lines.push(`${formattedKey} ${chalk.white(value)}`)
      }
    }
    return boxen(lines.join('\n'), {
      title: chalk.bold('📊 Metrics Dashboard'),
      titleAlignment: 'center',
      padding: 1,
      margin: { top: 1, bottom: 1, left: 0, right: 0 },
      borderStyle: 'double',
      borderColor: 'cyan',
    })
  }

  static createProgressBar(percentage: number, width: number = 20): string {
    const filled = Math.round((percentage / 100) * width)
    const empty = width - filled
    const bar = '█'.repeat(filled) + '░'.repeat(empty)
    const color = percentage < 30 ? chalk.red : percentage < 70 ? chalk.yellow : chalk.green
    return `[${color(bar)}] ${chalk.white(percentage + '%')}`
  }

  static formatStructuredReport(report: StructuredReport): string {
    const sections: string[] = []
    sections.push(chalk.cyan.bold(`\n${'═'.repeat(80)}`))
    sections.push(chalk.cyan.bold(`  ${report.title}`))
    sections.push(chalk.cyan.bold(`${'═'.repeat(80)}\n`))

    if (report.summary) {
      sections.push(chalk.white(report.summary))
      sections.push('')
    }

    if (report.metrics) {
      sections.push(OutputFormatter.createMetricsDashboard(report.metrics))
      sections.push('')
    }

    if (report.critical && report.critical.length > 0) {
      sections.push(OutputFormatter.createFindingsBox('critical', 'Critical Issues', report.critical))
      sections.push('')
    }

    if (report.high && report.high.length > 0) {
      sections.push(OutputFormatter.createFindingsBox('high', 'High Priority', report.high))
      sections.push('')
    }

    if (report.medium && report.medium.length > 0) {
      sections.push(OutputFormatter.createFindingsBox('medium', 'Medium Priority', report.medium))
      sections.push('')
    }

    if (report.low && report.low.length > 0) {
      sections.push(OutputFormatter.createFindingsBox('low', 'Low Priority', report.low))
      sections.push('')
    }

    if (report.recommendations && report.recommendations.length > 0) {
      sections.push(OutputFormatter.createSummaryBox('💡 Recommendations', report.recommendations))
      sections.push('')
    }

    // Add bottom padding to prevent overlap with HUD menu and prompt area
    const bottomPadding = OutputFormatter.getBottomPadding()
    for (let i = 0; i < bottomPadding; i++) {
      sections.push('')
    }

    return sections.join('\n')
  }
}
