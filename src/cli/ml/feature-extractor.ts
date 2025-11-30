import { createHash } from 'crypto'
import { structuredLogger } from '../utils/structured-logger'

interface ExtractedFeatures {
  intentHash: string
  features: Record<string, number>
  context: Record<string, any>
}

class FeatureExtractor {
  private intentKeywords: Map<string, string[]>

  constructor() {
    this.intentKeywords = this.buildIntentKeywords()
  }

  async extract(userIntent: string, context: Record<string, any>): Promise<ExtractedFeatures> {
    try {
      const intentHash = this.hashIntent(userIntent)
      const features = this.extractFeatures(userIntent, context)
      const enrichedContext = this.enrichContext(context, userIntent)

      return {
        intentHash,
        features,
        context: enrichedContext,
      }
    } catch (error) {
      structuredLogger.warning('Feature extraction failed', `FeatureExtractor ${error}`)
      return {
        intentHash: '',
        features: {},
        context: {},
      }
    }
  }

  private extractFeatures(userIntent: string, context: Record<string, any>): Record<string, number> {
    const features: Record<string, number> = {}

    // Intent-based features
    const intentFeatures = this.extractIntentFeatures(userIntent)
    Object.assign(features, intentFeatures)

    // Context-based features
    const contextFeatures = this.extractContextFeatures(context)
    Object.assign(features, contextFeatures)

    // Historical features
    if (context.toolSuccessHistory) {
      const historyFeatures = this.extractHistoryFeatures(context.toolSuccessHistory)
      Object.assign(features, historyFeatures)
    }

    // Performance features
    if (context.performanceMetrics) {
      const perfFeatures = this.extractPerformanceFeatures(context.performanceMetrics)
      Object.assign(features, perfFeatures)
    }

    return features
  }

  private extractIntentFeatures(userIntent: string): Record<string, number> {
    const features: Record<string, number> = {}
    const lowerIntent = userIntent.toLowerCase()

    // Check for intent keywords
    for (const [intentType, keywords] of this.intentKeywords) {
      let matchCount = 0
      for (const keyword of keywords) {
        if (lowerIntent.includes(keyword)) {
          matchCount += 1
        }
      }
      if (matchCount > 0) {
        features[`intent_${intentType}`] = Math.min(matchCount / keywords.length, 1)
      }
    }

    // Intent length feature (normalized)
    features['intent_length'] = Math.min(userIntent.length / 500, 1)

    // Intent complexity (by keyword count)
    const keywords = userIntent.match(/\w+/g) || []
    features['intent_complexity'] = Math.min(keywords.length / 20, 1)

    return features
  }

  private extractContextFeatures(context: Record<string, any>): Record<string, number> {
    const features: Record<string, number> = {}

    // File types present
    if (context.fileTypes && Array.isArray(context.fileTypes)) {
      features['has_typescript'] = context.fileTypes.includes('ts') ? 1 : 0
      features['has_javascript'] = context.fileTypes.includes('js') ? 1 : 0
      features['has_python'] = context.fileTypes.includes('py') ? 1 : 0
      features['has_json'] = context.fileTypes.includes('json') ? 1 : 0
      features['file_type_diversity'] = Math.min(context.fileTypes.length / 10, 1)
    }

    // Workspace features
    if (context.workspaceType) {
      features['is_git_repo'] = context.workspaceType === 'git' ? 1 : 0
      features['is_monorepo'] = context.workspaceType === 'monorepo' ? 1 : 0
    }

    // Project size features
    if (context.projectSize) {
      features['project_size_normalized'] = Math.min(context.projectSize / 1000, 1)
    }

    // Session features
    if (context.sessionLength) {
      features['session_length_normalized'] = Math.min(context.sessionLength / 3600, 1)
    }

    return features
  }

  private extractHistoryFeatures(toolSuccessHistory: Record<string, any>): Record<string, number> {
    const features: Record<string, number> = {}

    // Aggregate success rates
    const successRates: number[] = []
    let totalExecutions = 0

    for (const [tool, stats] of Object.entries(toolSuccessHistory)) {
      if (stats && typeof stats === 'object') {
        const rate = stats.successRate || 0
        const executions = stats.executions || 0

        successRates.push(rate)
        totalExecutions += executions

        // Individual tool features
        features[`tool_success_${tool}`] = rate
      }
    }

    // Aggregate features
    if (successRates.length > 0) {
      features['avg_tool_success_rate'] = successRates.reduce((a, b) => a + b, 0) / successRates.length
      features['min_tool_success_rate'] = Math.min(...successRates)
      features['max_tool_success_rate'] = Math.max(...successRates)
    }

    features['total_tool_executions_normalized'] = Math.min(totalExecutions / 1000, 1)

    return features
  }

