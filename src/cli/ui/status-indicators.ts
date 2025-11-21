import chalk from 'chalk'
import boxen from 'boxen'
import ora from 'ora'
import cliProgress from 'cli-progress'
import inquirer from 'inquirer'
import { formatStatus } from '../utils/text-wrapper'
import { advancedUI } from './advanced-cli-ui'
import { inputQueue } from '../core/input-queue'
import type { StatusIndicator, LiveUpdate } from '../types/nik-cli-types'

/**
 * StatusIndicators - Handles status indicators and progress display
 * Extracted from lines 1782-2300 in nik-cli.ts
 */
export class StatusIndicators {
  private nikCLI: any

  constructor(nikCLI: any) {
    this.nikCLI = nikCLI
  }

  createStatusIndicator(id: string, title: string, details?: string): StatusIndicator {
    const indicator: StatusIndicator = {
      id,
      title,
      status: 'pending',
      details,
      startTime: new Date(),
      subItems: [],
    }

    this.nikCLI.indicators.set(id, indicator)

    if (this.nikCLI.isInteractiveMode) {
      this.refreshDisplay()
    } else {
      console.log(formatStatus('📋', title, details))
    }

    return indicator
  }

  updateStatusIndicator(id: string, updates: Partial<StatusIndicator>): void {
    const indicator = this.nikCLI.indicators.get(id)
    if (!indicator) return

    Object.assign(indicator, updates)

    if (updates.status === 'completed' || updates.status === 'failed') {
      indicator.endTime = new Date()
    }

    if (this.nikCLI.isInteractiveMode) {
      this.refreshDisplay()
    } else {
      this.logStatusUpdate(indicator)
    }

    // Auto-clear ephemeral logs when the system becomes idle
    if (this.nikCLI.ephemeralLiveUpdates && this.isIdle()) {
      setTimeout(() => {
        if (this.isIdle()) {
          this.clearLiveUpdates()
          if (this.nikCLI.isInteractiveMode) this.refreshDisplay()
        }
      }, 250)
    }
  }

  addLiveUpdate(update: Omit<LiveUpdate, 'timestamp'>): void {
    const liveUpdate: LiveUpdate = {
      ...update,
      timestamp: new Date(),
    }

    this.nikCLI.liveUpdates.push(liveUpdate)

    // Keep only recent updates
    if (this.nikCLI.liveUpdates.length > 50) {
      this.nikCLI.liveUpdates = this.nikCLI.liveUpdates.slice(-50)
    }

    if (this.nikCLI.isInteractiveMode) {
      this.refreshDisplay()
    } else {
      this.printLiveUpdate(liveUpdate)
    }

    // Auto-clear ephemeral logs when idle
    if (this.nikCLI.ephemeralLiveUpdates && this.isIdle()) {
      setTimeout(() => {
        if (this.isIdle()) {
          this.clearLiveUpdates()
          if (this.nikCLI.isInteractiveMode) this.refreshDisplay()
        }
      }, 250)
    }

    // Ensure the prompt is restored below logs (live updates above the prompt)
    try {
      if (this.nikCLI.rl && !this.nikCLI.isInquirerActive) {
        if (this.nikCLI.isChatMode) {
          this.nikCLI.renderPromptAfterOutput()
        } else {
          // Keep legacy prompt stable without redrawing the entire header
          this.nikCLI.rl.prompt()
        }
      }
    } catch {
      /* noop */
    }
  }

  isIdle(): boolean {
    const anyRunning = Array.from(this.nikCLI.indicators.values()).some(
      (i) => i.status === 'running' || i.status === 'pending'
    )
    return !anyRunning && this.nikCLI.spinners.size === 0 && this.nikCLI.progressBars.size === 0
  }

  clearLiveUpdates(): void {
    this.nikCLI.liveUpdates = []
  }

  startAdvancedSpinner(id: string, text: string): void {
    if (this.nikCLI.isInteractiveMode) {
      this.updateStatusIndicator(id, { status: 'running' })
      return
    }

    const spinner = ora({
      text,
      spinner: 'dots',
      color: 'cyan',
    }).start()

    this.nikCLI.spinners.set(id, spinner)
  }

  stopAdvancedSpinner(id: string, success: boolean, finalText?: string): void {
    const spinner = this.nikCLI.spinners.get(id)
    if (spinner) {
      if (success) {
        this.nikCLI.isInteractiveMode ? (this.nikCLI.isInteractiveMode = false) : null, spinner.succeed(finalText)
      } else {
        this.nikCLI.isInteractiveMode = false
        spinner.fail(finalText)
      }
      this.nikCLI.spinners.delete(id)
    }

    this.updateStatusIndicator(id, {
      status: success ? 'completed' : 'failed',
      details: finalText,
    })
  }

  createAdvancedProgressBar(id: string, title: string, total: number): void {
    if (this.nikCLI.isInteractiveMode) {
      this.createStatusIndicator(id, title)
      this.updateStatusIndicator(id, { progress: 0 })
      return
    }

    const progressBar = new cliProgress.SingleBar({
      format: `${chalk.cyan(title)} |${chalk.cyan('{bar}')}| {percentage}% | {value}/{total} | ETA: {eta}s`,
      barCompleteChar: '█',
      barIncompleteChar: '░',
    })

    progressBar.start(total, 0)
    this.nikCLI.progressBars.set(id, progressBar)
  }

