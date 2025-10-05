/**
 * Benchmark Command Handler
 * Handles all /bench commands for the CLI
 */

import path from 'node:path'
import chalk from 'chalk'
import { modernAIProvider } from '../ai/modern-ai-provider'
import { advancedUI } from '../ui/advanced-cli-ui'
import { BenchmarkEngine } from './benchmark-engine'
import { ResultsManager } from './results-manager'
import type { BenchmarkConfig, BenchmarkTemplate } from './types'
import { HTMLGenerator } from './visualizations/html-generator'
import { PNGExporter } from './visualizations/png-exporter'
import { TerminalVisualizer } from './visualizations/terminal-visualizer'

export class BenchmarkCommandHandler {
  private engine: BenchmarkEngine
  private visualizer: TerminalVisualizer | null = null
  private resultsManager: ResultsManager
  private currentSessionId: string | null = null

  constructor() {
    this.engine = new BenchmarkEngine()
    this.resultsManager = new ResultsManager()
  }

  /**
   * Handle /bench commands
   */
  async handle(
    args: string[],
    modelExecutor: (prompt: string) => Promise<{
      output: string
      tokensUsed: { input: number; output: number; total: number }
      cost: number
    }>
  ): Promise<void> {
    const subcommand = args[0]?.toLowerCase()

    try {
      switch (subcommand) {
        case 'start':
          await this.handleStart(args.slice(1), modelExecutor)
          break
        case 'stop':
          await this.handleStop()
          break
        case 'pause':
          await this.handlePause()
          break
        case 'resume':
          await this.handleResume()
          break
        case 'status':
          await this.handleStatus()
          break
        case 'list':
          await this.handleList()
          break
        case 'results':
          await this.handleResults(args.slice(1))
          break
        case 'compare':
          await this.handleCompare(args.slice(1))
          break
        case 'export':
          await this.handleExport(args.slice(1))
          break
        default:
          this.showHelp()
      }
    } catch (error) {
      advancedUI.logError(`Benchmark command error: ${error instanceof Error ? error.message : String(error)}`)
      throw error // Re-throw to ensure CLI handles it properly
    }
  }

  /**
   * Start a new benchmark
   */
  private async handleStart(
    args: string[],
    modelExecutor: (prompt: string) => Promise<{
      output: string
      tokensUsed: { input: number; output: number; total: number }
      cost: number
    }>
  ): Promise<void> {
    const template = args[0] as BenchmarkTemplate
    if (!template || !['swe-bench', 'humaneval', 'mbpp', 'custom'].includes(template)) {
      advancedUI.logError('Invalid template. Choose: swe-bench, humaneval, mbpp, or custom')
      return
    }

    // Parse options
    const options = this.parseOptions(args.slice(1))
    // Always use the model currently selected in the CLI unless overridden explicitly
    const currentModel = modernAIProvider.getCurrentModel?.() || 'claude-3-5-sonnet-20241022'
    const model = options.model || currentModel
    const iterations = options.iterations ? Number.parseInt(options.iterations) : undefined
    const customDataset = options.dataset
    const simulate = options.simulate === 'true' || options.sim === 'true'
    const thinkMin = options.thinkmin ? Number.parseInt(options.thinkmin) : 200
    const thinkMax = options.thinkmax ? Number.parseInt(options.thinkmax) : 800

    if (template === 'custom' && !customDataset) {
      advancedUI.logError('Custom template requires --dataset=<path> option')
      return
    }

    const config: BenchmarkConfig = {
      template,
      model,
      iterations,
      customDataset,
      simulate,
      thinkTimeMs: { min: thinkMin, max: thinkMax },
      filters: {
        limit: iterations,
      },
    }

    advancedUI.logInfo('🚀 Starting Benchmark')
    advancedUI.logInfo(
      [
        `Template: ${chalk.yellow(template)}`,
        `Model: ${chalk.yellow(model)}`,
        iterations ? `Iterations: ${chalk.yellow(iterations)}` : undefined,
      ]
        .filter(Boolean)
        .join('\n')
    )

    try {
      // Wrap executor with optional artificial think time and simulation
      const wrappedExecutor = async (prompt: string) => {
        if (simulate) {
          // Simulate latency and produce dummy output without AI calls
          await this.sleep(this.rand(thinkMin, thinkMax))
          return {
            output: 'SIMULATED_OUTPUT',
            tokensUsed: { input: 0, output: 0, total: 0 },
            cost: 0,
          }
        }
        if (thinkMax > 0) {
          await this.sleep(this.rand(thinkMin, thinkMax))
        }
        return modelExecutor(prompt)
      }

      this.currentSessionId = await this.engine.start(config, wrappedExecutor)
      advancedUI.logInfo(`Using model: ${model}`)

      // Initialize visualizer
      this.visualizer = new TerminalVisualizer()
      this.visualizer.initialize()
      this.visualizer.log(`Started benchmark session: ${this.currentSessionId}`)

      // Setup event handlers
      this.setupEngineEvents()

      advancedUI.logSuccess('Benchmark started successfully')
      advancedUI.logInfo('Use /bench status to monitor progress')
      advancedUI.logInfo('Use /bench stop to stop the benchmark')
    } catch (error) {
      advancedUI.logError(`Failed to start benchmark: ${error instanceof Error ? error.message : String(error)}`)

      // Clean up visualizer if it was initialized
      if (this.visualizer) {
        this.visualizer.destroy()
        this.visualizer = null
      }

      throw error
    }
  }

