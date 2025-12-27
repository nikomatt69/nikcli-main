import { EventEmitter } from 'node:events'
import type { AgentTodo } from '../core/agent-todo-manager'
import type { ExecutionOutcome, PatternInsight, SuccessPrediction } from './types/orchestrator-types'
import { UserPreferenceManager } from './user-preference-manager'

interface PatternData {
  patternType: string
  successCount: number
  failureCount: number
  totalEfficiency: number
  sampleCount: number
  lastUpdated: Date
  avgContextTokensUsed: number
  avgDuration: number
}

interface LearningConfig {
  minSamplesForLearning: number
  successThreshold: number
  efficiencyThresholdLow: number
  efficiencyThresholdHigh: number
  adaptationRate: number
  maxBudgetIncrease: number
  maxBudgetDecrease: number
}

export class ContextPatternLearner extends EventEmitter {
  private patterns: Map<string, PatternData> = new Map()
  private config: LearningConfig = {
    minSamplesForLearning: 3,
    successThreshold: 0.7,
    efficiencyThresholdLow: 0.6,
    efficiencyThresholdHigh: 0.9,
    adaptationRate: 0.15,
    maxBudgetIncrease: 1.3,
    maxBudgetDecrease: 0.7,
  }

  private preferenceManager: UserPreferenceManager

  constructor() {
    super()
    this.preferenceManager = new UserPreferenceManager()
  }

  async learn(outcome: ExecutionOutcome, todos: AgentTodo[]): Promise<void> {
    const pattern = this.extractPattern(outcome, todos)

    let data = this.patterns.get(pattern)
    if (!data) {
      data = {
        patternType: pattern,
        successCount: 0,
        failureCount: 0,
        totalEfficiency: 0,
        sampleCount: 0,
        lastUpdated: new Date(),
        avgContextTokensUsed: outcome.contextTokensUsed,
        avgDuration: outcome.duration,
      }
      this.patterns.set(pattern, data)
    }

    data.sampleCount++
    data.lastUpdated = new Date()

    if (outcome.success) {
      data.successCount++
    } else {
      data.failureCount++
    }

    data.totalEfficiency += outcome.efficiencyRatio
    data.avgContextTokensUsed = this.calculateRunningAverage(
      data.avgContextTokensUsed,
      outcome.contextTokensUsed,
      data.sampleCount
    )
    data.avgDuration = this.calculateRunningAverage(data.avgDuration, outcome.duration, data.sampleCount)

    if (data.sampleCount >= this.config.minSamplesForLearning) {
      await this.adaptPreferences(data, outcome)
    }

    this.emit('learned', { pattern, data, outcome })
  }

  private calculateRunningAverage(currentAvg: number, newValue: number, sampleCount: number): number {
    return currentAvg + (newValue - currentAvg) / sampleCount
  }

  private extractPattern(outcome: ExecutionOutcome, todos: AgentTodo[]): string {
    const complexityLevel = this.categorizeComplexity(outcome.complexityScore)
    const agentCount = this.categorizeAgentCount(outcome)
    const efficiencyLevel = this.categorizeEfficiency(outcome.efficiencyRatio)
    const todosCount = this.categorizeTodosCount(todos.length)

    return `${complexityLevel}_${agentCount}_${todosCount}_${efficiencyLevel}`
  }

  private categorizeComplexity(score: number): string {
    if (score > 70) return 'high_complexity'
    if (score > 40) return 'medium_complexity'
    return 'low_complexity'
  }

  private categorizeAgentCount(outcome: ExecutionOutcome): string {
    if (outcome.efficiencyRatio > 0.9 && outcome.contextTokensUsed < outcome.contextBudget * 0.5) {
      return 'single_agent_efficient'
    }
    if (outcome.contextTokensUsed > outcome.contextBudget * 0.8) {
      return 'multiple_agents'
    }
    return 'standard_agents'
  }

  private categorizeEfficiency(ratio: number): string {
    if (ratio > this.config.efficiencyThresholdHigh) return 'high_efficiency'
    if (ratio > this.config.efficiencyThresholdLow) return 'medium_efficiency'
    return 'low_efficiency'
  }

