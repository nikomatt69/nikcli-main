import chalk from 'chalk'
import { logger } from '../utils/logger'
import {
  BaseMiddleware,
  type MiddlewareConfig,
  type MiddlewareExecutionContext,
  type MiddlewareNext,
  type MiddlewareRequest,
  type MiddlewareResponse,
} from './types'
import { tracerService, prometheusExporter } from '../monitoring'

interface PerformanceMetrics {
  executionTime: number
  memoryUsed: number
  memoryDelta: number
  cpuUsage?: NodeJS.CpuUsage
  timestamp: Date
}

interface PerformanceBenchmark {
  operation: string
  averageTime: number
  minTime: number
  maxTime: number
  totalExecutions: number
  slowExecutions: number
  lastExecutionTime: number
}

interface PerformanceMiddlewareConfig extends MiddlewareConfig {
  trackMemory: boolean
  trackCpu: boolean
  slowExecutionThreshold: number
  memoryLeakThreshold: number
  reportSlowOperations: boolean
  logPerformanceMetrics: boolean
  enableProfiling: boolean
  maxHistorySize: number
  enableOptimizations: boolean
}

interface PerformanceAlert {
  type: 'slow_execution' | 'memory_leak' | 'high_cpu' | 'optimization_suggestion'
  operation: string
  message: string
  metrics: PerformanceMetrics
  timestamp: Date
  severity: 'low' | 'medium' | 'high'
}

export class PerformanceMiddleware extends BaseMiddleware {
  private performanceConfig: PerformanceMiddlewareConfig
  private benchmarks: Map<string, PerformanceBenchmark> = new Map()
  private metricsHistory: PerformanceMetrics[] = []
  private alerts: PerformanceAlert[] = []
  private baselineMemory: number = 0

  constructor(config: Partial<PerformanceMiddlewareConfig> = {}) {
    const defaultConfig: PerformanceMiddlewareConfig = {
      enabled: true,
      priority: 700,
      trackMemory: true,
      trackCpu: true,
      slowExecutionThreshold: 5000, // 5 seconds
      memoryLeakThreshold: 50 * 1024 * 1024, // 50MB
      reportSlowOperations: true,
      logPerformanceMetrics: true,
      enableProfiling: false,
      maxHistorySize: 1000,
      enableOptimizations: true,
      ...config,
    }

    super('performance', 'Performance monitoring and optimization', defaultConfig)

    this.performanceConfig = defaultConfig
    this.baselineMemory = this.getMemoryUsage()
    this.startPeriodicReporting()
  }

  async execute(
    request: MiddlewareRequest,
    next: MiddlewareNext,
    _context: MiddlewareExecutionContext
  ): Promise<MiddlewareResponse> {
    return tracerService.trackOperation(
      `middleware.performance.${request.operation}`,
      async () => {
        const startTime = Date.now()
        const startMemory = this.getMemoryUsage()
        const startCpu = this.performanceConfig.trackCpu ? process.cpuUsage() : undefined

        tracerService.setAttributes({
          'middleware.name': 'performance',
          'request.id': request.id,
          'request.type': request.type,
          'request.operation': request.operation,
        })

        let response: MiddlewareResponse

        try {
          if (this.performanceConfig.enableOptimizations) {
            response = await this.executeWithOptimizations(request, next)
          } else {
            response = await next()
          }
        } catch (error: any) {
          const metrics = this.collectMetrics(startTime, startMemory, startCpu)
          this.recordBenchmark(request.operation, metrics, false)
          throw error
        }

        const metrics = this.collectMetrics(startTime, startMemory, startCpu)
        this.recordBenchmark(request.operation, metrics, true)
        this.recordMetrics(metrics)

        tracerService.setAttributes({
          'performance.execution_time_ms': metrics.executionTime,
          'performance.memory_used_mb': Math.round(metrics.memoryUsed / 1024 / 1024),
          'performance.memory_delta_mb': Math.round(metrics.memoryDelta / 1024 / 1024),
        })

        if (metrics.cpuUsage) {
          tracerService.setAttributes({
            'performance.cpu_user_ms': Math.round(metrics.cpuUsage.user / 1000),
            'performance.cpu_system_ms': Math.round(metrics.cpuUsage.system / 1000),
          })
        }

        const alerts = this.checkPerformanceAlerts(request.operation, metrics)
        alerts.forEach((alert) => {
          this.addAlert(alert)
          tracerService.addEvent('performance.alert', {
            'alert.type': alert.type,
            'alert.severity': alert.severity,
            'alert.message': alert.message,
          })
        })

        if (
          this.performanceConfig.reportSlowOperations &&
          metrics.executionTime > this.performanceConfig.slowExecutionThreshold
        ) {
          this.reportSlowOperation(request.operation, metrics)
          tracerService.addEvent('performance.slow_operation', {
            'operation': request.operation,
            'execution_time_ms': metrics.executionTime,
          })
        }

        return {
          ...response,
          metadata: {
            ...response.metadata,
            'performance.executionTime': metrics.executionTime,
            'performance.memoryUsed': metrics.memoryUsed,
            'performance.memoryDelta': metrics.memoryDelta,
            'performance.cpuUser': metrics.cpuUsage?.user || 0,
            'performance.cpuSystem': metrics.cpuUsage?.system || 0,
            'performance.benchmarkAvgTime': this.benchmarks.get(request.operation)?.averageTime || 0,
            'performance.benchmarkMinTime': this.benchmarks.get(request.operation)?.minTime || 0,
            'performance.benchmarkMaxTime': this.benchmarks.get(request.operation)?.maxTime || 0,
            'performance.benchmarkCount': this.benchmarks.get(request.operation)?.totalExecutions || 0,
          },
        }
      },
      {
        'middleware.type': 'performance',
        'request.operation': request.operation,
      }
    )
  }