  updateAdvancedProgress(id: string, current: number, total?: number): void {
    const progressBar = this.nikCLI.progressBars.get(id)
    if (progressBar) {
      progressBar.update(current)
    }

    const progress = total ? Math.round((current / total) * 100) : current
    this.updateStatusIndicator(id, { progress })
  }

  completeAdvancedProgress(id: string, message?: string): void {
    const progressBar = this.nikCLI.progressBars.get(id)
    if (progressBar) {
      progressBar.stop()
      this.nikCLI.progressBars.delete(id)
    }

    this.updateStatusIndicator(id, {
      status: 'completed',
      progress: 100,
      details: message,
    })
  }

  async askAdvancedConfirmation(
    question: string,
    details?: string,
    defaultValue: boolean = false
  ): Promise<boolean> {
    const icon = defaultValue ? '✓' : '❓'
    const prompt = `${icon} ${chalk.cyan(question)}`

    if (details) {
      console.log(chalk.gray(`   ${details}`))
    }

    // Use inquirer for proper input handling with arrow key support
    inputQueue.enableBypass()

    try {
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'confirmed',
          message: prompt,
          choices: [
            { name: 'Yes', value: true },
            { name: 'No', value: false },
          ],
          default: defaultValue ? 0 : 1,
        },
      ])

      return answers.confirmed
    } catch {
      return defaultValue
    } finally {
      // Always disable bypass after approval
      inputQueue.disableBypass()
    }
  }

  refreshDisplay(): void {
    if (!this.nikCLI.isInteractiveMode) return

    // Move cursor to top and clear
    process.stdout.write('\x1B[2J\x1B[H')

    this.showAdvancedHeader()
    this.showActiveIndicators()
    this.showRecentUpdates()
  }

  showAdvancedHeader(): void {
    const header = boxen(
      `${chalk.cyanBright.bold('🔌 NikCLI')} ${chalk.gray('v0.3.1-beta')}\n` +
        `${chalk.gray('Autonomous AI Developer Assistant')}\n\n` +
        `${chalk.blue('Status:')} ${this.getOverallStatus()}  ${chalk.blue('Active Tasks:')} ${this.nikCLI.indicators.size}\n` +
        `${chalk.blue('Mode:')} ${this.nikCLI.currentMode}  ${chalk.blue('Live Updates:')} Enabled`,
      {
        padding: 1,
        margin: { top: 0, bottom: 1, left: 0, right: 0 },
        borderStyle: 'round',
        borderColor: 'cyan',
        titleAlignment: 'center',
      }
    )

    console.log(header)
  }

  showActiveIndicators(): void {
    const indicators = Array.from(this.nikCLI.indicators.values())

    if (indicators.length === 0) return

    console.log(chalk.blue.bold('📊 Active Tasks:'))
    console.log(chalk.gray('─'.repeat(60)))

    indicators.forEach((indicator) => {
      this.printIndicatorLine(indicator)
    })

    console.log()
  }

  showRecentUpdates(): void {
    if (this.nikCLI.cleanChatMode) return
    const recentUpdates = this.nikCLI.liveUpdates.slice(-10)

    if (recentUpdates.length === 0) return

    // Raggruppa updates per source
    const groupedUpdates = this.groupUpdatesBySource(recentUpdates)

    // Rendering strutturato per source
    for (const [source, updates] of groupedUpdates.entries()) {
      // Header del gruppo con ⏺
      const functionName = this.formatSourceAsFunctionName(source)
      console.log(chalk.cyan(`⏺ ${functionName}()`))

      // Updates del gruppo con ⎿
      updates.forEach((update) => {
        this.printLiveUpdateStructured(update)
      })

      console.log() // Spazio tra gruppi
    }
  }

  printIndicatorLine(indicator: StatusIndicator): void {
    const statusIcon = this.getStatusIcon(indicator.status)
    const duration = this.getDuration(indicator)

    let line = `${statusIcon} ${chalk.bold(indicator.title)}`

    if (indicator.progress !== undefined) {
      const progressBar = this.createProgressBarString(indicator.progress)
      line += ` ${progressBar}`
    }

    if (duration) {
      line += ` ${chalk.gray(`(${duration})`)}`
    }

    console.log(line)

    if (indicator.details) {
      console.log(`   ${chalk.gray(indicator.details)}`)
    }
  }

  printLiveUpdate(update: LiveUpdate): void {
    if (this.nikCLI.cleanChatMode) return
    const timeStr = update.timestamp.toLocaleTimeString()
    const typeColor = this.getUpdateTypeColor(update.type)
    const sourceStr = update.source ? chalk.gray(`[${update.source}]`) : ''

    const line = `${chalk.gray(timeStr)} ${sourceStr} ${typeColor(update.content)}`
    console.log(line)
  }

  printLiveUpdateStructured(update: LiveUpdate): void {
    const typeIcon = this.getStatusIconForUpdate(update.type)
    const color = this.getUpdateTypeColor(update.type)

    let content = color(update.content)

    // Se update ha metadata.progress, aggiungi progress bar
    if (update.metadata?.progress !== undefined) {
      const progress = update.metadata.progress
      const progressBar = this.createProgressBarString(progress, 20)
      content += ` ${progressBar}`
    }

    // Se update ha metadata.duration, aggiungi durata
    if (update.metadata?.duration) {
      content += ` ${chalk.gray(`(${update.metadata.duration})`)}`
    }

    // Rendering con tutto grigio scuro tranne il contenuto colorato
    console.log(`${chalk.dim('  ⎿  ')}${chalk.dim(typeIcon)} ${content}`)
  }

  getStatusIconForUpdate(type: LiveUpdate['type']): string {
    switch (type) {
      case 'log':
        return '✓'
      case 'status':
        return '⚡︎'
      case 'progress':
        return '▶'
      case 'error':
        return '❌'
      case 'warning':
        return '⚠️'
      case 'info':
        return 'ℹ'
      case 'step':
        return '●'
      case 'result':
        return '✓'
      default:
        return '○'
    }
  }

  groupUpdatesBySource(updates: LiveUpdate[]): Map<string, LiveUpdate[]> {
    const grouped = new Map<string, LiveUpdate[]>()

    for (const update of updates) {
      const source = update.source || 'System'
      if (!grouped.has(source)) {
        grouped.set(source, [])
      }
      grouped.get(source)!.push(update)
    }

    return grouped
  }

  formatSourceAsFunctionName(source: string): string {
    // "Guidance" -> "Guidance"
    // "Docs Cloud" -> "DocsCloud"
    // "System Init" -> "SystemInit"
    return source
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join('')
  }

  logStatusUpdate(indicator: StatusIndicator): void {
    if (this.nikCLI.cleanChatMode) return
    const statusIcon = this.getStatusIcon(indicator.status)
    const statusColor = this.getStatusColor(indicator.status)

    console.log(`${statusIcon} ${statusColor(indicator.title)}`)

    if (indicator.details) {
      console.log(`   ${chalk.gray(indicator.details)}`)
    }
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'pending':
        return '⏳'
      case 'running':
        return '⚡︎'
      case 'completed':
        return '✓'
      case 'failed':
        return '❌'
      case 'warning':
        return '⚠️'
      default:
        return '📋'
    }
  }

  getStatusColor(status: string): any {
    switch (status) {
      case 'pending':
        return chalk.gray
      case 'running':
        return chalk.blue
      case 'completed':
        return chalk.green
      case 'failed':
        return chalk.red
      case 'warning':
        return chalk.yellow
      default:
        return chalk.gray
    }
  }

  getUpdateTypeColor(type: string): any {
    switch (type) {
      case 'error':
        return chalk.red
      case 'warning':
        return chalk.yellow
      case 'info':
        return chalk.blue
      case 'log':
        return chalk.green
      default:
        return chalk.white
    }
  }

  createProgressBarString(progress: number, width: number = 20): string {
    // Usa caratteri Unicode per maggiore risoluzione
    const filledChar = '█'
    const emptyChar = '░'
    const partialChars = ['▏', '▎', '▍', '▌', '▋', '▊', '▉', '█']

    // Calcola porzione frazionaria
    const exactFilled = (progress / 100) * width
    const fullBlocks = Math.floor(exactFilled)
    const fraction = exactFilled - fullBlocks
    const partialIndex = Math.floor(fraction * partialChars.length)
    const partialChar = partialIndex > 0 ? partialChars[partialIndex] : ''

    // Costruisci barra
    const fullPart = filledChar.repeat(fullBlocks)
    const emptyPart = emptyChar.repeat(width - fullBlocks - (partialChar ? 1 : 0))
    const bar = fullPart + partialChar + emptyPart

    // Colore dinamico basato su progresso
    const colorFn =
      progress < 30 ? chalk.red : progress < 70 ? chalk.yellow : progress >= 100 ? chalk.green : chalk.cyan

    return `[${colorFn(bar)}] ${progress}%`
  }

  getDuration(indicator: StatusIndicator): string | null {
    if (!indicator.startTime) return null

    const endTime = indicator.endTime || new Date()
    const duration = endTime.getTime() - indicator.startTime.getTime()

    const seconds = Math.round(duration / 1000)
    if (seconds < 60) {
      return `${seconds}s`
    } else {
      const minutes = Math.floor(seconds / 60)
      const remainingSeconds = seconds % 60
      return `${minutes}m ${remainingSeconds}s`
    }
  }

  getOverallStatus(): string {
    const indicators = Array.from(this.nikCLI.indicators.values())

    if (indicators.length === 0) return chalk.gray('Idle')

    const hasRunning = indicators.some((i) => i.status === 'running')
    const hasFailed = indicators.some((i) => i.status === 'failed')
    const hasWarning = indicators.some((i) => i.status === 'warning')

    if (hasRunning) return chalk.blue('Running')
    if (hasFailed) return chalk.red('Failed')
    if (hasWarning) return chalk.yellow('Warning')

    return chalk.green('Ready')
  }
}