  private categorizeTodosCount(count: number): string {
    if (count > 10) return 'many_tasks'
    if (count > 5) return 'medium_tasks'
    return 'few_tasks'
  }

  private async adaptPreferences(data: PatternData, outcome: ExecutionOutcome): Promise<void> {
    const successRate = data.successCount / data.sampleCount
    const avgEfficiency = data.totalEfficiency / data.sampleCount

    const currentMaxTokens = this.preferenceManager.getMaxContextTokens()
    let newMaxTokens = currentMaxTokens

    if (avgEfficiency > this.config.efficiencyThresholdHigh && successRate > this.config.successThreshold) {
      if (data.avgContextTokensUsed > currentMaxTokens * 0.85) {
        const increase = 1 + this.config.adaptationRate
        newMaxTokens = Math.min(
          Math.round(currentMaxTokens * increase),
          currentMaxTokens * this.config.maxBudgetIncrease
        )
      }
    } else if (avgEfficiency < this.config.efficiencyThresholdLow || successRate < this.config.successThreshold) {
      if (data.avgContextTokensUsed < currentMaxTokens * 0.6) {
        const decrease = 1 - this.config.adaptationRate
        newMaxTokens = Math.max(
          Math.round(currentMaxTokens * decrease),
          currentMaxTokens * this.config.maxBudgetDecrease
        )
      }
    }

    if (newMaxTokens !== currentMaxTokens) {
      this.preferenceManager.updateMaxContextTokens(newMaxTokens)
      this.emit('budgetAdapted', {
        from: currentMaxTokens,
        to: newMaxTokens,
        reason: data.patternType,
      })
    }

    const agentCount = this.preferenceManager.getPreferredAgentCount()
    let newAgentCount = agentCount

    if (successRate > this.config.successThreshold && avgEfficiency > this.config.efficiencyThresholdHigh) {
      if (data.avgContextTokensUsed > outcome.contextBudget * 0.8) {
        newAgentCount = Math.min(agentCount + 1, 3)
      }
    } else if (successRate < this.config.successThreshold || avgEfficiency < this.config.efficiencyThresholdLow) {
      if (data.avgContextTokensUsed < outcome.contextBudget * 0.4) {
        newAgentCount = Math.max(agentCount - 1, 1)
      }
    }

    if (newAgentCount !== agentCount) {
      this.preferenceManager.updateAgentCount(newAgentCount)
      this.emit('agentCountAdapted', {
        from: agentCount,
        to: newAgentCount,
        reason: data.patternType,
      })
    }
  }

  async predictSuccess(
    complexityScore: number,
    plannedAgents: number,
    contextBudget: number,
    recentUsage?: { tokensUsed: number; success: boolean }[]
  ): Promise<SuccessPrediction> {
    const complexity = this.categorizeComplexity(complexityScore)
    const tasksPattern = `${complexity}_*_*_*`

    const matchingPatterns = Array.from(this.patterns.values()).filter((p) => p.patternType.startsWith(complexity))

    let basePrediction = 0.7
    let confidence = 0.5

    if (matchingPatterns.length > 0) {
      let totalWeight = 0
      let weightedSum = 0

      for (const pattern of matchingPatterns) {
        const recencyWeight = this.calculateRecencyWeight(pattern.lastUpdated)
        const sampleWeight = Math.min(pattern.sampleCount / 10, 1)
        const weight = recencyWeight * sampleWeight

        const patternSuccess = pattern.successCount / Math.max(1, pattern.sampleCount)
        const patternEfficiency = pattern.totalEfficiency / Math.max(1, pattern.sampleCount)

        weightedSum += (patternSuccess * 0.6 + patternEfficiency * 0.4) * weight
        totalWeight += weight
      }

      if (totalWeight > 0) {
        basePrediction = weightedSum / totalWeight
      }

      confidence = Math.min(0.95, (matchingPatterns.length / 10) * totalWeight)
    }

    if (recentUsage && recentUsage.length > 0) {
      const recentSuccessRate = recentUsage.filter((u) => u.success).length / recentUsage.length
      basePrediction = basePrediction * 0.7 + recentSuccessRate * 0.3
      confidence = Math.min(0.95, confidence + 0.1)
    }

    const recommendations: string[] = []
    if (basePrediction < 0.6) {
      recommendations.push('Consider reducing task complexity')
      recommendations.push('Increase context budget if recent failures due to token limits')
    }
    if (basePrediction < 0.7 && plannedAgents < 2) {
      recommendations.push('Consider using parallel agents for better success')
    }
    if (recentUsage && recentUsage.length > 2 && !recentUsage[recentUsage.length - 1].success) {
      recommendations.push('Recent failures detected - consider adjusting approach')
    }

    return {
      predictedSuccess: Math.round(basePrediction * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
      recommendations,
    }
  }

  private calculateRecencyWeight(lastUpdated: Date): number {
    const daysSinceUpdate = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24)
    return Math.max(0.1, 1 - daysSinceUpdate / 30)
  }

