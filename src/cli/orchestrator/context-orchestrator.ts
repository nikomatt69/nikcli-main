import { EventEmitter } from 'node:events'
import type { AgentTodo } from '../core/agent-todo-manager'
import { AdaptiveContextOptimizer } from './adaptive-context-optimizer'
import { ContextPatternLearner } from './context-pattern-learner'
import { ParallelTaskContextManager } from './parallel-task-context-manager'
import type { OrchestrationConfig, OrchestrationResult } from './types/orchestrator-types'
import { UserPreferenceManager } from './user-preference-manager'

interface SessionUsage {
  sessionId: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  model: string
  timestamp: Date
}

interface DynamicBudget {
  baseBudget: number
  availableForContext: number
  reservedForOutput: number
  currentUsage: number
  adjustmentFactor: number
  recentUsageHistory: SessionUsage[]
}

export class ContextOrchestrator extends EventEmitter {
  private preferenceManager: UserPreferenceManager
  private optimizer: AdaptiveContextOptimizer
  private taskContextManager: ParallelTaskContextManager
  private patternLearner: ContextPatternLearner
  private config: OrchestrationConfig
  private dynamicBudget: DynamicBudget
  private sessionUsageHistory: Map<string, SessionUsage[]> = new Map()
  private currentTaskId: string | null = null

  constructor(config?: OrchestrationConfig) {
    super()
    this.preferenceManager = new UserPreferenceManager()
    this.optimizer = new AdaptiveContextOptimizer()
    this.taskContextManager = new ParallelTaskContextManager()
    this.patternLearner = new ContextPatternLearner()
    this.config = {
      maxAgents: config?.maxAgents ?? this.preferenceManager.getMaxParallelAgents(),
      enforceBudget: config?.enforceBudget ?? true,
      enableLearning: config?.enableLearning ?? true,
      verbosity: config?.verbosity ?? this.preferenceManager.getContextVerbosity(),
    }

    const maxTokens = this.preferenceManager.getMaxContextTokens()
    this.dynamicBudget = {
      baseBudget: maxTokens,
      availableForContext: Math.round(maxTokens * 0.85),
      reservedForOutput: Math.round(maxTokens * 0.15),
      currentUsage: 0,
      adjustmentFactor: 1.0,
      recentUsageHistory: [],
    }
  }

  async orchestrate(todos: AgentTodo[], taskId: string): Promise<OrchestrationResult> {
    this.currentTaskId = taskId

    const warnings: string[] = []

    const complexity = this.optimizer.calculateTaskComplexity(todos)

    this.updateDynamicBudget()

    const agentCount = this.determineAgentCount(complexity)

    const executionPlan = this.taskContextManager.createExecutionPlan(todos, agentCount)

    const contextSlices = new Map<string, any>()
    for (const chain of executionPlan.chains) {
      for (const [agentId, slice] of chain.agentSlices) {
        const fullSlice = this.taskContextManager.getAgentContext(chain.chainId, agentId)
        if (fullSlice) {
          const verbosity = this.config.verbosity ?? 'standard'
          contextSlices.set(`${chain.chainId}:${agentId}`, this.applyVerbosity(fullSlice, verbosity))
        }
      }
    }

    const budget = this.calculateDynamicBudget(agentCount)

    if (this.config.enforceBudget && budget.currentUsage > budget.availableForContext) {
      warnings.push('Context budget exceeded - context will be truncated')
    }

    const recentUsage = this.getRecentUsageForPrediction()
    const prediction = await this.patternLearner.predictSuccess(
      complexity.score,
      executionPlan.totalAgents,
      budget.baseBudget,
      recentUsage
    )

    if (prediction.predictedSuccess < 0.6) {
      warnings.push('Low success predicted - consider adjusting approach')
      warnings.push(...prediction.recommendations)
    }

    this.emit('orchestrated', {
      taskId,
      todos: todos.length,
      agents: executionPlan.totalAgents,
      plan: executionPlan.strategy,
      complexity: complexity.score,
    })

    return {
      success: true,
      contextSlices,
      budget,
      complexity,
      executionPlan: executionPlan.strategy,
      warnings,
    }
  }

