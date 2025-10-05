/**
 * Metrics Tracker for benchmark system
 * Collects and aggregates real-time metrics during benchmark execution
 */

import type { BenchmarkMetrics, TaskResult } from './types'

export class MetricsTracker {
  private metrics: BenchmarkMetrics
  private latencyValues: number[] = []
  private accuracyValues: number[] = []
  private memoryValues: number[] = []
  private cpuValues: number[] = []
  private errorsByType: Map<string, number> = new Map()
  private costByModel: Map<string, number> = new Map()

  constructor() {
    this.metrics = this.initializeMetrics()
  }

  private initializeMetrics(): BenchmarkMetrics {
    return {
      latency: {
        min: Number.POSITIVE_INFINITY,
        max: 0,
        avg: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        values: [],
      },
      tokens: {
        totalInput: 0,
        totalOutput: 0,
        total: 0,
        avgPerTask: 0,
      },
      cost: {
        total: 0,
        avgPerTask: 0,
        byModel: {},
      },
      success: {
        total: 0,
        passed: 0,
        failed: 0,
        rate: 0,
      },
      accuracy: {
        avg: 0,
        min: Number.POSITIVE_INFINITY,
        max: 0,
        values: [],
      },
      resources: {
        memoryPeak: 0,
        memoryAvg: 0,
        cpuPeak: 0,
        cpuAvg: 0,
      },
      errors: {
        total: 0,
        byType: {},
        rate: 0,
      },
      timing: {
        startTime: new Date(),
        avgTaskTime: 0,
      },
    }
  }

  /**
   * Record a task result and update metrics
   */
  recordTask(result: TaskResult, modelName: string): void {
    // Update latency
    this.latencyValues.push(result.executionTime)
    this.metrics.latency.min = Math.min(this.metrics.latency.min, result.executionTime)
    this.metrics.latency.max = Math.max(this.metrics.latency.max, result.executionTime)
    this.metrics.latency.avg = this.calculateAverage(this.latencyValues)
    this.metrics.latency.values = [...this.latencyValues]

    // Calculate percentiles
    const sorted = [...this.latencyValues].sort((a, b) => a - b)
    this.metrics.latency.p50 = this.calculatePercentile(sorted, 50)
    this.metrics.latency.p95 = this.calculatePercentile(sorted, 95)
    this.metrics.latency.p99 = this.calculatePercentile(sorted, 99)

    // Update tokens
    this.metrics.tokens.totalInput += result.tokensUsed.input
    this.metrics.tokens.totalOutput += result.tokensUsed.output
    this.metrics.tokens.total += result.tokensUsed.total
    this.metrics.tokens.avgPerTask = this.metrics.tokens.total / (this.metrics.success.total + 1)

    // Update cost
    this.metrics.cost.total += result.cost
    this.metrics.cost.avgPerTask = this.metrics.cost.total / (this.metrics.success.total + 1)

    const modelCost = this.costByModel.get(modelName) || 0
    this.costByModel.set(modelName, modelCost + result.cost)
    this.metrics.cost.byModel = Object.fromEntries(this.costByModel)

    // Update success metrics
    this.metrics.success.total++
    if (result.success) {
      this.metrics.success.passed++
    } else {
      this.metrics.success.failed++
    }
    this.metrics.success.rate = this.metrics.success.passed / this.metrics.success.total

    // Update accuracy
    if (result.accuracy !== undefined) {
      this.accuracyValues.push(result.accuracy)
      this.metrics.accuracy.min = Math.min(this.metrics.accuracy.min, result.accuracy)
      this.metrics.accuracy.max = Math.max(this.metrics.accuracy.max, result.accuracy)
      this.metrics.accuracy.avg = this.calculateAverage(this.accuracyValues)
      this.metrics.accuracy.values = [...this.accuracyValues]
    }

    // Update resource usage
    this.memoryValues.push(result.memoryUsed)
    this.cpuValues.push(result.cpuUsage)
    this.metrics.resources.memoryPeak = Math.max(this.metrics.resources.memoryPeak, result.memoryUsed)
    this.metrics.resources.memoryAvg = this.calculateAverage(this.memoryValues)
    this.metrics.resources.cpuPeak = Math.max(this.metrics.resources.cpuPeak, result.cpuUsage)
    this.metrics.resources.cpuAvg = this.calculateAverage(this.cpuValues)

    // Update errors
    if (result.error) {
      this.metrics.errors.total++
      const errorType = this.categorizeError(result.error)
      this.errorsByType.set(errorType, (this.errorsByType.get(errorType) || 0) + 1)
      this.metrics.errors.byType = Object.fromEntries(this.errorsByType)
      this.metrics.errors.rate = this.metrics.errors.total / this.metrics.success.total
    }

    // Update timing
    this.metrics.timing.avgTaskTime = this.calculateAverage(this.latencyValues)
  }

  /**
   * Mark the benchmark as complete
   */
  complete(): void {
    this.metrics.timing.endTime = new Date()
    this.metrics.timing.duration = this.metrics.timing.endTime.getTime() - this.metrics.timing.startTime.getTime()
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics(): BenchmarkMetrics {
    return JSON.parse(JSON.stringify(this.metrics))
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics = this.initializeMetrics()
    this.latencyValues = []
    this.accuracyValues = []
    this.memoryValues = []
    this.cpuValues = []
    this.errorsByType.clear()
    this.costByModel.clear()
  }

  /**
   * Calculate average of an array of numbers
   */
  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0
    return values.reduce((sum, val) => sum + val, 0) / values.length
  }

  /**
   * Calculate percentile from sorted array
   */
  private calculatePercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0
    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1
    return sortedValues[Math.max(0, index)]
  }

  /**
   * Categorize error type for tracking
   */
  private categorizeError(error: string): string {
    const lowerError = error.toLowerCase()
    if (lowerError.includes('timeout')) return 'timeout'
    if (lowerError.includes('rate limit')) return 'rate-limit'
    if (lowerError.includes('syntax')) return 'syntax-error'
    if (lowerError.includes('network')) return 'network-error'
    if (lowerError.includes('memory')) return 'memory-error'
    if (lowerError.includes('api')) return 'api-error'
    return 'unknown'
  }

  /**
   * Get formatted summary string
   */
  getSummary(): string {
    const m = this.metrics
    return `
Benchmark Summary:
------------------
Tasks: ${m.success.total} total | ${m.success.passed} passed | ${m.success.failed} failed
Success Rate: ${(m.success.rate * 100).toFixed(2)}%
Latency: avg ${m.latency.avg.toFixed(2)}ms | p50 ${m.latency.p50.toFixed(2)}ms | p95 ${m.latency.p95.toFixed(2)}ms
Tokens: ${m.tokens.total.toLocaleString()} total | ${m.tokens.avgPerTask.toFixed(0)} avg/task
Cost: $${m.cost.total.toFixed(4)} total | $${m.cost.avgPerTask.toFixed(4)} avg/task
Accuracy: ${(m.accuracy.avg * 100).toFixed(2)}% avg
Memory: ${this.formatBytes(m.resources.memoryPeak)} peak | ${this.formatBytes(m.resources.memoryAvg)} avg
CPU: ${m.resources.cpuPeak.toFixed(2)}% peak | ${m.resources.cpuAvg.toFixed(2)}% avg
Errors: ${m.errors.total} (${(m.errors.rate * 100).toFixed(2)}%)
`.trim()
  }

  /**
   * Format bytes to human readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`
  }
}
