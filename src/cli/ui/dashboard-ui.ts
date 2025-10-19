import blessed from 'blessed'
import type { DashboardMetrics } from '../core/dashboard-metrics'

// ASCII Chart helpers
class ASCIIChart {
  static createBarChart(data: number[], width: number = 50, height: number = 10): string {
    if (data.length === 0) return 'No data'

    const max = Math.max(...data)
    const min = Math.min(...data)
    const range = max - min || 1

    const lines: string[] = []

    // Create horizontal bars
    for (let i = height - 1; i >= 0; i--) {
      const threshold = min + (range * i / (height - 1))
      let line = ''

      for (let j = 0; j < Math.min(data.length, width); j++) {
        if (data[j] >= threshold) {
          line += '█'
        } else {
          line += ' '
        }
      }
      lines.push(line)
    }

    return lines.join('\n')
  }

  static createLineChart(data: number[], width: number = 50, height: number = 8): string {
    if (data.length < 2) return 'Insufficient data'

    const max = Math.max(...data)
    const min = Math.min(...data)
    const range = max - min || 1

    const chart: string[][] = Array(height).fill(null).map(() => Array(width).fill(' '))

    // Plot data points
    for (let i = 0; i < Math.min(data.length - 1, width); i++) {
      const x1 = i
      const y1 = Math.round((height - 1) * (1 - (data[i] - min) / range))
      const x2 = i + 1
      const y2 = Math.round((height - 1) * (1 - (data[i + 1] - min) / range))

      // Simple line drawing
      const steps = Math.abs(x2 - x1) + Math.abs(y2 - y1)
      for (let step = 0; step <= steps; step++) {
        const x = Math.round(x1 + (x2 - x1) * step / steps)
        const y = Math.round(y1 + (y2 - y1) * step / steps)
        if (x >= 0 && x < width && y >= 0 && y < height) {
          chart[y][x] = '●'
        }
      }
    }

    return chart.map(row => row.join('')).join('\n')
  }

  static createProgressBar(value: number, max: number, width: number = 30, style: 'filled' | 'gradient' | 'blocks' = 'filled'): string {
    const percentage = Math.min(value / max, 1)
    const filled = Math.round(width * percentage)
    const empty = width - filled

    switch (style) {
      case 'gradient':
        const chars = ['░', '▒', '▓', '█']
        let bar = ''
        for (let i = 0; i < width; i++) {
          const pos = i / width
          if (pos <= percentage) {
            const intensity = Math.min(Math.floor((pos / percentage) * chars.length), chars.length - 1)
            bar += chars[intensity]
          } else {
            bar += '░'
          }
        }
        return bar

      case 'blocks':
        return '█'.repeat(filled) + '▒'.repeat(empty)

      default: // filled
        return '█'.repeat(filled) + '░'.repeat(empty)
    }
  }

  static createSparkline(data: number[], width: number = 20): string {
    if (data.length === 0) return '─'.repeat(width)

    const max = Math.max(...data)
    const min = Math.min(...data)
    const range = max - min || 1

    const sparks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']

    return data.slice(-width).map(value => {
      const normalized = (value - min) / range
      const index = Math.floor(normalized * (sparks.length - 1))
      return sparks[Math.max(0, Math.min(index, sparks.length - 1))]
    }).join('')
  }
}

export class DashboardUI {
  private screen: blessed.Widgets.Screen
  private headerBox: any
  private tabBar: any
  private contentBox: any
  private footerBox: any
  private currentTab = 0
  private tabs = ['Overview', 'Agents', 'Performance', 'History']
  private exitCallback?: () => void
  private refreshCallback?: () => Promise<void>
  private currentMetrics?: DashboardMetrics
  private originalStdinRawMode?: boolean

  // Historical data for charts
  private cpuHistory: number[] = []
  private memoryHistory: number[] = []
  private responseTimeHistory: number[] = []
  private tokenUsageHistory: number[] = []
  private maxHistoryPoints = 50