  private updateDynamicBudget(): void {
    const recentHistory = this.dynamicBudget.recentUsageHistory

    if (recentHistory.length >= 5) {
      const avgCompletionTokens = recentHistory.slice(-5).reduce((sum, u) => sum + u.completionTokens, 0) / 5

      const avgPromptTokens = recentHistory.slice(-5).reduce((sum, u) => sum + u.promptTokens, 0) / 5

      const baseMax = this.preferenceManager.getMaxContextTokens()

      const outputReserveRatio = avgCompletionTokens / baseMax
      if (outputReserveRatio > 0.15) {
        this.dynamicBudget.reservedForOutput = Math.round(avgCompletionTokens * 1.2)
        this.dynamicBudget.adjustmentFactor = Math.max(0.7, 1 - (outputReserveRatio - 0.15))
      } else if (outputReserveRatio < 0.1 && recentHistory.length > 0) {
        this.dynamicBudget.reservedForOutput = Math.round(baseMax * 0.12)
        this.dynamicBudget.adjustmentFactor = Math.min(1.2, 1 + (0.15 - outputReserveRatio))
      }
    }

    this.dynamicBudget.availableForContext = this.dynamicBudget.baseBudget - this.dynamicBudget.reservedForOutput
    this.dynamicBudget.currentUsage = 0
  }

  private calculateDynamicBudget(agentCount: number): any {
    const perAgentBudget = Math.round(this.dynamicBudget.availableForContext / Math.max(1, agentCount))
    const sharedBudget = Math.round(
      this.dynamicBudget.availableForContext * this.preferenceManager.getSharedContextRatio()
    )
    const specificBudget = this.dynamicBudget.availableForContext - sharedBudget

    return {
      totalBudget: this.dynamicBudget.baseBudget,
      sharedAllocation: sharedBudget,
      perAgentAllocation: perAgentBudget,
      reservedForOutput: this.dynamicBudget.reservedForOutput,
      currentUsage: this.dynamicBudget.currentUsage,
      adjustmentFactor: this.dynamicBudget.adjustmentFactor,
      agents: new Map(),
    }
  }

  private determineAgentCount(complexity: any): number {
    const preferred = this.preferenceManager.getPreferredAgentCount()
    const recommended = complexity.recommendedAgentCount

    if (Math.abs(preferred - recommended) <= 1) {
      return Math.round(preferred)
    }

    const prediction = this.patternLearner.getPatternInsight(`${complexity.score > 70 ? 'high' : 'low'}_complexity`)

    if (prediction && prediction.sampleSize >= 3) {
      if (prediction.successRate > 0.7 && prediction.averageEfficiency > 0.7) {
        return Math.round(preferred)
      }
    }

    return recommended
  }

  private applyVerbosity(slice: any, verbosity: string): any {
    if (verbosity === 'minimal') {
      return {
        ...slice,
        sharedContext: this.summarizeContext(slice.sharedContext),
        agentSpecificContext: '',
        taskContext: this.summarizeContext(slice.taskContext),
      }
    } else if (verbosity === 'standard') {
      return {
        ...slice,
        agentSpecificContext:
          slice.agentSpecificContext.length > 500
            ? slice.agentSpecificContext.slice(0, 500) + '...'
            : slice.agentSpecificContext,
      }
    }
    return slice
  }

  private summarizeContext(context: string): string {
    if (!context) return ''

    const lines = context.split('\n').filter((l) => l.trim())

    if (lines.length <= 5) return context

    const firstLine = lines[0] ?? ''
    const lastLines = lines.slice(-2).join('\n')

    return `${firstLine}\n...\n${lastLines}`
  }

  private getRecentUsageForPrediction(): {
    tokensUsed: number
    success: boolean
  }[] {
    const history = this.sessionUsageHistory.get(this.currentTaskId ?? '') ?? []
    return history.slice(-10).map((h) => ({
      tokensUsed: h.totalTokens,
      success: h.completionTokens > 0,
    }))
  }

