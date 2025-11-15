import chalk from 'chalk'
import { ToolRegistry } from '../tools/tool-registry'
import { type ToolRecommendation, toolRouter } from './tool-router'
import type { MLInferenceEngine } from '../ml/ml-inference-engine'

/**
 * Dynamic Tool Selector
 * Enhances AI tool selection by using a wider variety of available tools
 * instead of always using the same ones
 */
export class DynamicToolSelector {
  private toolUsageHistory: Map<string, number> = new Map()
  private toolSuccessRate: Map<string, { successes: number; failures: number }> = new Map()
  private lastUsedTools: string[] = []
  private maxHistorySize = 50
  private toolRegistry: ToolRegistry
  private mlInferenceEngine: MLInferenceEngine | null = null

  constructor(workingDirectory: string = process.cwd()) {
    this.toolRegistry = new ToolRegistry(workingDirectory)
  }

  /**
   * Set ML inference engine for success prediction
   */
  setMLInferenceEngine(engine: MLInferenceEngine): void {
    this.mlInferenceEngine = engine
  }

  /**
   * Select tools dynamically based on context and usage patterns
   */
  async selectToolsDynamically(
    userMessage: string,
    context?: {
      taskType?: 'read' | 'write' | 'search' | 'analyze' | 'execute' | 'mixed'
      preferredTools?: string[]
      avoidTools?: string[]
      maxTools?: number
    }
  ): Promise<ToolRecommendation[]> {
    const maxTools = context?.maxTools || 4

    // 1. Get base recommendations from router
    const baseRecommendations = toolRouter.analyzeMessage({
      role: 'user',
      content: userMessage,
    })

    // 2. Apply diversity bonus to underused tools
    const enhancedRecommendations = this.applyDiversityBonus(baseRecommendations)

    // 3. Apply success rate weighting
    const weightedRecommendations = this.applySuccessRateWeighting(enhancedRecommendations)

    // 4. Apply context-specific filters
    let filteredRecommendations = weightedRecommendations

    if (context?.preferredTools && context.preferredTools.length > 0) {
      // Boost preferred tools
      filteredRecommendations = filteredRecommendations.map((rec) => {
        if (context.preferredTools?.includes(rec.tool)) {
          return { ...rec, confidence: rec.confidence * 1.3 }
        }
        return rec
      })
    }

    if (context?.avoidTools && context.avoidTools.length > 0) {
      // Remove avoided tools
      filteredRecommendations = filteredRecommendations.filter((rec) => !context.avoidTools?.includes(rec.tool))
    }

    // 5. Discover and suggest alternative tools
    const alternativeTools = this.discoverAlternativeTools(userMessage, context?.taskType)
    const combinedRecommendations = [...filteredRecommendations, ...alternativeTools]

    // 5.5: 🤖 ML Success Prediction (non-blocking)
    let finalRecommendations = combinedRecommendations
    if (this.mlInferenceEngine) {
      try {
        const successRates = await this.mlInferenceEngine.predictSuccessRates(
          combinedRecommendations.map(r => r.tool),
          context || {}
        )

        // Filter tools with low predicted success rate (<60%)
        finalRecommendations = combinedRecommendations
          .map((rec) => ({
            ...rec,
            confidence: rec.confidence * (successRates[rec.tool] || 0.85), // Apply success probability
          }))
          .filter((rec) => (successRates[rec.tool] || 0.85) > 0.6)
      } catch {
        // Silent ML failure - use rule-based selection
        finalRecommendations = combinedRecommendations
      }
    }

    // 6. Sort by final confidence and return top N
    const sortedRecommendations = finalRecommendations.sort((a, b) => b.confidence - a.confidence).slice(0, maxTools)

    // 7. Update usage history
    sortedRecommendations.forEach((rec) => {
      this.recordToolUsage(rec.tool)
    })

    this.displayDynamicSelection(sortedRecommendations)

    return sortedRecommendations
  }