  constructor() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'NikCLI Dashboard',
      mouse: false,
      sendFocus: false,
      forceUnicode: false,
      input: process.stdin,
      output: process.stdout,
      terminal: 'xterm-256color',
      fullUnicode: false,
      dockBorders: true,
      ignoreDockContrast: true
    })

    // Store original stdin state
    this.originalStdinRawMode = process.stdin.isRaw

    // Set up proper input handling
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true)
      process.stdin.resume()
    }

    this.setupLayout()
    this.setupKeyHandlers()
  }

  private setupLayout(): void {
    this.headerBox = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: this.getHeaderContent(),
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        bg: 'blue',
        border: {
          fg: 'cyan'
        }
      }
    })

    this.tabBar = blessed.box({
      parent: this.screen,
      top: 3,
      left: 0,
      width: '100%',
      height: 3,
      border: {
        type: 'line'
      },
      style: {
        border: {
          fg: 'cyan'
        }
      }
    })

    this.contentBox = blessed.box({
      parent: this.screen,
      top: 6,
      left: 0,
      width: '100%',
      height: '100%-9',
      border: {
        type: 'line'
      },
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
      style: {
        border: {
          fg: 'cyan'
        }
      }
    })

    this.footerBox = blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: this.getFooterContent(),
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'cyan'
        }
      }
    })
  }

  private setupKeyHandlers(): void {
    this.screen.key(['escape', 'q', 'C-c'], () => {
      this.exitCallback?.()
    })

    this.screen.key(['tab'], () => {
      this.currentTab = (this.currentTab + 1) % this.tabs.length
      this.updateTabBar()
      this.updateContent()
      this.screen.render()
    })

    this.screen.key(['1'], () => this.switchTab(0))
    this.screen.key(['2'], () => this.switchTab(1))
    this.screen.key(['3'], () => this.switchTab(2))
    this.screen.key(['4'], () => this.switchTab(3))

    this.screen.key(['r'], async () => {
      if (this.refreshCallback) {
        await this.refreshCallback()
      }
    })

    this.screen.key(['h', '?'], () => {
      this.showHelp()
    })
  }


  private switchTab(index: number): void {
    if (index >= 0 && index < this.tabs.length) {
      this.currentTab = index
      this.updateTabBar()
      this.updateContent()
      this.screen.render()
    }
  }

  private getHeaderContent(): string {
    const now = new Date()
    const time = now.toLocaleTimeString()
    return ` NikCLI Enterprise Dashboard - ${time} - Expanded Mode `
  }

  private getFooterContent(): string {
    return ' [Tab] Switch • [1-4] Tabs • [r] Refresh • [↑↓] Scroll • [h/?] Help • [q/Esc] Exit '
  }

  private updateTabBar(): void {
    const terminalWidth = (this.screen.width as number) - 4 // Account for borders
    const tabWidth = Math.floor(terminalWidth / this.tabs.length)

    let tabContent = ' '
    this.tabs.forEach((tab, index) => {
      const isActive = index === this.currentTab
      const tabText = isActive ? `[${tab}]` : ` ${tab} `

      // Center the tab text within its allocated space
      const padding = Math.max(0, tabWidth - tabText.length)
      const leftPad = Math.floor(padding / 2)
      const rightPad = padding - leftPad

      tabContent += ' '.repeat(leftPad) + tabText + ' '.repeat(rightPad)
    })

    this.tabBar.setContent(tabContent)
  }

  private updateContent(): void {
    if (!this.currentMetrics) {
      this.contentBox.setContent('Loading metrics...')
      return
    }

    let content = ''
    switch (this.currentTab) {
      case 0:
        content = this.renderOverviewTab(this.currentMetrics)
        break
      case 1:
        content = this.renderAgentsTab(this.currentMetrics)
        break
      case 2:
        content = this.renderPerformanceTab(this.currentMetrics)
        break
      case 3:
        content = this.renderHistoryTab(this.currentMetrics)
        break
    }

    this.contentBox.setContent(content)
  }

  private renderOverviewTab(metrics: DashboardMetrics): string {
    const uptime = this.formatUptime(metrics.performance.uptime)
    const memUsage = ((metrics.performance.memory.used / metrics.performance.memory.total) * 100).toFixed(1)

    // Create visual progress bars
    const cpuBar = ASCIIChart.createProgressBar(metrics.performance.cpu, 100, 40, 'gradient')
    const memBar = ASCIIChart.createProgressBar(parseFloat(memUsage), 100, 40, 'gradient')
    const cacheBar = ASCIIChart.createProgressBar(metrics.ai.cacheHitRate, 100, 40, 'blocks')

    // Create sparklines for trends
    const cpuSparkline = this.cpuHistory.length > 1 ? ASCIIChart.createSparkline(this.cpuHistory, 30) : '─'.repeat(30)
    const memSparkline = this.memoryHistory.length > 1 ? ASCIIChart.createSparkline(this.memoryHistory, 30) : '─'.repeat(30)

    return `
 ┌─ SYSTEM OVERVIEW ─────────────────────────────────────────────────────────┐
 │                                                                           │
 │ 🤖 AGENTS                                                                 │
 │ Active: ${metrics.agents.busyCount}/${metrics.agents.total}     Running: ${metrics.agents.tasks.running}     Queued: ${metrics.agents.tasks.queued}     Completed: ${metrics.agents.tasks.completed}  │
 │                                                                           │
 │ 🚀 CPU USAGE                                     📊 TREND (30 samples)   │
 │ ${cpuBar} ${metrics.performance.cpu.toString().padStart(3)}%  │ ${cpuSparkline} │
 │                                                                           │
 │ 💾 MEMORY USAGE                                  📊 TREND (30 samples)   │
 │ ${memBar} ${memUsage}%  │ ${memSparkline} │
 │ ${metrics.performance.memory.used}GB / ${metrics.performance.memory.total}GB available                                           │
 │                                                                           │
 │ ⏱️ UPTIME: ${uptime.padEnd(20)} 🌡️ HEALTH: ${this.getHealthStatusWithIcon(metrics).padEnd(15)} │
 └───────────────────────────────────────────────────────────────────────────┘

 ┌─ AI USAGE ANALYTICS ──────────────────────────────────────────────────────┐
 │                                                                           │
 │ 🔤 Tokens: ${this.formatNumber(metrics.ai.totalTokens).padEnd(12)} 💰 Cost: $${metrics.ai.totalCost.toFixed(2).padEnd(8)} 📈 Req/min: ${metrics.ai.requestsPerMin.toString().padEnd(4)} │
 │                                                                           │
 │ 📊 Cache Hit Rate                                                         │
 │ ${cacheBar} ${metrics.ai.cacheHitRate}%    │
 │                                                                           │
 │ 🔥 Token Growth: ${this.tokenUsageHistory.length > 1 ? ASCIIChart.createSparkline(this.tokenUsageHistory, 40) : '─'.repeat(40)} │
 └───────────────────────────────────────────────────────────────────────────┘

 ┌─ TOOLS ANALYTICS ─────────────────────────────────────────────────────────┐
 │                                                                           │
 │ ✅ Success Rate: ${metrics.tools.successRate}%                                               │
 │                                                                           │
 │ 🔧 Most Used Tools:                                                       │
${metrics.tools.mostUsed.map(tool => ` │  • ${tool.name.padEnd(25)} ${ASCIIChart.createProgressBar(tool.count, Math.max(...metrics.tools.mostUsed.map(t => t.count)), 20, 'blocks')} ${tool.count}`).join('\n')}
 └───────────────────────────────────────────────────────────────────────────┘
    `
  }

  private getHealthStatusWithIcon(metrics: DashboardMetrics): string {
    const memUsage = (metrics.performance.memory.used / metrics.performance.memory.total) * 100

    if (metrics.performance.cpu > 80 || memUsage > 80) {
      return '🔴 Critical'
    } else if (metrics.performance.cpu > 60 || memUsage > 60) {
      return '🟡 Warning'
    } else {
      return '🟢 Healthy'
    }
  }

  private renderAgentsTab(metrics: DashboardMetrics): string {
    const header = ' ACTIVE AGENTS\n ═══════════════════════════════════════════════════════════════════════════════\n\n'

    if (metrics.agents.active.length === 0) {
      return header + ' No active agents\n'
    }

    const agentRows = metrics.agents.active.map(agent => {
      const status = agent.status === 'busy' ? '🟢' : agent.status === 'error' ? '🔴' : '⚫'
      const uptime = this.formatUptime(agent.uptime)
      const task = agent.currentTask ? agent.currentTask.substring(0, 30) + '...' : 'idle'

      return ` ${status} ${agent.name.padEnd(20)} ${agent.status.padEnd(8)} ${uptime.padEnd(12)} ${task}`
    })

    const tableHeader = ' St Name                 Status   Uptime       Current Task\n'
    const separator = ' ─────────────────────────────────────────────────────────────────────────────\n'

    return header + tableHeader + separator + agentRows.join('\n') + '\n\n' +
      ` Total: ${metrics.agents.total} | Active: ${metrics.agents.busyCount} | Completed Tasks: ${metrics.agents.tasks.completed}`
  }

  private renderPerformanceTab(metrics: DashboardMetrics): string {
    const memUsagePercent = (metrics.performance.memory.used / metrics.performance.memory.total) * 100
    const avgResponseTime = metrics.performance.responseTimes.length > 0
      ? metrics.performance.responseTimes.reduce((a, b) => a + b, 0) / metrics.performance.responseTimes.length
      : 0

    // Create detailed charts
    const cpuChart = this.cpuHistory.length > 2 ? ASCIIChart.createLineChart(this.cpuHistory, 60, 8) : 'Collecting data...'
    const memoryChart = this.memoryHistory.length > 2 ? ASCIIChart.createLineChart(this.memoryHistory, 60, 8) : 'Collecting data...'
    const responseChart = this.responseTimeHistory.length > 2 ? ASCIIChart.createLineChart(this.responseTimeHistory, 60, 8) : 'Collecting data...'

    return `
 ┌─ PERFORMANCE ANALYTICS ───────────────────────────────────────────────────┐
 │                                                                           │
 │ 🚀 CPU USAGE OVER TIME                                                   │
 │ ┌─────────────────────────────────────────────────────────────────────┐   │
 │ │${cpuChart.split('\n').map(line => line.padEnd(61)).join('│\n │ │')}│   │
 │ └─────────────────────────────────────────────────────────────────────┘   │
 │ Current: ${metrics.performance.cpu}%    Min: ${Math.min(...this.cpuHistory).toFixed(1)}%    Max: ${Math.max(...this.cpuHistory).toFixed(1)}%    Avg: ${(this.cpuHistory.reduce((a, b) => a + b, 0) / this.cpuHistory.length || 0).toFixed(1)}%      │
 │                                                                           │
 │ 💾 MEMORY USAGE OVER TIME                                                │
 │ ┌─────────────────────────────────────────────────────────────────────┐   │
 │ │${memoryChart.split('\n').map(line => line.padEnd(61)).join('│\n │ │')}│   │
 │ └─────────────────────────────────────────────────────────────────────┘   │
 │ Current: ${memUsagePercent.toFixed(1)}%  Available: ${(metrics.performance.memory.total - metrics.performance.memory.used).toFixed(1)}GB  Total: ${metrics.performance.memory.total}GB     │
 │                                                                           │
 │ ⚡ RESPONSE TIMES OVER TIME                                               │
 │ ┌─────────────────────────────────────────────────────────────────────┐   │
 │ │${responseChart.split('\n').map(line => line.padEnd(61)).join('│\n │ │')}│   │
 │ └─────────────────────────────────────────────────────────────────────┘   │
 │ Current: ${avgResponseTime.toFixed(0)}ms  Recent samples: ${metrics.performance.responseTimes.length}               │
 │                                                                           │
 │ 🔄 CACHE & AI PERFORMANCE                                                │
 │ Cache Hit Rate: ${ASCIIChart.createProgressBar(metrics.ai.cacheHitRate, 100, 30, 'gradient')} ${metrics.ai.cacheHitRate}%     │
 │ Requests/min:   ${ASCIIChart.createProgressBar(metrics.ai.requestsPerMin, 60, 30, 'blocks')} ${metrics.ai.requestsPerMin}      │
 └───────────────────────────────────────────────────────────────────────────┘

 ┌─ RECENT RESPONSE TIMES ───────────────────────────────────────────────────┐
${this.renderEnhancedResponseTimeChart(metrics.performance.responseTimes)}
 └───────────────────────────────────────────────────────────────────────────┘
    `
  }

  private renderEnhancedResponseTimeChart(responseTimes: number[]): string {
    if (responseTimes.length === 0) return ' │ No response time data available                                           │'

    const maxTime = Math.max(...responseTimes)
    const minTime = Math.min(...responseTimes)
    const avgTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length

    const chart = responseTimes.slice(-15).map((time, index) => {
      const barLength = Math.max(1, Math.round((time / (maxTime || 1)) * 40))
      const bar = '█'.repeat(barLength)
      const timeStr = time.toString().padStart(4)
      return ` │ ${(index + 1).toString().padStart(2)}: ${bar.padEnd(40)} ${timeStr}ms                   │`
    }).join('\n')

    return ` │ Stats: Min ${minTime}ms | Max ${maxTime}ms | Avg ${avgTime.toFixed(0)}ms | Samples ${responseTimes.length}          │\n │                                                                           │\n${chart}`
  }

  private renderHistoryTab(metrics: DashboardMetrics): string {
    return `
 ACTIVITY HISTORY
 ═══════════════════════════════════════════════════════════════════════════════

 Recent Activity:

 📊 Tasks Completed: ${metrics.agents.tasks.completed}
 🤖 Active Agents: ${metrics.agents.busyCount}/${metrics.agents.total}
 💰 Total Spend: $${metrics.ai.totalCost.toFixed(2)}
 🔤 Tokens Used: ${this.formatNumber(metrics.ai.totalTokens)}

 Tool Usage Summary:
${metrics.tools.mostUsed.map(tool => ` • ${tool.name}: ${tool.count} uses`).join('\n')}

 Performance Trends:
 • Average Response Time: ${metrics.performance.responseTimes.length > 0
        ? (metrics.performance.responseTimes.reduce((a, b) => a + b, 0) / metrics.performance.responseTimes.length).toFixed(0) + 'ms'
        : 'N/A'}
 • Memory Usage: ${((metrics.performance.memory.used / metrics.performance.memory.total) * 100).toFixed(1)}%
 • CPU Usage: ${metrics.performance.cpu}%
    `
  }

  private createProgressBar(value: number, max: number, width: number): string {
    const percentage = Math.min(value / max, 1)
    const filled = Math.round(width * percentage)
    const empty = width - filled

    return `[${'█'.repeat(filled)}${' '.repeat(empty)}] ${value.toFixed(1)}%`
  }

  private renderResponseTimeChart(responseTimes: number[]): string {
    if (responseTimes.length === 0) return ' No data available'

    const maxTime = Math.max(...responseTimes)
    const scale = 20 / (maxTime || 1)

    return responseTimes.slice(-10).map((time, index) => {
      const barLength = Math.max(1, Math.round(time * scale))
      const bar = '█'.repeat(barLength)
      return ` ${index.toString().padStart(2)}: ${bar} ${time}ms`
    }).join('\n')
  }

  private formatUptime(uptime: number): string {
    const seconds = Math.floor(uptime / 1000) % 60
    const minutes = Math.floor(uptime / (1000 * 60)) % 60
    const hours = Math.floor(uptime / (1000 * 60 * 60))

    if (hours > 0) {
      return `${hours}h ${minutes}m`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`
    } else {
      return `${seconds}s`
    }
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

  private getHealthStatus(metrics: DashboardMetrics): string {
    const memUsage = (metrics.performance.memory.used / metrics.performance.memory.total) * 100

    if (metrics.performance.cpu > 80 || memUsage > 80) {
      return '🔴 Critical'
    } else if (metrics.performance.cpu > 60 || memUsage > 60) {
      return '🟡 Warning'
    } else {
      return '🟢 Healthy'
    }
  }

  private showHelp(): void {
    const helpText = `
 DASHBOARD CONTROLS
 ═══════════════════════════════════════════════════════════════════════════════

 Navigation:
   Tab         → Next tab
   1, 2, 3, 4  → Jump to specific tab
   ↑↓          → Scroll content (in History tab)

 Actions:
   r           → Refresh data
   h, ?        → Show this help
   q, Esc      → Exit dashboard

 Tabs:
   1. Overview    → System summary and health status
   2. Agents      → Active agents and their current tasks
   3. Performance → CPU, memory, and response time metrics
   4. History     → Activity log and usage trends

 💡 Tip: Use number keys (1-4) to quickly switch between sections!

 Press any key to close this help...
    `

    const helpBox = blessed.box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '80%',
      height: '80%',
      content: helpText,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'yellow'
        }
      }
    })

    helpBox.focus()
    helpBox.key(['escape', 'q', 'enter', 'space'], () => {
      helpBox.destroy()
      this.screen.render()
    })

    this.screen.render()
  }

  public render(metrics: DashboardMetrics): void {
    this.currentMetrics = metrics
    this.updateHistoricalData(metrics)
    this.headerBox.setContent(this.getHeaderContent())
    this.updateTabBar()
    this.updateContent()
    this.screen.render()
  }

  private updateHistoricalData(metrics: DashboardMetrics): void {
    // Update CPU history
    this.cpuHistory.push(metrics.performance.cpu)
    if (this.cpuHistory.length > this.maxHistoryPoints) {
      this.cpuHistory.shift()
    }

    // Update memory history
    const memoryUsagePercent = (metrics.performance.memory.used / metrics.performance.memory.total) * 100
    this.memoryHistory.push(memoryUsagePercent)
    if (this.memoryHistory.length > this.maxHistoryPoints) {
      this.memoryHistory.shift()
    }

    // Update response time history (average)
    const avgResponseTime = metrics.performance.responseTimes.length > 0
      ? metrics.performance.responseTimes.reduce((a, b) => a + b, 0) / metrics.performance.responseTimes.length
      : 0
    this.responseTimeHistory.push(avgResponseTime)
    if (this.responseTimeHistory.length > this.maxHistoryPoints) {
      this.responseTimeHistory.shift()
    }

    // Update token usage history
    this.tokenUsageHistory.push(metrics.ai.totalTokens)
    if (this.tokenUsageHistory.length > this.maxHistoryPoints) {
      this.tokenUsageHistory.shift()
    }
  }

  public updateMetrics(metrics: DashboardMetrics): void {
    this.currentMetrics = metrics
    this.headerBox.setContent(this.getHeaderContent())
    this.updateContent()
    this.screen.render()
  }

  public onExit(callback: () => void): void {
    this.exitCallback = callback
  }

  public onRefresh(callback: () => Promise<void>): void {
    this.refreshCallback = callback
  }

  public destroy(): void {
    try {
      // Remove all key listeners first
      this.screen.removeAllListeners('key')
      this.screen.removeAllListeners('keypress')

      // Restore terminal state
      if (this.screen.program) {
        this.screen.program.disableMouse()
        this.screen.program.showCursor()
        this.screen.program.normalBuffer()
      }

      // Destroy the screen
      this.screen.destroy()

      // Restore original stdin state
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(this.originalStdinRawMode || false)
        if (!this.originalStdinRawMode) {
          process.stdin.pause()
        }
      }
    } catch (error) {
      // Ignora errori di cleanup
    }
  }
}