  /**
   * Stop the current benchmark
   */
  private async handleStop(): Promise<void> {
    if (!this.currentSessionId) {
      advancedUI.logWarning('No benchmark is currently running')
      return
    }

    advancedUI.logInfo('⏹️  Stopping benchmark...')

    try {
      const session = await this.engine.stop()

      if (session && this.visualizer) {
        this.visualizer.showSummary(session)
        this.visualizer.destroy()
        this.visualizer = null
      }

      // Generate reports
      if (session) {
        await this.generateReports(session.id)
      }

      this.currentSessionId = null
      advancedUI.logSuccess('Benchmark stopped')
    } catch (error) {
      advancedUI.logError(`Error stopping benchmark: ${error instanceof Error ? error.message : String(error)}`)

      // Ensure cleanup
      if (this.visualizer) {
        this.visualizer.destroy()
        this.visualizer = null
      }
      this.currentSessionId = null

      throw error
    }
  }

  /**
   * Pause the current benchmark
   */
  private async handlePause(): Promise<void> {
    if (!this.currentSessionId) {
      advancedUI.logWarning('No benchmark is currently running')
      return
    }

    this.engine.pause()
    if (this.visualizer) {
      this.visualizer.log('Benchmark paused')
    }
    advancedUI.logInfo('⏸️  Benchmark paused')
  }

  /**
   * Resume the paused benchmark
   */
  private async handleResume(): Promise<void> {
    if (!this.currentSessionId) {
      advancedUI.logWarning('No benchmark is currently running')
      return
    }

    this.engine.resume()
    if (this.visualizer) {
      this.visualizer.log('Benchmark resumed')
    }
    advancedUI.logSuccess('▶️  Benchmark resumed')
  }

  /**
   * Show benchmark status
   */
  private async handleStatus(): Promise<void> {
    const session = this.engine.getCurrentSession()

    if (!session) {
      advancedUI.logWarning('No benchmark is currently running')
      return
    }

    if (this.visualizer) {
      this.visualizer.update(session)
    } else {
      // Show console status
      const progress = this.engine.getProgress()
      advancedUI.logInfo(
        [
          '📊 Benchmark Status',
          `Session: ${chalk.yellow(session.id)}`,
          `Status: ${chalk.yellow(session.status)}`,
          `Progress: ${chalk.yellow(`${progress.toFixed(2)}%`)}`,
          `Completed: ${chalk.yellow(`${session.completedTasks}/${session.totalTasks}`)}`,
        ].join('\n')
      )
    }
  }

  /**
   * List available templates
   */
  private async handleList(): Promise<void> {
    const templates = [
      {
        name: 'swe-bench',
        desc: 'Software Engineering Benchmark - Real-world GitHub issues',
        tasks: '20-50 tasks',
      },
      {
        name: 'humaneval',
        desc: 'Python code generation benchmark',
        tasks: '164 problems',
      },
      {
        name: 'mbpp',
        desc: 'Mostly Basic Programming Problems',
        tasks: '974 problems',
      },
      {
        name: 'custom',
        desc: 'User-defined tasks from JSON/YAML',
        tasks: 'Variable',
      },
    ]

    const lines = ['📋 Available Benchmark Templates', '']
    for (const t of templates) {
      lines.push(chalk.yellow.bold(`  ${t.name}`))
      lines.push(chalk.white(`    ${t.desc}`))
      lines.push(chalk.dim(`    Tasks: ${t.tasks}`))
      lines.push('')
    }
    lines.push(chalk.dim('Usage: /bench start <template> [--model=<name>] [--iterations=<n>]'))

    advancedUI.logInfo('Benchmark Templates')
    advancedUI.logInfo(lines.join('\n'))
  }