  /**
   * Apply diversity bonus to underused tools
   */
  private applyDiversityBonus(recommendations: ToolRecommendation[]): ToolRecommendation[] {
    return recommendations.map((rec) => {
      const usageCount = this.toolUsageHistory.get(rec.tool) || 0
      const averageUsage = this.getAverageUsage()

      // Give bonus to tools used less than average
      let diversityBonus = 0
      if (usageCount < averageUsage) {
        diversityBonus = 0.15 * (1 - usageCount / (averageUsage || 1))
      }

      // Penalty for recently used tools
      const recentPenalty = this.lastUsedTools.includes(rec.tool) ? 0.1 : 0

      return {
        ...rec,
        confidence: Math.min(1.0, rec.confidence + diversityBonus - recentPenalty),
        reason: `${rec.reason}${diversityBonus > 0 ? ' (diversity bonus)' : ''}${recentPenalty > 0 ? ' (recently used)' : ''}`,
      }
    })
  }

  /**
   * Apply success rate weighting
   */
  private applySuccessRateWeighting(recommendations: ToolRecommendation[]): ToolRecommendation[] {
    return recommendations.map((rec) => {
      const stats = this.toolSuccessRate.get(rec.tool)
      if (!stats || stats.successes + stats.failures === 0) {
        return rec // No history, keep original confidence
      }

      const successRate = stats.successes / (stats.successes + stats.failures)
      const weightingFactor = 0.2 * (successRate - 0.5) // -0.1 to +0.1

      return {
        ...rec,
        confidence: Math.max(0, Math.min(1.0, rec.confidence + weightingFactor)),
        reason: `${rec.reason} (success rate: ${(successRate * 100).toFixed(0)}%)`,
      }
    })
  }

  /**
   * Discover alternative tools based on task type
   */
  private discoverAlternativeTools(
    userMessage: string,
    taskType?: 'read' | 'write' | 'search' | 'analyze' | 'execute' | 'mixed'
  ): ToolRecommendation[] {
    const alternatives: ToolRecommendation[] = []

    // Get all available tools from registry
    const allTools = this.toolRegistry.listTools()

    // Task-specific tool suggestions
    const taskToolMap: Record<string, string[]> = {
      read: ['read-file-tool', 'multi-read-tool', 'grep-tool', 'list-tool'],
      write: ['write-file-tool', 'edit-tool', 'multi-edit-tool', 'replace-in-file-tool'],
      search: ['grep-tool', 'find-files-tool', 'doc-search-tool', 'smart-docs-search-tool'],
      analyze: [
        'vision-analysis-tool',
        'code-analysis-tool',
        'doc-search-tool',
        'browserbase-tool',
        'diff-tool',
        'tree-tool',
      ],
      execute: ['bash-tool', 'run-command-tool', 'git-tools'],
      mixed: ['multi-read-tool', 'multi-edit-tool', 'json-patch-tool'],
    }

    const relevantTools = taskType ? taskToolMap[taskType] || [] : []

    // Check for underused relevant tools
    for (const toolName of relevantTools) {
      if (allTools.includes(toolName)) {
        const usageCount = this.toolUsageHistory.get(toolName) || 0
        const averageUsage = this.getAverageUsage()

        // Only suggest if significantly underused
        if (usageCount < averageUsage * 0.5) {
          const metadata = this.toolRegistry.getToolMetadata(toolName)
          alternatives.push({
            tool: toolName,
            confidence: 0.4 + 0.1 * (1 - usageCount / (averageUsage || 1)),
            reason: `Alternative ${metadata?.category || 'tool'} (underused)`,
            suggestedParams: {},
          })
        }
      }
    }

    return alternatives
  }

  /**
   * Record tool usage for tracking
   */
  recordToolUsage(toolName: string): void {
    const currentCount = this.toolUsageHistory.get(toolName) || 0
    this.toolUsageHistory.set(toolName, currentCount + 1)

    // Update last used tools
    this.lastUsedTools = [toolName, ...this.lastUsedTools.filter((t) => t !== toolName)].slice(0, 10)
  }

  /**
   * Record tool execution result for success rate tracking
   */
  recordToolResult(toolName: string, success: boolean): void {
    const stats = this.toolSuccessRate.get(toolName) || { successes: 0, failures: 0 }

    if (success) {
      stats.successes++
    } else {
      stats.failures++
    }

    this.toolSuccessRate.set(toolName, stats)
  }

