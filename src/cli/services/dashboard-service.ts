import { EventEmitter } from 'node:events'
import { type DashboardMetrics, DashboardMetricsCollector, type MetricsProvider } from '../core/dashboard-metrics'
import { DashboardUI } from '../ui/dashboard-ui'

export type DashboardMode = 'off' | 'expanded'

export interface DashboardConfig {
  refreshInterval: number
  expandedRefreshInterval: number
  autoHideTimeout?: number
}

export class DashboardService extends EventEmitter {
  private mode: DashboardMode = 'off'
  private metricsCollector: DashboardMetricsCollector
  private dashboardUI?: DashboardUI
  private refreshTimer?: NodeJS.Timeout
  private currentMetrics?: DashboardMetrics
  private config: DashboardConfig

  constructor(
    agentManager?: MetricsProvider,
    analyticsManager?: MetricsProvider,
    aiProvider?: MetricsProvider,
    config?: Partial<DashboardConfig>
  ) {
    super()

    this.config = {
      refreshInterval: 5000,
      expandedRefreshInterval: 5000,
      ...config,
    }

    this.metricsCollector = new DashboardMetricsCollector(agentManager, analyticsManager, aiProvider)
  }

  public getMode(): DashboardMode {
    return this.mode
  }

  public isActive(): boolean {
    return this.mode !== 'off'
  }

  public getCurrentMetrics(): DashboardMetrics | undefined {
    return this.currentMetrics
  }

  public async start(): Promise<void> {
    if (this.mode === 'expanded') {
      return
    }

    this.mode = 'expanded'
    this.dashboardUI = new DashboardUI()
    await this.refreshData()

    this.startRefreshLoop()
    await this.renderExpanded()

    this.emit('modeChanged', 'expanded')
  }

  public stop(): void {
    if (this.mode === 'off') {
      return
    }

    this.stopRefreshLoop()
    this.hideExpanded()
    this.mode = 'off'
    this.currentMetrics = undefined

    this.emit('modeChanged', 'off')
  }

  public async toggle(): Promise<void> {
    if (this.mode === 'off') {
      await this.start()
    } else {
      this.stop()
    }
  }

  public addResponseTime(responseTime: number): void {
    this.metricsCollector.addResponseTime(responseTime)
  }

  private async refreshData(): Promise<void> {
    try {
      this.currentMetrics = await this.metricsCollector.collectMetrics()
      this.emit('metricsUpdated', this.currentMetrics)
    } catch (error) {
      this.emit('error', error)
    }
  }

  private async renderExpanded(): Promise<void> {
    if (this.mode !== 'expanded' || !this.dashboardUI || !this.currentMetrics) {
      return
    }

    try {
      return new Promise<void>((resolve) => {
        this.dashboardUI!.render(this.currentMetrics!)

        this.dashboardUI!.onExit(() => {
          this.cleanupTerminal()
          this.stop()
          resolve()
        })

        this.dashboardUI!.onRefresh(async () => {
          await this.refreshData()
          if (this.mode === 'expanded' && this.currentMetrics) {
            this.dashboardUI!.render(this.currentMetrics)
          }
        })
      })
    } catch (error) {
      this.emit('error', error)
      this.cleanupTerminal()
      throw error
    }
  }

  private cleanupTerminal(): void {
    try {
      // Reset cursor e cancella schermo
      process.stdout.write('\x1b[?1049l') // Exit alternate screen if used
      process.stdout.write('\x1b[2J') // Clear entire screen
      process.stdout.write('\x1b[H') // Move cursor to home
      process.stdout.write('\x1b[?25h') // Show cursor
      process.stdout.write('\x1b[0m') // Reset all attributes
    } catch (error) {
      // Ignora errori di cleanup
    }
  }

  private hideExpanded(): void {
    if (this.dashboardUI) {
      this.dashboardUI.destroy()
      this.dashboardUI = undefined
    }
  }

  private startRefreshLoop(): void {
    this.stopRefreshLoop()

    const interval = this.config.expandedRefreshInterval

    this.refreshTimer = setInterval(async () => {
      await this.refreshData()

      if (this.mode === 'expanded' && this.dashboardUI && this.currentMetrics) {
        this.dashboardUI.updateMetrics(this.currentMetrics)
      }
    }, interval)
  }

  private stopRefreshLoop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = undefined
    }
  }

  public destroy(): void {
    this.stop()
    this.removeAllListeners()
  }
}
