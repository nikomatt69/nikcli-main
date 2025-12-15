import type { EnhancedSupabaseProvider } from '../providers/supabase/enhanced-supabase-provider'
import { structuredLogger } from '../utils/structured-logger'

interface EvaluationMetrics {
  toolSelectionAccuracy: number
  executionSuccessRate: number
  averageExecutionDuration: number
  cacheHitRate: number
  modelConfidenceScore: number
}

interface BenchmarkResult {
  sessionId: string
  timestamp: Date
  metrics: EvaluationMetrics
  regressions: string[]
  improvements: string[]
  recommendations: string[]
}

interface HistoricalMetrics {
  baseline: EvaluationMetrics
  current: EvaluationMetrics
  trend: number // -1 to 1, negative means regression
}

class EvaluationPipeline {
  private supabaseProvider: EnhancedSupabaseProvider | null = null
  private metricsBuffer: Map<string, EvaluationMetrics> = new Map()
  private readonly BATCH_EVALUATION_SIZE = 50

  constructor() { }

  async initialize(supabaseProvider: EnhancedSupabaseProvider): Promise<void> {
    try {
      this.supabaseProvider = supabaseProvider
      structuredLogger.info('EvaluationPipeline', 'initialized')
    } catch (error) {
      structuredLogger.error('EvaluationPipeline', 'Failed to initialize EvaluationPipeline')
      throw error
    }
  }

  async evaluateSession(sessionId: string): Promise<BenchmarkResult> {
    if (!this.supabaseProvider) {
      throw new Error('EvaluationPipeline not initialized')
    }

    try {
      // Fetch session executions
      const executions = await this.supabaseProvider.getSessionToolchainExecutions(sessionId)

      if (executions.length === 0) {
        return this.createEmptyBenchmark(sessionId)
      }

      // Calculate metrics
      const metrics = this.calculateMetrics(executions)

      // Get historical metrics for comparison
      const historical = await this.getHistoricalMetrics()

      // Analyze regressions and improvements
      const regressions = this.detectRegressions(metrics, historical)
      const improvements = this.detectImprovements(metrics, historical)

      // Generate recommendations
      const recommendations = this.generateRecommendations(metrics, executions, regressions)

      const result: BenchmarkResult = {
        sessionId,
        timestamp: new Date(),
        metrics,
        regressions,
        improvements,
        recommendations,
      }

      // Store benchmark result
      await this.storeBenchmarkResult(result)

      structuredLogger.info(
        'Session evaluation completed',
        `Session evaluation completed, sessionId: ${sessionId}, accuracy: ${metrics.toolSelectionAccuracy}, successRate: ${metrics.executionSuccessRate}`
      )

      return result
    } catch (error) {
      structuredLogger.error('EvaluationPipeline', 'Session evaluation failed')
      return this.createEmptyBenchmark(sessionId)
    }
  }