  private async executeWithOptimizations(
    request: MiddlewareRequest,
    next: MiddlewareNext
  ): Promise<MiddlewareResponse> {
    const benchmark = this.benchmarks.get(request.operation)

    if (benchmark && benchmark.averageTime > this.performanceConfig.slowExecutionThreshold) {
      console.log(chalk.yellow(`⚡ Applying optimizations for slow operation: ${request.operation}`))
    }

    if (this.performanceConfig.trackMemory && this.getMemoryUsage() > this.performanceConfig.memoryLeakThreshold) {
      if (global.gc) {
        console.log(chalk.cyan('🧹 Running garbage collection due to high memory usage'))
        global.gc()
      }
    }

    return await next()
  }

  private collectMetrics(startTime: number, startMemory: number, startCpu?: NodeJS.CpuUsage): PerformanceMetrics {
    const endTime = Date.now()
    const endMemory = this.getMemoryUsage()
    const endCpu = this.performanceConfig.trackCpu ? process.cpuUsage(startCpu) : undefined

    return {
      executionTime: endTime - startTime,
      memoryUsed: endMemory,
      memoryDelta: endMemory - startMemory,
      cpuUsage: endCpu,
      timestamp: new Date(),
    }
  }

  private getMemoryUsage(): number {
    const usage = process.memoryUsage()
    return usage.heapUsed
  }

  private recordBenchmark(operation: string, metrics: PerformanceMetrics, _success: boolean): void {
    let benchmark = this.benchmarks.get(operation)

    if (!benchmark) {
      benchmark = {
        operation,
        averageTime: metrics.executionTime,
        minTime: metrics.executionTime,
        maxTime: metrics.executionTime,
        totalExecutions: 1,
        slowExecutions: metrics.executionTime > this.performanceConfig.slowExecutionThreshold ? 1 : 0,
        lastExecutionTime: metrics.executionTime,
      }
    } else {
      const totalTime = benchmark.averageTime * benchmark.totalExecutions + metrics.executionTime
      benchmark.totalExecutions++
      benchmark.averageTime = totalTime / benchmark.totalExecutions
      benchmark.minTime = Math.min(benchmark.minTime, metrics.executionTime)
      benchmark.maxTime = Math.max(benchmark.maxTime, metrics.executionTime)
      benchmark.lastExecutionTime = metrics.executionTime

      if (metrics.executionTime > this.performanceConfig.slowExecutionThreshold) {
        benchmark.slowExecutions++
      }
    }

    this.benchmarks.set(operation, benchmark)
  }

  private recordMetrics(metrics: PerformanceMetrics): void {
    this.metricsHistory.push(metrics)

    if (this.metricsHistory.length > this.performanceConfig.maxHistorySize) {
      this.metricsHistory.shift()
    }
  }

