/**
 * Terminal Visualizer
 * Real-time visualization using blessed and blessed-contrib
 */

import blessed from 'blessed'
import contrib from 'blessed-contrib'
import chalk from 'chalk'
import type { BenchmarkMetrics, BenchmarkSession } from '../types'

export class TerminalVisualizer {
  private screen: blessed.Widgets.Screen | null = null
  private grid: any
  private widgets: {
    latencyLine?: any
    successBar?: any
    progressGauge?: any
    metricsTable?: any
    logBox?: any
  } = {}

  /**
   * Initialize the terminal UI
   */
  initialize(): void {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'NikCLI Benchmark Monitor',
    })

    // Create grid layout
    this.grid = new contrib.grid({ rows: 12, cols: 12, screen: this.screen })

    // Latency line chart (top left)
    this.widgets.latencyLine = this.grid.set(0, 0, 4, 6, contrib.line, {
      style: {
        line: 'yellow',
        text: 'green',
        baseline: 'black',
      },
      showNthLabel: 5,
      label: 'Latency (ms)',
      showLegend: true,
      legend: { width: 12 },
    })

    // Success rate bar chart (top right)
    this.widgets.successBar = this.grid.set(0, 6, 4, 6, contrib.bar, {
      label: 'Success Rate',
      barWidth: 4,
      barSpacing: 6,
      xOffset: 0,
      maxHeight: 100,
    })

    // Progress gauge (middle left)
    this.widgets.progressGauge = this.grid.set(4, 0, 2, 6, contrib.gauge, {
      label: 'Overall Progress',
      stroke: 'green',
      fill: 'white',
    })

    // Metrics table (middle right)
    this.widgets.metricsTable = this.grid.set(4, 6, 4, 6, contrib.table, {
      keys: true,
      fg: 'white',
      selectedFg: 'white',
      selectedBg: 'blue',
      interactive: false,
      label: 'Current Metrics',
      width: '100%',
      height: '100%',
      columnSpacing: 3,
      columnWidth: [20, 20],
    })

    // Log box (bottom)
    this.widgets.logBox = this.grid.set(6, 0, 6, 12, contrib.log, {
      fg: 'green',
      selectedFg: 'green',
      label: 'Execution Log',
    })

    // Key bindings
    this.screen.key(['escape', 'q', 'C-c'], () => {
      this.destroy()
      process.exit(0)
    })

    this.screen.render()
  }

  /**
   * Update all widgets with current session data
   */
  update(session: BenchmarkSession): void {
    if (!this.screen) return

    const metrics = session.metrics

    // Update latency chart
    this.updateLatencyChart(metrics)

    // Update success rate bar
    this.updateSuccessBar(metrics)

    // Update progress gauge
    this.updateProgressGauge(session)

    // Update metrics table
    this.updateMetricsTable(metrics)

    this.screen.render()
  }

  /**
   * Add log entry
   */
  log(message: string): void {
    if (this.widgets.logBox) {
      this.widgets.logBox.log(message)
    }
  }

  /**
   * Update latency line chart
   */
  private updateLatencyChart(metrics: BenchmarkMetrics): void {
    if (!this.widgets.latencyLine) return

    const values = metrics.latency.values.slice(-50) // Last 50 values
    const labels = values.map((_, i) => (i + 1).toString())

    this.widgets.latencyLine.setData([
      {
        title: 'Latency',
        x: labels,
        y: values,
        style: { line: 'yellow' },
      },
      {
        title: `P95: ${metrics.latency.p95.toFixed(2)}ms`,
        x: labels,
        y: new Array(values.length).fill(metrics.latency.p95),
        style: { line: 'red' },
      },
    ])
  }

  /**
   * Update success rate bar chart
   */
  private updateSuccessBar(metrics: BenchmarkMetrics): void {
    if (!this.widgets.successBar) return

    this.widgets.successBar.setData({
      titles: ['Passed', 'Failed'],
      data: [metrics.success.passed, metrics.success.failed],
    })
  }

  /**
   * Update progress gauge
   */
  private updateProgressGauge(session: BenchmarkSession): void {
    if (!this.widgets.progressGauge) return

    const progress = (session.completedTasks / session.totalTasks) * 100

    this.widgets.progressGauge.setPercent(Math.round(progress))
  }

  /**
   * Update metrics table
   */
  private updateMetricsTable(metrics: BenchmarkMetrics): void {
    if (!this.widgets.metricsTable) return

    const data = [
      ['Metric', 'Value'],
      ['Total Tasks', metrics.success.total.toString()],
      ['Success Rate', `${(metrics.success.rate * 100).toFixed(2)}%`],
      ['Avg Latency', `${metrics.latency.avg.toFixed(2)}ms`],
      ['P95 Latency', `${metrics.latency.p95.toFixed(2)}ms`],
      ['Total Tokens', metrics.tokens.total.toLocaleString()],
      ['Total Cost', `$${metrics.cost.total.toFixed(4)}`],
      ['Avg Accuracy', `${(metrics.accuracy.avg * 100).toFixed(2)}%`],
      ['Memory Peak', this.formatBytes(metrics.resources.memoryPeak)],
      ['CPU Avg', `${metrics.resources.cpuAvg.toFixed(2)}%`],
      ['Error Rate', `${(metrics.errors.rate * 100).toFixed(2)}%`],
    ]

    this.widgets.metricsTable.setData({
      headers: ['Metric', 'Value'],
      data: data.slice(1),
    })
  }

  /**
   * Show summary screen
   */
  showSummary(session: BenchmarkSession): void {
    if (!this.screen) return

    // Clear screen
    this.screen.destroy()
    this.screen = null

    // Print summary to console
    console.log(chalk.cyan.bold('\n📊 Benchmark Complete!\n'))
    console.log(chalk.white('Session ID: ') + chalk.yellow(session.id))
    console.log(chalk.white('Template: ') + chalk.yellow(session.template))
    console.log(chalk.white('Model: ') + chalk.yellow(session.model))
    console.log(chalk.white('Status: ') + this.getStatusColor(session.status))
    console.log('')

    const m = session.metrics

    console.log(chalk.cyan.bold('📈 Results:'))
    console.log(
      chalk.white(
        `  Tasks: ${m.success.total} total | ${chalk.green(m.success.passed + ' passed')} | ${chalk.red(m.success.failed + ' failed')}`
      )
    )
    console.log(
      chalk.white(
        `  Success Rate: ${m.success.rate >= 0.8 ? chalk.green : m.success.rate >= 0.5 ? chalk.yellow : chalk.red}(${(m.success.rate * 100).toFixed(2)}%)`
      )
    )
    console.log('')

    console.log(chalk.cyan.bold('⚡ Performance:'))
    console.log(
      chalk.white(
        `  Latency: avg ${chalk.yellow(m.latency.avg.toFixed(2) + 'ms')} | p50 ${m.latency.p50.toFixed(2)}ms | p95 ${m.latency.p95.toFixed(2)}ms`
      )
    )
    console.log(
      chalk.white(
        `  Tokens: ${chalk.yellow(m.tokens.total.toLocaleString())} total | ${m.tokens.avgPerTask.toFixed(0)} avg/task`
      )
    )
    console.log(
      chalk.white(
        `  Cost: ${chalk.yellow('$' + m.cost.total.toFixed(4))} total | $${m.cost.avgPerTask.toFixed(4)} avg/task`
      )
    )
    console.log('')

    console.log(chalk.cyan.bold('🎯 Quality:'))
    console.log(
      chalk.white(
        `  Accuracy: ${chalk.yellow((m.accuracy.avg * 100).toFixed(2) + '%')} avg | ${m.accuracy.min * 100}% min | ${m.accuracy.max * 100}% max`
      )
    )
    console.log(chalk.white(`  Errors: ${m.errors.total} (${(m.errors.rate * 100).toFixed(2)}%)`))
    console.log('')

    console.log(chalk.cyan.bold('💾 Resources:'))
    console.log(
      chalk.white(
        `  Memory: ${chalk.yellow(this.formatBytes(m.resources.memoryPeak))} peak | ${this.formatBytes(m.resources.memoryAvg)} avg`
      )
    )
    console.log(
      chalk.white(
        `  CPU: ${chalk.yellow(m.resources.cpuPeak.toFixed(2) + '%')} peak | ${m.resources.cpuAvg.toFixed(2)}% avg`
      )
    )
    console.log('')

    if (m.timing.duration) {
      const duration = m.timing.duration / 1000
      console.log(chalk.white(`Duration: ${chalk.yellow(duration.toFixed(2) + 's')}`))
    }

    console.log(chalk.dim(`\nResults saved to: benchmarks/results/sessions/${session.id}/`))
    console.log('')
  }

  /**
   * Destroy the UI
   */
  destroy(): void {
    if (this.screen) {
      this.screen.destroy()
      this.screen = null
    }
  }

  /**
   * Format bytes to human readable
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`
  }

  /**
   * Get colored status string
   */
  private getStatusColor(status: string): string {
    switch (status) {
      case 'completed':
        return chalk.green(status)
      case 'running':
        return chalk.blue(status)
      case 'paused':
        return chalk.yellow(status)
      case 'failed':
      case 'stopped':
        return chalk.red(status)
      default:
        return chalk.gray(status)
    }
  }
}
