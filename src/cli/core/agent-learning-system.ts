import * as fsSync from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os from 'os'
import * as path from 'path'

export interface DecisionContext {
  task: string
  availableTools: string[]
  userContext: string
  previousAttempts: string[]
  urgency: 'low' | 'medium' | 'high'
}

export interface DecisionRecommendation {
  recommendedTool: string
  confidence: number
  reasoning: string
  alternatives: Array<{
    tool: string
    confidence: number
    reason: string
  }>
  preventiveActions: string[]
}

export interface LearningData {
  contextPattern: string
  successfulChoices: Array<{
    tool: string
    parameters: any
    outcome: 'success' | 'failure'
    executionTime: number
    timestamp: string
  }>
  failurePatterns: Array<{
    tool: string
    error: string
    frequency: number
  }>
  lastUpdated: string
}

export class AgentLearningSystem {
  private learningData: Map<string, LearningData> = new Map()
  private learningFile: string

  constructor() {
    this.learningFile = path.join(os.homedir(), '.nikcli', 'agent-learning.json')
    this.loadLearningData()
  }

  /**
   * Analyzes the context and provides recommendations for tool selection
   */
  async getToolRecommendations(context: DecisionContext): Promise<DecisionRecommendation> {
    const pattern = this.extractPattern(context)
    const learningData = this.learningData.get(pattern)

    if (!learningData) {
      // No previous learning - use basic heuristics
      return this.getHeuristicRecommendation(context)
    }

    // Analyze past successes for this pattern
    const toolScores = this.calculateToolScores(learningData, context)
    const topTool = this.getBestTool(toolScores)

    if (!topTool) {
      return this.getHeuristicRecommendation(context)
    }

    const alternatives = Object.entries(toolScores)
      .filter(([tool, score]) => tool !== topTool.tool && score > 0.3)
      .map(([tool, score]) => ({
        tool,
        confidence: score,
        reason: this.getToolReason(tool, learningData),
      }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3)

    return {
      recommendedTool: topTool.tool,
      confidence: topTool.score,
      reasoning: this.generateReasoning(topTool.tool, learningData, context),
      alternatives,
      preventiveActions: this.generatePreventiveActions(learningData, context),
    }
  }

  /**
   * Records the result of a decision for future learning
   */
  async recordDecision(
    context: DecisionContext,
    chosenTool: string,
    parameters: any,
    outcome: 'success' | 'failure',
    executionTime: number,
    error?: string
  ): Promise<void> {
    const pattern = this.extractPattern(context)
    let learningData = this.learningData.get(pattern)

    if (!learningData) {
      learningData = {
        contextPattern: pattern,
        successfulChoices: [],
        failurePatterns: [],
        lastUpdated: new Date().toISOString(),
      }
    }

    // Record choice
    learningData.successfulChoices.push({
      tool: chosenTool,
      parameters,
      outcome,
      executionTime,
      timestamp: new Date().toISOString(),
    })

    // Record failure pattern if necessary
    if (outcome === 'failure' && error) {
      const failurePattern = learningData.failurePatterns.find((fp) => fp.tool === chosenTool && fp.error === error)

      if (failurePattern) {
        failurePattern.frequency++
      } else {
        learningData.failurePatterns.push({
          tool: chosenTool,
          error,
          frequency: 1,
        })
      }
    }

    // Keep only the last N records to avoid excessive growth
    learningData.successfulChoices = learningData.successfulChoices.slice(-100) // Last 100 per pattern

    learningData.failurePatterns = learningData.failurePatterns
      .filter((fp) => fp.frequency > 1) // Keep only recurring errors
      .slice(-20) // Maximum 20 error patterns

    learningData.lastUpdated = new Date().toISOString()
    this.learningData.set(pattern, learningData)

    // Save periodically
    if (this.learningData.size % 10 === 0) {
      await this.saveLearningData()
    }
  }

  /**
   * Get learning insights for a specific agent
   */
  getAgentInsights(_agentType?: string): {
    totalPatterns: number
    mostSuccessfulTool: string
    commonFailures: Array<{ tool: string; error: string; frequency: number }>
    improvementSuggestions: string[]
    confidenceScore: number
  } {
    const allChoices = Array.from(this.learningData.values()).flatMap((ld) => ld.successfulChoices)

    const allFailures = Array.from(this.learningData.values()).flatMap((ld) => ld.failurePatterns)

    // Most successfully used tool
    const toolUsage = new Map<string, { success: number; total: number }>()
    allChoices.forEach((choice) => {
      if (!toolUsage.has(choice.tool)) {
        toolUsage.set(choice.tool, { success: 0, total: 0 })
      }
      const usage = toolUsage.get(choice.tool) || {}
      usage.total++
      if (choice.outcome === 'success') {
        usage.success++
      }
    })

    const bestTool =
      Array.from(toolUsage.entries()).sort((a, b) => b[1].success / b[1].total - a[1].success / a[1].total)[0]?.[0] ||
      'unknown'

    // Calcola confidence score complessivo
    const totalSuccesses = allChoices.filter((c) => c.outcome === 'success').length
    const totalAttempts = allChoices.length
    const confidenceScore = totalAttempts > 0 ? totalSuccesses / totalAttempts : 0.5

    // Suggerimenti di miglioramento
    const improvementSuggestions = this.generateImprovementSuggestions(allFailures, toolUsage)

    return {
      totalPatterns: this.learningData.size,
      mostSuccessfulTool: bestTool,
      commonFailures: allFailures.sort((a, b) => b.frequency - a.frequency).slice(0, 5),
      improvementSuggestions,
      confidenceScore: Number(confidenceScore.toFixed(2)),
    }
  }

  /**
   * Predice la probabilità di successo per una scelta specifica
   */
  predictSuccessProbability(context: DecisionContext, proposedTool: string, _parameters?: any): number {
    const pattern = this.extractPattern(context)
    const learningData = this.learningData.get(pattern)

    if (!learningData) {
      // Nessun dato storico - usa confidenza base
      return this.getBaseConfidence(proposedTool, context)
    }

    const relevantChoices = learningData.successfulChoices.filter((choice) => choice.tool === proposedTool)

    if (relevantChoices.length === 0) {
      return this.getBaseConfidence(proposedTool, context)
    }

    const successes = relevantChoices.filter((choice) => choice.outcome === 'success').length
    const probability = successes / relevantChoices.length

    // Aggiusta basandoti su failure patterns
    const relevantFailures = learningData.failurePatterns.filter((fp) => fp.tool === proposedTool)

    let adjustment = 0
    relevantFailures.forEach((failure) => {
      adjustment -= failure.frequency * 0.05 // Riduce probabilità per errori frequenti
    })

    return Math.max(0.1, Math.min(0.95, probability + adjustment))
  }

  /**
   * Sistema di raccomandazioni adattive basato su contesto
   */
  getAdaptiveStrategy(context: DecisionContext): {
    strategy: 'conservative' | 'aggressive' | 'exploratory'
    reasoning: string
    toolPreferences: string[]
  } {
    const pattern = this.extractPattern(context)
    const learningData = this.learningData.get(pattern)

    // Analizza storico per determinare strategia
    if (!learningData || learningData.successfulChoices.length < 5) {
      return {
        strategy: 'exploratory',
        reasoning: 'Limited historical data available - exploring different approaches',
        toolPreferences: this.getExploratoryTools(context),
      }
    }

    const recentChoices = learningData.successfulChoices.slice(-10)
    const successRate = recentChoices.filter((c) => c.outcome === 'success').length / recentChoices.length
    const avgExecutionTime = recentChoices.reduce((sum, c) => sum + c.executionTime, 0) / recentChoices.length

    if (successRate > 0.8 && avgExecutionTime < 5000) {
      return {
        strategy: 'conservative',
        reasoning: 'High success rate with good performance - stick to proven approaches',
        toolPreferences: this.getProvenTools(learningData),
      }
    } else if (context.urgency === 'high' && successRate > 0.6) {
      return {
        strategy: 'aggressive',
        reasoning: 'High urgency context - use fastest reliable tools',
        toolPreferences: this.getFastestReliableTools(learningData),
      }
    } else {
      return {
        strategy: 'exploratory',
        reasoning: 'Mixed results or new patterns - trying alternative approaches',
        toolPreferences: this.getAlternativeTools(learningData, context),
      }
    }
  }

  private extractPattern(context: DecisionContext): string {
    // Crea pattern identificativo basato su task e contesto
    const taskKey = context.task
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(' ')
      .slice(0, 3)
      .join('_')

    const contextKey = context.userContext
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(' ')
      .slice(0, 2)
      .join('_')

    return `${taskKey}_${contextKey}`
  }

  private calculateToolScores(learningData: LearningData, _context: DecisionContext): Record<string, number> {
    const scores: Record<string, number> = {}

    // Analizza scelte passate
    learningData.successfulChoices.forEach((choice) => {
      if (!scores[choice.tool]) scores[choice.tool] = 0

      // Peso basato su outcome
      const outcomeWeight = choice.outcome === 'success' ? 1 : -0.5

      // Peso basato su tempo (preferisci esecuzioni più veloci)
      const timeWeight = choice.executionTime < 3000 ? 1.2 : choice.executionTime < 10000 ? 1.0 : 0.8

      // Peso basato su recency (preferisci dati più recenti)
      const age = Date.now() - new Date(choice.timestamp).getTime()
      const recencyWeight = Math.max(0.5, 1 - age / (30 * 24 * 60 * 60 * 1000)) // Decadimento in 30 giorni

      scores[choice.tool] += outcomeWeight * timeWeight * recencyWeight * 0.1
    })

    // Penalizza tools con failure patterns
    learningData.failurePatterns.forEach((failure) => {
      if (scores[failure.tool]) {
        scores[failure.tool] -= failure.frequency * 0.05
      }
    })

    // Normalizza scores
    const maxScore = Math.max(...Object.values(scores))
    if (maxScore > 0) {
      Object.keys(scores).forEach((tool) => {
        scores[tool] = scores[tool] / maxScore
      })
    }

    return scores
  }

  private getBestTool(scores: Record<string, number>): { tool: string; score: number } | null {
    const entries = Object.entries(scores)
    if (entries.length === 0) return null

    const [tool, score] = entries.reduce((best, current) => (current[1] > best[1] ? current : best))

    return { tool, score }
  }

  private getHeuristicRecommendation(context: DecisionContext): DecisionRecommendation {
    // Raccomandazioni basate su euristica quando non c'è apprendimento
    const taskLower = context.task.toLowerCase()

    let recommendedTool = 'docs_request'
    let reasoning = 'Default recommendation for documentation tasks'

    if (taskLower.includes('file') || taskLower.includes('read') || taskLower.includes('write')) {
      recommendedTool = 'read_file'
      reasoning = 'File operation detected in task description'
    } else if (taskLower.includes('search') || taskLower.includes('find')) {
      recommendedTool = 'smart_docs_search'
      reasoning = 'Search operation detected in task description'
    } else if (taskLower.includes('analysis') || taskLower.includes('analyze')) {
      recommendedTool = 'code_analysis'
      reasoning = 'Analysis task detected in task description'
    } else if (taskLower.includes('git') || taskLower.includes('commit')) {
      recommendedTool = 'git_workflow'
      reasoning = 'Git operation detected in task description'
    }

    return {
      recommendedTool,
      confidence: 0.6,
      reasoning,
      alternatives: [],
      preventiveActions: ['Verify tool availability', 'Check required parameters'],
    }
  }

  private generateReasoning(tool: string, learningData: LearningData, _context: DecisionContext): string {
    const relevantChoices = learningData.successfulChoices.filter((c) => c.tool === tool)
    const successRate = relevantChoices.filter((c) => c.outcome === 'success').length / relevantChoices.length
    const avgTime = relevantChoices.reduce((sum, c) => sum + c.executionTime, 0) / relevantChoices.length

    return (
      `Tool ${tool} recommended based on ${(successRate * 100).toFixed(0)}% success rate ` +
      `in similar contexts (avg execution: ${avgTime.toFixed(0)}ms)`
    )
  }

  private generatePreventiveActions(learningData: LearningData, _context: DecisionContext): string[] {
    const actions: string[] = []

    // Analizza failure patterns comuni
    const commonFailures = learningData.failurePatterns.sort((a, b) => b.frequency - a.frequency).slice(0, 3)

    commonFailures.forEach((failure) => {
      if (failure.error.includes('permission')) {
        actions.push('Verify file/directory permissions before execution')
      } else if (failure.error.includes('not found')) {
        actions.push('Check file/path existence before operation')
      } else if (failure.error.includes('timeout')) {
        actions.push('Consider breaking down large operations into smaller chunks')
      }
    })

    if (actions.length === 0) {
      actions.push('Monitor execution for any unusual patterns')
    }

    return actions
  }

  private generateImprovementSuggestions(
    failures: Array<{ tool: string; error: string; frequency: number }>,
    toolUsage: Map<string, { success: number; total: number }>
  ): string[] {
    const suggestions: string[] = []

    // Analizza pattern di fallimento
    const groupedFailures = new Map<string, number>()
    failures.forEach((f) => {
      groupedFailures.set(f.error, (groupedFailures.get(f.error) || 0) + f.frequency)
    })

    const topFailures = Array.from(groupedFailures.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)

    topFailures.forEach(([error, _frequency]) => {
      if (error.includes('permission')) {
        suggestions.push('Implement permission checking before file operations')
      } else if (error.includes('timeout')) {
        suggestions.push('Add timeout handling and retry mechanisms')
      } else if (error.includes('not found')) {
        suggestions.push('Add existence validation before operations')
      }
    })

    // Analizza tool performance
    const lowPerformanceTools = Array.from(toolUsage.entries())
      .filter(([_tool, usage]) => usage.total > 5 && usage.success / usage.total < 0.7)
      .map(([tool]) => tool)

    if (lowPerformanceTools.length > 0) {
      suggestions.push(`Review and improve reliability of: ${lowPerformanceTools.join(', ')}`)
    }

    return suggestions
  }

  private getBaseConfidence(tool: string, _context: DecisionContext): number {
    // Confidence di base senza dati storici
    const toolConfidence: Record<string, number> = {
      docs_request: 0.8,
      smart_docs_search: 0.85,
      read_file: 0.9,
      write_file: 0.8,
      code_analysis: 0.75,
      git_workflow: 0.7,
      execute_command: 0.65,
    }

    return toolConfidence[tool] || 0.6
  }

  private getExploratoryTools(_context: DecisionContext): string[] {
    return ['docs_request', 'smart_docs_search', 'read_file', 'code_analysis']
  }

  private getProvenTools(learningData: LearningData): string[] {
    return learningData.successfulChoices
      .filter((c) => c.outcome === 'success')
      .map((c) => c.tool)
      .slice(0, 3)
  }

  private getFastestReliableTools(learningData: LearningData): string[] {
    return learningData.successfulChoices
      .filter((c) => c.outcome === 'success' && c.executionTime < 5000)
      .sort((a, b) => a.executionTime - b.executionTime)
      .map((c) => c.tool)
      .slice(0, 3)
  }

  private getAlternativeTools(learningData: LearningData, context: DecisionContext): string[] {
    const usedTools = new Set(learningData.successfulChoices.map((c) => c.tool))
    const allTools = context.availableTools
    return allTools.filter((tool) => !usedTools.has(tool)).slice(0, 3)
  }

  private getToolReason(tool: string, learningData: LearningData): string {
    const choices = learningData.successfulChoices.filter((c) => c.tool === tool)
    const successes = choices.filter((c) => c.outcome === 'success').length
    return `${successes}/${choices.length} success rate in similar contexts`
  }

  private async loadLearningData(): Promise<void> {
    try {
      if (fsSync.existsSync(this.learningFile)) {
        const data = fsSync.readFileSync(this.learningFile, 'utf-8')
        const parsed = JSON.parse(data)
        this.learningData = new Map(Object.entries(parsed))
      }
    } catch (_error) {
      console.debug('Could not load agent learning data, starting fresh')
    }
  }

  private async saveLearningData(): Promise<void> {
    try {
      // Ensure directory exists before saving
      const dir = path.dirname(this.learningFile)
      if (!fsSync.existsSync(dir)) {
        fsSync.mkdirSync(dir, { recursive: true })
      }

      const data = Object.fromEntries(this.learningData)
      await fs.writeFile(this.learningFile, JSON.stringify(data, null, 2))
    } catch (error) {
      console.debug('Failed to save agent learning data:', error)
    }
  }
}

// Singleton instance
export const agentLearningSystem = new AgentLearningSystem()