  /**
   * Show past results
   */
  private async handleResults(args: string[]): Promise<void> {
    const options = this.parseOptions(args)
    const sessionId = options.session

    if (sessionId) {
      // Show specific session
      const session = await this.resultsManager.loadSession(sessionId)
      if (!session) {
        advancedUI.logError(`Session ${sessionId} not found`)
        return
      }

      const visualizer = new TerminalVisualizer()
      visualizer.showSummary(session)
    } else {
      // List all sessions
      const sessions = await this.resultsManager.getAllSessions()

      if (sessions.length === 0) {
        advancedUI.logWarning('No benchmark sessions found')
        return
      }

      const lines = ['📊 Benchmark Sessions', '']
      for (const s of sessions.slice(-10)) {
        const status = this.getStatusIcon(s.status)
        lines.push(`${status} ${chalk.yellow(s.id)}`)
        lines.push(chalk.dim(`   Template: ${s.template} | Model: ${s.model}`))
        lines.push(
          chalk.dim(
            `   Tasks: ${s.completedTasks}/${s.totalTasks} | Success: ${(s.metrics.success.rate * 100).toFixed(2)}%`
          )
        )
        lines.push('')
      }
      lines.push(chalk.dim('Use /bench results --session=<id> to view details'))

      advancedUI.logInfo('Benchmark Results')
      advancedUI.logInfo(lines.join('\n'))
    }
  }

  /**
   * Compare two sessions
   */
  private async handleCompare(args: string[]): Promise<void> {
    if (args.length < 2) {
      advancedUI.logError('Usage: /bench compare <session1> <session2>')
      return
    }

    const [id1, id2] = args

    try {
      const comparison = await this.resultsManager.compareSessions(id1, id2)

      const lines = [
        '🔬 Benchmark Comparison',
        '',
        `Session 1: ${chalk.yellow(comparison.sessions[0].id)}`,
        `Session 2: ${chalk.yellow(comparison.sessions[1].id)}`,
        '',
        chalk.cyan.bold('Differences:'),
        `  Latency: ${this.formatDiff(comparison.differences.latencyDiff)}ms`,
        `  Tokens: ${this.formatDiff(comparison.differences.tokenDiff)}`,
        `  Cost: $${this.formatDiff(comparison.differences.costDiff)}`,
        `  Success Rate: ${this.formatDiff(comparison.differences.successRateDiff * 100)}%`,
        `  Accuracy: ${this.formatDiff(comparison.differences.accuracyDiff * 100)}%`,
        '',
        chalk.cyan.bold('Winners:'),
        `  Best Latency: ${chalk.green(comparison.winner.latency)}`,
        `  Lowest Cost: ${chalk.green(comparison.winner.cost)}`,
        `  Best Success: ${chalk.green(comparison.winner.successRate)}`,
        `  Best Accuracy: ${chalk.green(comparison.winner.accuracy)}`,
        `  Overall Winner: ${chalk.green.bold(comparison.winner.overall)}`,
      ]

      advancedUI.logInfo('Comparison Results')
      advancedUI.logInfo(lines.join('\n'))
    } catch (error) {
      advancedUI.logError(`Comparison failed: ${error}`)
    }
  }

  /**
   * Export session results
   */
  private async handleExport(args: string[]): Promise<void> {
    const options = this.parseOptions(args)
    const format = options.format || 'json'
    const sessionId = options.session || this.currentSessionId

    if (!sessionId) {
      advancedUI.logError('No session specified. Use --session=<id>')
      return
    }

    const outputDir = path.join(process.cwd(), 'benchmarks/results/sessions', sessionId)

    try {
      advancedUI.logInfo(`📤 Exporting session ${sessionId}...`)

      switch (format) {
        case 'json':
          await this.resultsManager.exportToJSON(sessionId, path.join(outputDir, 'export.json'))
          advancedUI.logSuccess(`Exported to ${outputDir}/export.json`)
          break
        case 'csv':
          await this.resultsManager.exportToCSV(sessionId, path.join(outputDir, 'export.csv'))
          advancedUI.logSuccess(`Exported to ${outputDir}/export.csv`)
          break
        case 'markdown':
        case 'md':
          await this.resultsManager.exportToMarkdown(sessionId, path.join(outputDir, 'report.md'))
          advancedUI.logSuccess(`Exported to ${outputDir}/report.md`)
          break
        case 'html':
          await this.generateReports(sessionId)
          advancedUI.logSuccess(`HTML report generated in ${outputDir}/`)
          break
        case 'png':
          await this.generateReports(sessionId)
          advancedUI.logSuccess(`PNG charts generated in ${outputDir}/charts/`)
          break
        case 'all':
          await this.generateReports(sessionId)
          await this.resultsManager.exportToJSON(sessionId, path.join(outputDir, 'export.json'))
          await this.resultsManager.exportToCSV(sessionId, path.join(outputDir, 'export.csv'))
          await this.resultsManager.exportToMarkdown(sessionId, path.join(outputDir, 'report.md'))
          advancedUI.logSuccess(`All formats exported to ${outputDir}/`)
          break
        default:
          advancedUI.logError(`Unknown format: ${format}\nAvailable: json, csv, markdown, html, png, all`)
      }
    } catch (error) {
      advancedUI.logError(`Export failed: ${error}`)
    }
  }