  recordUsage(
    sessionId: string,
    usage: {
      promptTokens: number
      completionTokens: number
      totalTokens: number
    },
    model: string
  ): void {
    const sessionUsage: SessionUsage = {
      sessionId,
      ...usage,
      model,
      timestamp: new Date(),
    }

    const history = this.sessionUsageHistory.get(this.currentTaskId ?? '') ?? []
    history.push(sessionUsage)

    if (history.length > 20) {
      history.shift()
    }
    this.sessionUsageHistory.set(this.currentTaskId ?? '', history)

    this.dynamicBudget.recentUsageHistory.push(sessionUsage)
    if (this.dynamicBudget.recentUsageHistory.length > 50) {
      this.dynamicBudget.recentUsageHistory.shift()
    }

    this.dynamicBudget.currentUsage += usage.promptTokens

    if (this.config.enableLearning && this.currentTaskId) {
      this.patternLearner.learn(
        {
          taskId: this.currentTaskId,
          agentId: sessionId,
          timestamp: new Date(),
          duration: 0,
          success: usage.completionTokens > 0,
          contextTokensUsed: usage.promptTokens,
          contextBudget: this.dynamicBudget.baseBudget,
          efficiencyRatio: usage.promptTokens / this.dynamicBudget.baseBudget,
          complexityScore: 50,
        },
        []
      )
    }

    this.emit('usageRecorded', sessionUsage)
  }

  async reportOutcome(
    chainId: string,
    agentId: string,
    outcome: {
      success: boolean
      tokensUsed: number
      duration: number
      todos: AgentTodo[]
    }
  ): Promise<void> {
    await this.taskContextManager.updateAfterExecution(chainId, agentId, {
      success: outcome.success,
      tokensUsed: outcome.tokensUsed,
      duration: outcome.duration,
    })

    if (this.config.enableLearning) {
      await this.patternLearner.learn(
        {
          taskId: chainId,
          agentId,
          timestamp: new Date(),
          duration: outcome.duration,
          success: outcome.success,
          contextTokensUsed: outcome.tokensUsed,
          contextBudget: this.dynamicBudget.baseBudget,
          efficiencyRatio: this.dynamicBudget.baseBudget > 0 ? outcome.tokensUsed / this.dynamicBudget.baseBudget : 0,
          complexityScore: this.optimizer.calculateTaskComplexity(outcome.todos).score,
        },
        outcome.todos
      )
    }
  }

  getAgentContext(chainId: string, agentId: string, verbosity?: string): string {
    const slice = this.taskContextManager.getAgentContext(chainId, agentId)
    if (!slice) return ''

    const v = verbosity ?? this.config.verbosity ?? 'standard'

    if (v === 'minimal') {
      return `${slice.sharedContext}\n\n${slice.taskContext}`
    }

    return `${slice.sharedContext}\n\n${slice.agentSpecificContext}\n\n${slice.taskContext}`
  }

  getDynamicBudget(): DynamicBudget {
    return { ...this.dynamicBudget }
  }

  getConfig(): OrchestrationConfig {
    return { ...this.config }
  }

  updateConfig(config: Partial<OrchestrationConfig>): void {
    this.config = { ...this.config, ...config }
  }

  getStatus(): {
    activeChains: number
    totalChains: number
    learningStats: { patterns: number; avgSuccessRate: number }
    preferences: {
      agentCount: number
      maxTokens: number
      parallelEnabled: boolean
    }
    budget: {
      baseBudget: number
      availableForContext: number
      adjustmentFactor: number
    }
  } {
    const chainStatus = this.taskContextManager.getChainStatus()
    const patternStats = this.patternLearner.getStats()
    const prefs = this.preferenceManager.getAllPreferences()

    return {
      activeChains: chainStatus.activeChains,
      totalChains: chainStatus.totalChains,
      learningStats: {
        patterns: patternStats.totalPatterns,
        avgSuccessRate: patternStats.avgSuccessRate,
      },
      preferences: {
        agentCount: prefs.preferredAgentCount,
        maxTokens: prefs.maxContextTokens,
        parallelEnabled: prefs.parallelExecution,
      },
      budget: {
        baseBudget: this.dynamicBudget.baseBudget,
        availableForContext: this.dynamicBudget.availableForContext,
        adjustmentFactor: this.dynamicBudget.adjustmentFactor,
      },
    }
  }

  async cleanup(): Promise<void> {
    await this.preferenceManager.cleanup()
    await this.taskContextManager.cleanupStaleChains()

    this.sessionUsageHistory.clear()
    this.dynamicBudget.recentUsageHistory = []

    this.currentTaskId = null
  }
}

export const contextOrchestrator = new ContextOrchestrator()