  private checkPerformanceAlerts(operation: string, metrics: PerformanceMetrics): PerformanceAlert[] {
    const alerts: PerformanceAlert[] = []

    if (metrics.executionTime > this.performanceConfig.slowExecutionThreshold) {
      alerts.push({
        type: 'slow_execution',
        operation,
        message: `Operation took ${metrics.executionTime}ms (threshold: ${this.performanceConfig.slowExecutionThreshold}ms)`,
        metrics,
        timestamp: new Date(),
        severity: metrics.executionTime > this.performanceConfig.slowExecutionThreshold * 2 ? 'high' : 'medium',
      })
    }

    if (metrics.memoryDelta > this.performanceConfig.memoryLeakThreshold) {
      alerts.push({
        type: 'memory_leak',
        operation,
        message: `Memory usage increased by ${Math.round(metrics.memoryDelta / 1024 / 1024)}MB`,
        metrics,
        timestamp: new Date(),
        severity: 'high',
      })
    }

    if (metrics.cpuUsage) {
      const totalCpuTime = metrics.cpuUsage.user + metrics.cpuUsage.system
      if (totalCpuTime > 1000000) {
        // 1 second of CPU time
        alerts.push({
          type: 'high_cpu',
          operation,
          message: `High CPU usage: ${Math.round(totalCpuTime / 1000)}ms`,
          metrics,
          timestamp: new Date(),
          severity: 'medium',
        })
      }
    }

    const benchmark = this.benchmarks.get(operation)
    if (benchmark && this.shouldSuggestOptimization(benchmark)) {
      alerts.push({
        type: 'optimization_suggestion',
        operation,
        message: this.getOptimizationSuggestion(benchmark),
        metrics,
        timestamp: new Date(),
        severity: 'low',
      })
    }

    return alerts
  }

  private shouldSuggestOptimization(benchmark: PerformanceBenchmark): boolean {
    const slowExecutionRate = benchmark.slowExecutions / benchmark.totalExecutions
    return slowExecutionRate > 0.3 && benchmark.totalExecutions >= 5
  }

  private getOptimizationSuggestion(benchmark: PerformanceBenchmark): string {
    const suggestions = []

    if (benchmark.averageTime > 10000) {
      suggestions.push('Consider breaking this operation into smaller chunks')
    }

    if (benchmark.slowExecutions > benchmark.totalExecutions * 0.5) {
      suggestions.push('This operation is frequently slow - consider caching or optimization')
    }

    const variance = benchmark.maxTime - benchmark.minTime
    if (variance > benchmark.averageTime * 2) {
      suggestions.push('Execution time varies significantly - investigate inconsistent performance')
    }

    return suggestions.length > 0 ? suggestions.join('; ') : 'Consider optimizing this frequently used operation'
  }

  private addAlert(alert: PerformanceAlert): void {
    this.alerts.push(alert)

    if (this.alerts.length > 100) {
      this.alerts.shift()
    }

    if (this.performanceConfig.logPerformanceMetrics) {
      const severityColor = this.getSeverityColor(alert.severity)
      const icon = this.getAlertIcon(alert.type)

      logger.warn(`Performance Alert: ${alert.message}`, {
        type: alert.type,
        operation: alert.operation,
        severity: alert.severity,
        executionTime: alert.metrics.executionTime,
        memoryDelta: alert.metrics.memoryDelta,
      })

      console.log(severityColor(`${icon} Performance Alert: ${alert.message}`))
    }
  }

  private reportSlowOperation(operation: string, metrics: PerformanceMetrics): void {
    const benchmark = this.benchmarks.get(operation)

    console.log(chalk.yellow.bold('\\n⚠️  Slow Operation Detected'))
    console.log(chalk.gray('─'.repeat(50)))
    console.log(`${chalk.blue('Operation:')} ${operation}`)
    console.log(`${chalk.blue('Execution Time:')} ${chalk.yellow(`${metrics.executionTime}ms`)}`)
    console.log(`${chalk.blue('Memory Delta:')} ${chalk.cyan(`${Math.round(metrics.memoryDelta / 1024)}KB`)}`)

    if (benchmark) {
      console.log(`${chalk.blue('Average Time:')} ${Math.round(benchmark.averageTime)}ms`)
      console.log(`${chalk.blue('Total Executions:')} ${benchmark.totalExecutions}`)
      console.log(
        `${chalk.blue('Slow Rate:')} ${Math.round((benchmark.slowExecutions / benchmark.totalExecutions) * 100)}%`
      )
    }
  }

  private startPeriodicReporting(): void {
    if (!this.performanceConfig.logPerformanceMetrics) return

    setInterval(() => {
      this.generatePerformanceReport()
    }, 300000) // Every 5 minutes
  }