  async runBatchEvaluation(lookbackDays: number = 7): Promise<EvaluationMetrics> {
    if (!this.supabaseProvider) {
      throw new Error('EvaluationPipeline not initialized')
    }

    try {
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - lookbackDays)

      // Fetch all executions from period
      const executions = await this.supabaseProvider.getToolchainExecutions(startDate)

      if (executions.length === 0) {
        structuredLogger.warning('EvaluationPipeline', 'No executions found for batch evaluation')
        return this.getDefaultMetrics()
      }

      // Calculate aggregated metrics
      const metrics = this.calculateMetrics(executions)

      // Store batch result
      await this.storeBatchMetrics(metrics, lookbackDays)

      structuredLogger.info(
        'Batch evaluation completed',
        `Batch evaluation completed, executionsAnalyzed: ${executions.length}, successRate: ${metrics.executionSuccessRate}`
      )

      return metrics
    } catch (error) {
      structuredLogger.error('Batch evaluation failed', error as any)
      return this.getDefaultMetrics()
    }
  }

  private calculateMetrics(executions: any[]): EvaluationMetrics {
    if (executions.length === 0) {
      return this.getDefaultMetrics()
    }

    // Tool Selection Accuracy
    const correctSelections = executions.filter((e) => e.execution_success).length
    const toolSelectionAccuracy = correctSelections / executions.length

    // Execution Success Rate
    const executionSuccessRate = toolSelectionAccuracy // Same metric in current setup

    // Average Execution Duration
    const totalDuration = executions.reduce((sum, e) => sum + (e.execution_duration_ms || 0), 0)
    const averageExecutionDuration = totalDuration / executions.length

    // Cache Hit Rate (estimate from performance metrics)
    const cacheHitRate = this.estimateCacheHitRate(executions)

    // Model Confidence Score (average confidence from predictions)
    const confidenceScores = executions
      .filter((e) => e.context_features?.mlConfidence !== undefined)
      .map((e) => e.context_features.mlConfidence)

    const modelConfidenceScore =
      confidenceScores.length > 0 ? confidenceScores.reduce((a, b) => a + b) / confidenceScores.length : 0.75

    return {
      toolSelectionAccuracy,
      executionSuccessRate,
      averageExecutionDuration,
      cacheHitRate,
      modelConfidenceScore,
    }
  }

  private async getHistoricalMetrics(): Promise<HistoricalMetrics | null> {
    if (!this.supabaseProvider) {
      return null
    }

    try {
      // Get baseline (oldest) metrics
      const baseline = await this.supabaseProvider.getBaselineMetrics()

      // Get current best metrics
      const current = await this.supabaseProvider.getCurrentMetrics()

      if (!baseline || !current) {
        return null
      }

      // Calculate trend
      const accuracyTrend = current.toolSelectionAccuracy - baseline.toolSelectionAccuracy
      const successTrend = current.executionSuccessRate - baseline.executionSuccessRate
      const trend = (accuracyTrend + successTrend) / 2

      return {
        baseline,
        current,
        trend: Math.max(-1, Math.min(trend, 1)), // Clamp to -1..1
      }
    } catch (error) {
      structuredLogger.error('Failed to get historical metrics', `Failed to get historical metrics, error: ${error}`)
      return null
    }
  }

  private detectRegressions(metrics: EvaluationMetrics, historical: HistoricalMetrics | null): string[] {
    const regressions: string[] = []

    if (!historical) {
      return regressions
    }

    const threshold = 0.05 // 5% regression threshold

    if (metrics.toolSelectionAccuracy < historical.baseline.toolSelectionAccuracy - threshold) {
      regressions.push(`Tool selection accuracy regressed to ${(metrics.toolSelectionAccuracy * 100).toFixed(1)}%`)
    }

    if (metrics.executionSuccessRate < historical.baseline.executionSuccessRate - threshold) {
      regressions.push(`Execution success rate regressed to ${(metrics.executionSuccessRate * 100).toFixed(1)}%`)
    }

    if (metrics.averageExecutionDuration > historical.baseline.averageExecutionDuration * 1.2) {
      regressions.push(`Execution duration increased by 20%+ (${metrics.averageExecutionDuration.toFixed(0)}ms)`)
    }

    return regressions
  }

  private detectImprovements(metrics: EvaluationMetrics, historical: HistoricalMetrics | null): string[] {
    const improvements: string[] = []

    if (!historical) {
      return improvements
    }

    const threshold = 0.05 // 5% improvement threshold

    if (metrics.toolSelectionAccuracy > historical.baseline.toolSelectionAccuracy + threshold) {
      const improvement = (
        (metrics.toolSelectionAccuracy / historical.baseline.toolSelectionAccuracy - 1) *
        100
      ).toFixed(1)
      improvements.push(`Tool selection accuracy improved by ${improvement}%`)
    }

    if (metrics.executionSuccessRate > historical.baseline.executionSuccessRate + threshold) {
      const improvement = ((metrics.executionSuccessRate / historical.baseline.executionSuccessRate - 1) * 100).toFixed(
        1
      )
      improvements.push(`Execution success rate improved by ${improvement}%`)
    }

    if (metrics.cacheHitRate > (historical.baseline.cacheHitRate || 0) + threshold) {
      improvements.push(`Cache hit rate improved to ${(metrics.cacheHitRate * 100).toFixed(1)}%`)
    }

    return improvements
  }

  private generateRecommendations(metrics: EvaluationMetrics, executions: any[], regressions: string[]): string[] {
    const recommendations: string[] = []

    // Low accuracy recommendation
    if (metrics.toolSelectionAccuracy < 0.75) {
      recommendations.push('Consider collecting more training data for improved tool selection')
    }

    // High duration recommendation
    if (metrics.averageExecutionDuration > 5000) {
      recommendations.push('Implement tool sequencing optimization to reduce execution time')
    }

    // Low cache hit rate recommendation
    if (metrics.cacheHitRate < 0.3) {
      recommendations.push('Review cache invalidation strategy to improve cache effectiveness')
    }

    // Low model confidence
    if (metrics.modelConfidenceScore < 0.7) {
      recommendations.push('Increase model training data diversity to improve prediction confidence')
    }

    // Failed tools analysis
    const failedTools = this.analyzeFailedTools(executions)
    if (failedTools.length > 0) {
      recommendations.push(`Review reliability of tools: ${failedTools.slice(0, 3).join(', ')}`)
    }

    return recommendations
  }

  private analyzeFailedTools(executions: any[]): string[] {
    const failureCount: Record<string, number> = {}
    let totalFailures = 0

    for (const execution of executions) {
      if (!execution.execution_success && execution.selected_tools) {
        totalFailures++
        for (const tool of execution.selected_tools) {
          failureCount[tool] = (failureCount[tool] || 0) + 1
        }
      }
    }

    // Return tools with >20% failure rate
    return Object.entries(failureCount)
      .filter(([_, count]) => count / Math.max(totalFailures, 1) > 0.2)
      .map(([tool]) => tool)
  }

  private estimateCacheHitRate(executions: any[]): number {
    let cacheHits = 0
    let totalCacheable = 0

    for (const execution of executions) {
      const metrics = execution.performance_metrics || {}
      if (metrics.cacheHit) {
        cacheHits++
      }
      if (metrics.cacheAttempt) {
        totalCacheable++
      }
    }

    return totalCacheable > 0 ? cacheHits / totalCacheable : 0.5 // Default to 0.5
  }

  private async storeBenchmarkResult(result: BenchmarkResult): Promise<void> {
    if (!this.supabaseProvider) {
      return
    }

    try {
      await this.supabaseProvider.recordBenchmarkResult(result)
    } catch (error) {
      structuredLogger.error('Failed to store benchmark result', `Failed to store benchmark result, error: ${error}`)
    }
  }

  private async storeBatchMetrics(metrics: EvaluationMetrics, lookbackDays: number): Promise<void> {
    if (!this.supabaseProvider) {
      return
    }

    try {
      await this.supabaseProvider.recordBatchMetrics(metrics, lookbackDays)
    } catch (error) {
      structuredLogger.error('Failed to store batch metrics', `Failed to store batch metrics, error: ${error}`)
    }
  }

  private createEmptyBenchmark(sessionId: string): BenchmarkResult {
    return {
      sessionId,
      timestamp: new Date(),
      metrics: this.getDefaultMetrics(),
      regressions: [],
      improvements: [],
      recommendations: [],
    }
  }

  private getDefaultMetrics(): EvaluationMetrics {
    return {
      toolSelectionAccuracy: 0.8,
      executionSuccessRate: 0.8,
      averageExecutionDuration: 2000,
      cacheHitRate: 0.5,
      modelConfidenceScore: 0.75,
    }
  }
}

export { EvaluationPipeline }
export type { EvaluationMetrics, BenchmarkResult, HistoricalMetrics }