  /**
   * Generate HTML and PNG reports
   */
  private async generateReports(sessionId: string): Promise<void> {
    const session = await this.resultsManager.loadSession(sessionId)
    if (!session) return

    const outputDir = path.join(process.cwd(), 'benchmarks/results/sessions', sessionId)

    // Generate HTML
    const htmlGenerator = new HTMLGenerator()
    await htmlGenerator.generateReport(session, path.join(outputDir, 'report.html'))

    // Generate PNGs
    const pngExporter = new PNGExporter()
    await pngExporter.exportAll(session, path.join(outputDir, 'charts'))
  }

  /**
   * Setup engine event listeners
   */
  private setupEngineEvents(): void {
    this.engine.on('task-complete', (result, progress) => {
      if (this.visualizer) {
        this.visualizer.log(`✓ ${result.taskId} (${progress.toFixed(1)}%)`)
      }
    })

    this.engine.on('metrics-update', (metrics) => {
      const session = this.engine.getCurrentSession()
      if (session && this.visualizer) {
        this.visualizer.update(session)
      }
    })

    this.engine.on('complete', async (session) => {
      if (this.visualizer) {
        this.visualizer.log('✓ Benchmark complete!')
        this.visualizer.showSummary(session)
        this.visualizer.destroy()
        this.visualizer = null
      }

      await this.generateReports(session.id)
      this.currentSessionId = null
    })

    this.engine.on('error', (error) => {
      if (this.visualizer) {
        this.visualizer.log(`✗ Error: ${error.message}`)
      }
      advancedUI.logError(`Benchmark error: ${error.message}`)
    })
  }

  /**
   * Parse command options (--key=value format)
   */
  private parseOptions(args: string[]): Record<string, string> {
    const options: Record<string, string> = {}
    for (const arg of args) {
      if (arg.startsWith('--')) {
        const [key, value] = arg.slice(2).split('=')
        if (key && value) {
          options[key] = value
        }
      }
    }
    return options
  }

  /**
   * Get status icon
   */
  private getStatusIcon(status: string): string {
    switch (status) {
      case 'completed':
        return chalk.green('✓')
      case 'running':
        return chalk.blue('▶')
      case 'paused':
        return chalk.yellow('⏸')
      case 'failed':
      case 'stopped':
        return chalk.red('✗')
      default:
        return chalk.gray('○')
    }
  }

  // Local sleep utility for the handler
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private rand(min: number, max: number): number {
    if (max <= min) return min
    return Math.floor(Math.random() * (max - min + 1)) + min
  }

  /**
   * Format diff value with color
   */
  private formatDiff(value: number): string {
    if (value > 0) {
      return chalk.red(`+${value.toFixed(2)}`)
    }
    if (value < 0) {
      return chalk.green(`${value.toFixed(2)}`)
    }
    return chalk.gray('0')
  }

  /**
   * Show help
   */
  private showHelp(): void {
    const lines = [
      '🔬 Benchmark Commands',
      '',
      chalk.yellow('  /bench start <template>') + chalk.dim(' - Start a new benchmark'),
      chalk.dim('    Options: --model=<name> --iterations=<n> --dataset=<path>'),
      chalk.yellow('  /bench stop') + chalk.dim(' - Stop current benchmark'),
      chalk.yellow('  /bench pause') + chalk.dim(' - Pause current benchmark'),
      chalk.yellow('  /bench resume') + chalk.dim(' - Resume paused benchmark'),
      chalk.yellow('  /bench status') + chalk.dim(' - Show current benchmark status'),
      chalk.yellow('  /bench list') + chalk.dim(' - List available templates'),
      chalk.yellow('  /bench results') + chalk.dim(' - List past benchmark sessions'),
      chalk.dim('    Options: --session=<id>'),
      chalk.yellow('  /bench compare <id1> <id2>') + chalk.dim(' - Compare two sessions'),
      chalk.yellow('  /bench export') + chalk.dim(' - Export results'),
      chalk.dim('    Options: --session=<id> --format=<json|csv|html|png|all>'),
    ]

    advancedUI.logInfo('Benchmark Help')
    advancedUI.logInfo(lines.join('\n'))
  }
}