  private generatePerformanceReport(): void {
    const summary = this.getPerformanceSummary()

    if (summary.totalOperations === 0) return

    console.log(chalk.cyan.bold('\\n📊 Performance Summary'))
    console.log(chalk.gray('─'.repeat(40)))
    console.log(`Total Operations: ${summary.totalOperations}`)
    console.log(`Average Execution Time: ${Math.round(summary.averageExecutionTime)}ms`)
    console.log(`Memory Usage: ${Math.round(summary.currentMemoryUsage / 1024 / 1024)}MB`)
    console.log(`Slow Operations: ${summary.slowOperations} (${Math.round(summary.slowOperationRate * 100)}%)`)

    if (this.alerts.length > 0) {
      console.log(`Recent Alerts: ${this.alerts.slice(-5).length}`)
    }
  }

  private getSeverityColor(severity: 'low' | 'medium' | 'high'): any {
    switch (severity) {
      case 'high':
        return chalk.red
      case 'medium':
        return chalk.yellow
      case 'low':
        return chalk.blue
      default:
        return chalk.gray
    }
  }

  private getAlertIcon(type: string): string {
    switch (type) {
      case 'slow_execution':
        return '🐌'
      case 'memory_leak':
        return '💾'
      case 'high_cpu':
        return '⚡'
      case 'optimization_suggestion':
        return '💡'
      default:
        return '⚠️'
    }
  }

  getBenchmarks(): Map<string, PerformanceBenchmark> {
    return new Map(this.benchmarks)
  }

  getMetricsHistory(limit: number = 100): PerformanceMetrics[] {
    return this.metricsHistory.slice(-limit)
  }

  getAlerts(limit: number = 50): PerformanceAlert[] {
    return this.alerts.slice(-limit)
  }

  getPerformanceSummary(): {
    totalOperations: number
    averageExecutionTime: number
    currentMemoryUsage: number
    slowOperations: number
    slowOperationRate: number
    memoryTrend: 'increasing' | 'decreasing' | 'stable'
  } {
    const totalOperations = Array.from(this.benchmarks.values()).reduce(
      (sum, benchmark) => sum + benchmark.totalExecutions,
      0
    )

    const totalTime = Array.from(this.benchmarks.values()).reduce(
      (sum, benchmark) => sum + benchmark.averageTime * benchmark.totalExecutions,
      0
    )

    const averageExecutionTime = totalOperations > 0 ? totalTime / totalOperations : 0

    const slowOperations = Array.from(this.benchmarks.values()).reduce(
      (sum, benchmark) => sum + benchmark.slowExecutions,
      0
    )

    const slowOperationRate = totalOperations > 0 ? slowOperations / totalOperations : 0

    const currentMemoryUsage = this.getMemoryUsage()

    const memoryTrend = this.calculateMemoryTrend()

    return {
      totalOperations,
      averageExecutionTime,
      currentMemoryUsage,
      slowOperations,
      slowOperationRate,
      memoryTrend,
    }
  }

  private calculateMemoryTrend(): 'increasing' | 'decreasing' | 'stable' {
    if (this.metricsHistory.length < 10) return 'stable'

    const recentMetrics = this.metricsHistory.slice(-10)
    const avgRecent = recentMetrics.reduce((sum, m) => sum + m.memoryUsed, 0) / recentMetrics.length
    const avgOlder = recentMetrics.slice(0, 5).reduce((sum, m) => sum + m.memoryUsed, 0) / 5

    const percentChange = (avgRecent - avgOlder) / avgOlder

    if (percentChange > 0.1) return 'increasing'
    if (percentChange < -0.1) return 'decreasing'
    return 'stable'
  }

  clearMetrics(): void {
    this.benchmarks.clear()
    this.metricsHistory.length = 0
    this.alerts.length = 0
  }

  updatePerformanceConfig(config: Partial<PerformanceMiddlewareConfig>): void {
    this.performanceConfig = { ...this.performanceConfig, ...config }
    this.updateConfig(this.performanceConfig)
  }

  getPerformanceConfig(): PerformanceMiddlewareConfig {
    return { ...this.performanceConfig }
  }

  enableProfiling(): void {
    this.performanceConfig.enableProfiling = true
    console.log(chalk.green('🔍 Performance profiling enabled'))
  }

  disableProfiling(): void {
    this.performanceConfig.enableProfiling = false
    console.log(chalk.yellow('🔍 Performance profiling disabled'))
  }
}