  getPatternInsight(patternType: string): PatternInsight | undefined {
    const data = this.patterns.get(patternType)
    if (!data) return undefined

    const successRate = data.sampleCount > 0 ? data.successCount / data.sampleCount : 0
    const avgEfficiency = data.sampleCount > 0 ? data.totalEfficiency / data.sampleCount : 0

    const recommendations = this.generateRecommendations(successRate, avgEfficiency)

    return {
      patternType: data.patternType,
      successRate,
      averageEfficiency: avgEfficiency,
      sampleSize: data.sampleCount,
      recommendations,
    }
  }

  private generateRecommendations(successRate: number, efficiency: number): string[] {
    const recommendations: string[] = []

    if (successRate < this.config.successThreshold) {
      recommendations.push('Low success rate - review task decomposition')
      recommendations.push('Consider increasing context for better understanding')
    }

    if (efficiency < this.config.efficiencyThresholdLow) {
      recommendations.push('Low efficiency - context may be too verbose')
      recommendations.push('Consider reducing parallel agents')
    }

    if (efficiency > this.config.efficiencyThresholdHigh && successRate > this.config.successThreshold) {
      recommendations.push('Pattern working well - maintain current settings')
    }

    return recommendations
  }

  getAllPatterns(): PatternInsight[] {
    return Array.from(this.patterns.values()).map((data) => {
      const successRate = data.sampleCount > 0 ? data.successCount / data.sampleCount : 0
      const avgEfficiency = data.sampleCount > 0 ? data.totalEfficiency / data.sampleCount : 0

      return {
        patternType: data.patternType,
        successRate,
        averageEfficiency: avgEfficiency,
        sampleSize: data.sampleCount,
        recommendations: this.generateRecommendations(successRate, avgEfficiency),
      }
    })
  }

  getStats(): {
    totalPatterns: number
    activePatterns: number
    avgSuccessRate: number
  } {
    const patterns = Array.from(this.patterns.values())
    const activePatterns = patterns.filter((p) => p.sampleCount >= this.config.minSamplesForLearning)
    const avgSuccessRate =
      patterns.length > 0
        ? patterns.reduce((sum, p) => sum + p.successCount / Math.max(1, p.sampleCount), 0) / patterns.length
        : 0

    return {
      totalPatterns: patterns.length,
      activePatterns: activePatterns.length,
      avgSuccessRate,
    }
  }

  clearStalePatterns(maxAgeDays: number = 60): number {
    const now = Date.now()
    const maxAge = maxAgeDays * 24 * 60 * 60 * 1000

    const staleKeys: string[] = []
    for (const [key, pattern] of this.patterns.entries()) {
      if (now - pattern.lastUpdated.getTime() > maxAge && pattern.sampleCount < this.config.minSamplesForLearning) {
        staleKeys.push(key)
      }
    }

    staleKeys.forEach((key) => this.patterns.delete(key))
    return staleKeys.length
  }

  updateConfig(config: Partial<LearningConfig>): void {
    this.config = { ...this.config, ...config }
  }
}

export const contextPatternLearner = new ContextPatternLearner()