  /**
   * Get average tool usage
   */
  private getAverageUsage(): number {
    if (this.toolUsageHistory.size === 0) return 0

    const total = Array.from(this.toolUsageHistory.values()).reduce((sum, count) => sum + count, 0)
    return total / this.toolUsageHistory.size
  }

  /**
   * Get tool usage statistics
   */
  getUsageStatistics(): {
    totalSelections: number
    mostUsed: Array<{ tool: string; count: number }>
    leastUsed: Array<{ tool: string; count: number }>
    successRates: Array<{ tool: string; rate: number; total: number }>
  } {
    const totalSelections = Array.from(this.toolUsageHistory.values()).reduce((sum, count) => sum + count, 0)

    const usageArray = Array.from(this.toolUsageHistory.entries()).map(([tool, count]) => ({ tool, count }))

    const mostUsed = usageArray.sort((a, b) => b.count - a.count).slice(0, 10)
    const leastUsed = usageArray.sort((a, b) => a.count - b.count).slice(0, 10)

    const successRates = Array.from(this.toolSuccessRate.entries())
      .map(([tool, stats]) => ({
        tool,
        rate: stats.successes / (stats.successes + stats.failures),
        total: stats.successes + stats.failures,
      }))
      .filter((item) => item.total > 0)
      .sort((a, b) => b.rate - a.rate)

    return {
      totalSelections,
      mostUsed,
      leastUsed,
      successRates,
    }
  }

  /**
   * Reset usage history (for testing or manual reset)
   */
  resetHistory(): void {
    this.toolUsageHistory.clear()
    this.toolSuccessRate.clear()
    this.lastUsedTools = []
    console.log(chalk.blue('🔄 Tool usage history reset'))
  }

  /**
   * Display dynamic tool selection information
   */
  private displayDynamicSelection(recommendations: ToolRecommendation[]): void {
    if (process.env.NIKCLI_DEBUG_TOOLS === '1') {
      console.log(chalk.blue('\n🎯 Dynamic Tool Selection:'))
      recommendations.forEach((rec, index) => {
        const usageCount = this.toolUsageHistory.get(rec.tool) || 0
        const stats = this.toolSuccessRate.get(rec.tool)
        const successRate = stats ? stats.successes / (stats.successes + stats.failures) : 0

        console.log(
          chalk.gray(
            `  ${index + 1}. ${rec.tool} (confidence: ${(rec.confidence * 100).toFixed(0)}%, used: ${usageCount}x, success: ${(successRate * 100).toFixed(0)}%)`
          )
        )
      })
      console.log()
    }
  }

  /**
   * Show usage statistics
   */
  showStatistics(): void {
    const stats = this.getUsageStatistics()

    console.log(chalk.blue('\n📊 Tool Usage Statistics:'))
    console.log(chalk.gray(`Total tool selections: ${stats.totalSelections}`))

    if (stats.mostUsed.length > 0) {
      console.log(chalk.yellow('\n🔥 Most Used Tools:'))
      stats.mostUsed.slice(0, 5).forEach((item, index) => {
        console.log(chalk.gray(`  ${index + 1}. ${item.tool}: ${item.count}x`))
      })
    }

    if (stats.leastUsed.length > 0) {
      console.log(chalk.cyan('\n❄️  Least Used Tools:'))
      stats.leastUsed.slice(0, 5).forEach((item, index) => {
        console.log(chalk.gray(`  ${index + 1}. ${item.tool}: ${item.count}x`))
      })
    }

    if (stats.successRates.length > 0) {
      console.log(chalk.green('\n✅ Success Rates:'))
      stats.successRates.slice(0, 5).forEach((item, index) => {
        console.log(
          chalk.gray(`  ${index + 1}. ${item.tool}: ${(item.rate * 100).toFixed(0)}% (${item.total} executions)`)
        )
      })
    }
  }
}

// Factory function
export function createDynamicToolSelector(workingDirectory: string): DynamicToolSelector {
  return new DynamicToolSelector(workingDirectory)
}