  private extractPerformanceFeatures(performanceMetrics: Record<string, any>): Record<string, number> {
    const features: Record<string, number> = {}

    // Latency features
    if (performanceMetrics.latency) {
      features['avg_latency_normalized'] = Math.min(performanceMetrics.latency.avg / 5000, 1)
      features['p95_latency_normalized'] = Math.min(performanceMetrics.latency.p95 / 10000, 1)
    }

    // Cache features
    if (performanceMetrics.cache) {
      features['cache_hit_rate'] = performanceMetrics.cache.hitRate || 0
      features['cache_memory_usage_normalized'] = Math.min(performanceMetrics.cache.memoryUsed / 100000000, 1)
    }

    // Token features
    if (performanceMetrics.tokens) {
      features['tokens_per_session_normalized'] = Math.min(performanceMetrics.tokens.total / 100000, 1)
    }

    return features
  }

  private enrichContext(context: Record<string, any>, userIntent: string): Record<string, any> {
    const enriched = { ...context }

    // Add derived intent type
    enriched.intentType = this.classifyIntentType(userIntent)

    // Add intent difficulty estimation
    enriched.estimatedDifficulty = this.estimateDifficulty(userIntent)

    // Add tool category suggestions
    enriched.suggestedToolCategories = this.suggestToolCategories(userIntent)

    return enriched
  }

  private classifyIntentType(userIntent: string): string {
    const lowerIntent = userIntent.toLowerCase()

    if (lowerIntent.match(/read|view|show|display|get|fetch/i)) {
      return 'read'
    }
    if (lowerIntent.match(/write|create|add|new|generate/i)) {
      return 'write'
    }
    if (lowerIntent.match(/edit|modify|change|update|replace/i)) {
      return 'edit'
    }
    if (lowerIntent.match(/search|find|grep|locate|look/i)) {
      return 'search'
    }
    if (lowerIntent.match(/delete|remove|clean|rm/i)) {
      return 'delete'
    }
    if (lowerIntent.match(/commit|push|pull|merge|branch|git/i)) {
      return 'git'
    }
    if (lowerIntent.match(/test|run|execute|compile|build/i)) {
      return 'execute'
    }

    return 'general'
  }

  private estimateDifficulty(userIntent: string): number {
    let difficulty = 0.5 // Base difficulty

    // Increase for complex operations
    if (userIntent.match(/refactor|optimize|analyze|complex|multiple|batch/i)) {
      difficulty += 0.2
    }

    // Decrease for simple operations
    if (userIntent.match(/simple|quick|fast|single/i)) {
      difficulty -= 0.15
    }

    // Check for multi-step operations
    if (userIntent.split(/and|then|after|followed/i).length > 2) {
      difficulty += 0.1
    }

    return Math.max(0.1, Math.min(difficulty, 0.9))
  }

  private suggestToolCategories(userIntent: string): string[] {
    const categories: Set<string> = new Set()
    const lowerIntent = userIntent.toLowerCase()

    if (lowerIntent.match(/read|view|display/i)) {
      categories.add('filesystem')
    }
    if (lowerIntent.match(/write|create|edit/i)) {
      categories.add('filesystem')
    }
    if (lowerIntent.match(/search|find|grep/i)) {
      categories.add('search')
    }
    if (lowerIntent.match(/git|commit|push/i)) {
      categories.add('git')
    }
    if (lowerIntent.match(/test|build|compile/i)) {
      categories.add('system')
    }

    return Array.from(categories)
  }

  private hashIntent(intent: string): string {
    return createHash('sha256').update(intent).digest('hex').substring(0, 16)
  }

  private buildIntentKeywords(): Map<string, string[]> {
    return new Map([
      ['read', ['read', 'view', 'show', 'display', 'get', 'fetch']],
      ['write', ['write', 'create', 'add', 'new', 'generate', 'output']],
      ['edit', ['edit', 'modify', 'change', 'update', 'replace', 'fix']],
      ['search', ['search', 'find', 'grep', 'locate', 'look', 'query']],
      ['delete', ['delete', 'remove', 'clean', 'rm', 'erase']],
      ['git', ['commit', 'push', 'pull', 'merge', 'branch', 'git']],
      ['test', ['test', 'verify', 'check', 'validate', 'assert']],
      ['build', ['build', 'compile', 'run', 'execute', 'start']],
    ])
  }
}

export { FeatureExtractor }
export type { ExtractedFeatures }
