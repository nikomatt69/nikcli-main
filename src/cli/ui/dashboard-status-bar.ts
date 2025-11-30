import chalk from 'chalk'
import type { DashboardMetrics } from '../core/dashboard-metrics'

export class DashboardStatusBar {
  private isVisible = false
  private lastOutput = ''
  private terminalWidth: number
  private readonly BAR_CHARS = {
    HORIZONTAL: '─',
    LEFT_CORNER: '┌',
    RIGHT_CORNER: '┐',
    VERTICAL: '│',
    BOTTOM_LEFT: '└',
    BOTTOM_RIGHT: '┘',
  }

  constructor() {
    this.terminalWidth = process.stdout.columns || 80

    process.stdout.on('resize', () => {
      this.terminalWidth = process.stdout.columns || 80
      if (this.isVisible) {
        this.redraw()
      }
    })
  }

  public render(metrics: DashboardMetrics): void {
    const statusLine = this.buildStatusLine(metrics)

    if (statusLine === this.lastOutput) {
      return
    }

    this.clearPrevious()
    this.writeStatusBar(statusLine)

    this.lastOutput = statusLine
    this.isVisible = true
  }

  public hide(): void {
    if (!this.isVisible) {
      return
    }

    this.clearPrevious()
    this.isVisible = false
    this.lastOutput = ''
  }

  private buildStatusLine(metrics: DashboardMetrics): string {
    const segments = [
      this.formatAgentSegment(metrics.agents),
      this.formatTaskSegment(metrics.agents.tasks),
      this.formatPerformanceSegment(metrics.performance),
      this.formatAISegment(metrics.ai),
      this.formatCacheSegment(metrics.ai.cacheHitRate),
    ]

    const content = segments.join(' ')
    const availableWidth = this.terminalWidth - 4 // Account for borders and padding

    if (content.length > availableWidth) {
      return this.buildCompactStatusLine(metrics, availableWidth)
    }

    return content
  }

  private buildCompactStatusLine(metrics: DashboardMetrics, maxWidth: number): string {
    const segments = [
      this.formatAgentSegmentCompact(metrics.agents),
      this.formatTaskSegmentCompact(metrics.agents.tasks),
      this.formatPerformanceSegmentCompact(metrics.performance),
      this.formatAISegmentCompact(metrics.ai),
    ]

    return segments.join(' ').substring(0, maxWidth)
  }

  private formatAgentSegment(agents: DashboardMetrics['agents']): string {
    const color = agents.busyCount > 0 ? chalk.green : chalk.gray
    return color(`[${agents.busyCount}/${agents.total} Agents]`)
  }

  private formatAgentSegmentCompact(agents: DashboardMetrics['agents']): string {
    const color = agents.busyCount > 0 ? chalk.green : chalk.gray
    return color(`[${agents.busyCount}A]`)
  }

  private formatTaskSegment(tasks: DashboardMetrics['agents']['tasks']): string {
    const total = tasks.queued + tasks.running
    const color = total > 0 ? chalk.yellow : chalk.gray
    return color(`[${total} Tasks]`)
  }

  private formatTaskSegmentCompact(tasks: DashboardMetrics['agents']['tasks']): string {
    const total = tasks.queued + tasks.running
    const color = total > 0 ? chalk.yellow : chalk.gray
    return color(`[${total}T]`)
  }

  private formatPerformanceSegment(performance: DashboardMetrics['performance']): string {
    const cpuColor = performance.cpu > 80 ? chalk.red : performance.cpu > 60 ? chalk.yellow : chalk.green
    const memUsagePercent = Math.round((performance.memory.used / performance.memory.total) * 100)
    const memColor = memUsagePercent > 80 ? chalk.red : memUsagePercent > 60 ? chalk.yellow : chalk.green

    return `${cpuColor(`CPU:${performance.cpu}%`)} ${memColor(`${performance.memory.used}GB`)}`
  }

  private formatPerformanceSegmentCompact(performance: DashboardMetrics['performance']): string {
    const cpuColor = performance.cpu > 80 ? chalk.red : performance.cpu > 60 ? chalk.yellow : chalk.green
    return cpuColor(`[${performance.cpu}%]`)
  }

  private formatAISegment(ai: DashboardMetrics['ai']): string {
    const tokensFormatted = this.formatNumber(ai.totalTokens)
    const costFormatted = ai.totalCost.toFixed(2)

    return chalk.blue(`[${tokensFormatted}tk] [${chalk.green('$' + costFormatted)}]`)
  }

  private formatAISegmentCompact(ai: DashboardMetrics['ai']): string {
    const costFormatted = ai.totalCost.toFixed(2)
    return chalk.blue(`[$${costFormatted}]`)
  }

  private formatCacheSegment(cacheHitRate: number): string {
    const color = cacheHitRate > 70 ? chalk.green : cacheHitRate > 40 ? chalk.yellow : chalk.red
    return color(`[Cache:${cacheHitRate}%]`)
  }

  private formatNumber(num: number): string {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M'
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k'
    }
    return num.toString()
  }

  private writeStatusBar(content: string): void {
    const padding = Math.max(0, this.terminalWidth - content.length - 2)
    const paddedContent = content + ' '.repeat(padding)

    const topBorder = chalk.dim(
      this.BAR_CHARS.LEFT_CORNER +
        this.BAR_CHARS.HORIZONTAL.repeat(this.terminalWidth - 2) +
        this.BAR_CHARS.RIGHT_CORNER
    )
    const contentLine = chalk.dim(this.BAR_CHARS.VERTICAL) + ' ' + paddedContent + chalk.dim(this.BAR_CHARS.VERTICAL)

    process.stdout.write('\n' + topBorder + '\n')
    process.stdout.write(contentLine + '\n')

    // Position cursor after the status bar for the next prompt
    process.stdout.write('\n')
  }

  private clearPrevious(): void {
    if (!this.isVisible) {
      return
    }

    // Move cursor up 3 lines (border + content + spacing) and clear
    process.stdout.write('\x1b[3A') // Move up 3 lines
    process.stdout.write('\x1b[2K') // Clear line
    process.stdout.write('\n\x1b[2K') // Move down and clear line
    process.stdout.write('\n\x1b[2K') // Move down and clear line
    process.stdout.write('\n\x1b[2K') // Move down and clear line
    process.stdout.write('\x1b[3A') // Move back up to start position
  }

  private redraw(): void {
    if (this.isVisible && this.lastOutput) {
      this.clearPrevious()
      process.stdout.write(this.lastOutput)
    }
  }
}
