import type { CoreMessage } from 'ai'
import { z } from 'zod'
import { type ToolRecommendation, ToolRouter } from './tool-router'

// ⚡︎ Enhanced Intent Analysis Schemas
const IntentAnalysis = z.object({
  primaryAction: z.string(),
  targetObjects: z.array(z.string()),
  modifiers: z.array(z.string()),
  urgency: z.enum(['low', 'normal', 'high', 'critical']),
  complexity: z.number().min(0).max(10),
  requiredCapabilities: z.array(z.string()),
  contextualHints: z.array(z.string()).optional(),
  technicalDomain: z.string().optional(),
  userExpertiseLevel: z.enum(['beginner', 'intermediate', 'advanced']).default('intermediate'),
})

const EnhancedToolRecommendation = z.object({
  tool: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  suggestedParams: z.record(z.any()).optional(),
  alternativeTools: z.array(z.string()).optional(),
  executionOrder: z.number().optional(),
  dependencies: z.array(z.string()).optional(),
  estimatedDuration: z.number().optional(),
  requiresApproval: z.boolean().default(false),
  contextualRelevance: z.number().min(0).max(1),
  userExperienceScore: z.number().min(0).max(1),
})

const ProjectContext = z.object({
  projectType: z.string().optional(),
  frameworks: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  recentCommands: z.array(z.string()).optional(),
  openFiles: z.array(z.string()).optional(),
  currentDirectory: z.string().optional(),
  gitStatus: z
    .object({
      branch: z.string().optional(),
      modified: z.array(z.string()).optional(),
      staged: z.array(z.string()).optional(),
    })
    .optional(),
})

type IntentAnalysis = z.infer<typeof IntentAnalysis>
type EnhancedToolRecommendation = z.infer<typeof EnhancedToolRecommendation>
type ProjectContext = z.infer<typeof ProjectContext>

export class EnhancedToolRouter extends ToolRouter {
  private recentCommands: string[] = []
  private userPatterns: Map<string, number> = new Map()
  private projectContextCache: ProjectContext | null = null
  private lastAnalysisTime: number = 0
  private smartSuggestionCache: Map<string, EnhancedToolRecommendation[]> = new Map()

  constructor() {
    super()
    this.initializeEnhancedPatterns()
  }

  private initializeEnhancedPatterns(): void {
    // Initialize user pattern learning
    this.loadUserPatterns()

    // Set up cache cleanup
    setInterval(() => this.cleanupCache(), 5 * 60 * 1000) // 5 minutes
  }

  /**
   * 🎯 Enhanced Message Analysis with Context Awareness
   */
  analyzeMessageEnhanced(message: CoreMessage, projectContext?: ProjectContext | null): EnhancedToolRecommendation[] {
    // Cache project context for reuse
    if (projectContext) {
      this.projectContextCache = projectContext
    }

    const content = typeof message.content === 'string' ? message.content : String(message.content)

    // Use cached context if no new context provided
    const effectiveContext = projectContext || this.projectContextCache

    // Check cache first
    const cacheKey = this.generateCacheKey(content, effectiveContext || undefined)
    const cached = this.smartSuggestionCache.get(cacheKey)
    if (cached && Date.now() - this.lastAnalysisTime < 30000) {
      // 30 second cache
      return cached
    }

    // Perform enhanced analysis
    const intentAnalysis = this.analyzeIntentEnhanced(content)
    const contextualFactors = this.analyzeContextualFactors(content, effectiveContext || undefined)
    const basicRecommendations = this.analyzeMessage(message)

    // Convert to enhanced recommendations
    const enhancedRecommendations = this.enhanceRecommendations(
      basicRecommendations,
      intentAnalysis,
      contextualFactors,
      effectiveContext || undefined
    )

    // Apply smart ranking
    const rankedRecommendations = this.applySmartRanking(enhancedRecommendations, content)

    // Cache and return
    this.smartSuggestionCache.set(cacheKey, rankedRecommendations)
    this.lastAnalysisTime = Date.now()

    return rankedRecommendations
  }

  /**
   * ⚡︎ Enhanced Intent Analysis with NLP and Context
   */
  private analyzeIntentEnhanced(content: string): IntentAnalysis {
    const lowerContent = content.toLowerCase()

    // Advanced action detection with context
    const actionPatterns = {
      read: {
        pattern: /\b(read|show|display|view|see|check|examine|look\s+at|get\s+content)\b/,
        weight: 1.0,
      },
      write: {
        pattern: /\b(write|create|generate|make|build|add|insert|new|implement)\b/,
        weight: 1.0,
      },
      search: {
        pattern: /\b(search|find|locate|discover|explore|look\s+for|grep|scan)\b/,
        weight: 1.0,
      },
      modify: {
        pattern: /\b(modify|edit|change|update|alter|fix|repair|refactor|improve)\b/,
        weight: 1.0,
      },
      execute: {
        pattern: /\b(run|execute|start|launch|deploy|install|build|compile|test)\b/,
        weight: 1.0,
      },
      analyze: {
        pattern: /\b(analyze|investigate|review|audit|assess|evaluate|inspect|debug)\b/,
        weight: 1.0,
      },

      manage_packages: {
        pattern: /\b(manage|update|install|uninstall|add|remove|package)\b/,
        weight: 1.0,
      },
      git_workflow: {
        pattern:
          /\b(git|commit|branch|merge|pull|push|repository|repo|workflow|history|log|status|changes|diff|conflict|rebase|cherry-pick)\b/,
        weight: 1.0,
      },
    }

    let primaryAction = 'analyze'
    let maxConfidence = 0

    for (const [action, config] of Object.entries(actionPatterns)) {
      const matches = lowerContent.match(config.pattern)
      if (matches) {
        const confidence = matches.length * config.weight
        if (confidence > maxConfidence) {
          maxConfidence = confidence
          primaryAction = action
        }
      }
    }

    // Extract target objects
    const targetObjects = this.extractTargetObjects(lowerContent)

    // Extract modifiers
    const modifiers = this.extractModifiers(lowerContent)

    // Determine urgency
    const urgency = this.determineUrgency(lowerContent)

    // Calculate complexity
    const complexity = this.calculateComplexity(lowerContent, targetObjects, modifiers)

    // Determine required capabilities
    const requiredCapabilities = this.determineRequiredCapabilities(primaryAction, targetObjects, modifiers)

    // Extract contextual hints
    const contextualHints = this.extractContextualHints(lowerContent)

    // Determine technical domain
    const technicalDomain = this.determineTechnicalDomain(lowerContent)

    return {
      primaryAction,
      targetObjects,
      modifiers,
      urgency,
      complexity,
      requiredCapabilities,
      contextualHints,
      technicalDomain,
      userExpertiseLevel: 'intermediate', // Default, could be learned
    }
  }

  /**
   * 🔍 Contextual Factors Analysis
   */
  private analyzeContextualFactors(content: string, projectContext?: ProjectContext) {
    return {
      hasProjectContext: !!projectContext,
      isInGitRepo: !!projectContext?.gitStatus,
      hasFrameworkContext: !!projectContext?.frameworks?.length,
      recentCommandSimilarity: this.calculateCommandSimilarity(content),
      timeContext: this.getTimeContext(),
      workspaceRelevance: this.calculateWorkspaceRelevance(content, projectContext),
    }
  }

  /**
   * ⭐ Enhance Basic Recommendations
   */
  private enhanceRecommendations(
    basicRecommendations: ToolRecommendation[],
    intentAnalysis: IntentAnalysis,
    _contextualFactors: any,
    projectContext?: ProjectContext
  ): EnhancedToolRecommendation[] {
    return basicRecommendations.map((rec) => {
      const contextualRelevance = this.calculateContextualRelevance(rec, intentAnalysis, projectContext)

      const userExperienceScore = this.calculateUserExperienceScore(rec)

      const alternativeTools = this.suggestAlternativeTools(rec.tool, intentAnalysis)

      const estimatedDuration = this.estimateExecutionDuration(rec.tool, intentAnalysis)

      const requiresApproval = this.determineApprovalRequirement(rec.tool, intentAnalysis)

      return {
        ...rec,
        contextualRelevance,
        userExperienceScore,
        alternativeTools,
        estimatedDuration,
        requiresApproval,
        executionOrder: this.calculateExecutionOrder(rec.tool, intentAnalysis),
      }
    })
  }

  /**
   * 🎯 Smart Ranking with Machine Learning-like Scoring
   */
  private applySmartRanking(
    recommendations: EnhancedToolRecommendation[],
    content: string
  ): EnhancedToolRecommendation[] {
    return recommendations
      .map((rec) => {
        // Calculate composite score
        const compositeScore = this.calculateCompositeScore(rec, content)
        return { ...rec, confidence: compositeScore }
      })
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5) // Top 5 recommendations
  }

  /**
   * 📊 Calculate Composite Score
   */
  private calculateCompositeScore(rec: EnhancedToolRecommendation, _content: string): number {
    const weights = {
      originalConfidence: 0.3,
      contextualRelevance: 0.25,
      userExperienceScore: 0.2,
      userPatternMatch: 0.15,
      recency: 0.1,
    }

    const userPatternMatch = this.getUserPatternMatch(rec.tool)
    const recencyBoost = this.getRecencyBoost(rec.tool)

    return Math.min(
      1.0,
      rec.confidence * weights.originalConfidence +
      rec.contextualRelevance * weights.contextualRelevance +
      rec.userExperienceScore * weights.userExperienceScore +
      userPatternMatch * weights.userPatternMatch +
      recencyBoost * weights.recency
    )
  }

  // Helper methods for enhanced analysis

  private extractTargetObjects(content: string): string[] {
    const objectPatterns = [
      /\b(file|component|function|class|module|package|dependency|test)\b/g,
      /\b(\w+\.(js|ts|jsx|tsx|py|java|go|rs|php))\b/g,
      /\b(package\.json|tsconfig\.json|\.env|README\.md)\b/g,
    ]

    const objects: string[] = []
    objectPatterns.forEach((pattern) => {
      const matches = content.match(pattern)
      if (matches) objects.push(...matches)
    })

    return [...new Set(objects)]
  }

  private extractModifiers(content: string): string[] {
    const modifierPatterns = [
      /\b(quickly|fast|urgent|immediately|slow|careful|secure|safe)\b/g,
      /\b(all|every|some|specific|particular|only)\b/g,
      /\b(new|old|recent|latest|current|previous)\b/g,
    ]

    const modifiers: string[] = []
    modifierPatterns.forEach((pattern) => {
      const matches = content.match(pattern)
      if (matches) modifiers.push(...matches)
    })

    return [...new Set(modifiers)]
  }

  private determineUrgency(content: string): 'low' | 'normal' | 'high' | 'critical' {
    const urgencyKeywords = {
      critical: ['urgent', 'emergency', 'critical', 'immediately', 'asap', 'now'],
      high: ['quickly', 'fast', 'soon', 'priority', 'important'],
      low: ['later', 'eventually', 'when possible', 'low priority'],
    }

    for (const [level, keywords] of Object.entries(urgencyKeywords)) {
      if (keywords.some((keyword) => content.toLowerCase().includes(keyword))) {
        return level as 'low' | 'normal' | 'high' | 'critical'
      }
    }

    return 'normal'
  }

  private calculateComplexity(content: string, targetObjects: string[], modifiers: string[]): number {
    let complexity = 1

    // Base complexity from content length
    complexity += Math.min(3, content.length / 100)

    // Complexity from number of targets
    complexity += targetObjects.length * 0.5

    // Complexity from modifiers
    complexity += modifiers.length * 0.3

    // Complexity from technical terms
    const technicalTerms = content.match(
      /\b(async|await|promise|callback|api|database|orm|ci\/cd|docker|kubernetes)\b/gi
    )
    if (technicalTerms) {
      complexity += technicalTerms.length * 0.4
    }

    return Math.min(10, complexity)
  }

  private determineRequiredCapabilities(
    primaryAction: string,
    targetObjects: string[],
    _modifiers: string[]
  ): string[] {
    const capabilityMap = {
      read: ['file_system', 'parsing'],
      write: ['file_system', 'generation', 'validation'],
      search: ['indexing', 'pattern_matching', 'semantic_search'],
      modify: ['file_system', 'parsing', 'generation', 'validation'],
      execute: ['command_execution', 'process_management'],
      analyze: ['parsing', 'analysis', 'reporting'],
      generate_code: ['write_file', 'validation'],
      manage_packages: ['package_management', 'validation'],
      git_workflow: ['git_operations', 'validation'],
      doc_search: ['doc_search', 'validation'],
      semantic_search: ['semantic_search', 'validation'],
    }

    const baseCapabilities = capabilityMap[primaryAction as keyof typeof capabilityMap] || ['general']

    // Add capabilities based on target objects
    const additionalCapabilities: string[] = []

    if (targetObjects.some((obj) => obj.includes('.git') || obj.includes('commit'))) {
      additionalCapabilities.push('git_operations')
    }

    if (targetObjects.some((obj) => obj.includes('package.json') || obj.includes('npm'))) {
      additionalCapabilities.push('package_management')
    }

    // Config update detection (JSON/YAML/env)
    if (
      targetObjects.some((obj) =>
        ['.yaml', '.yml', '.json', 'config', 'configuration', '.env', 'settings'].some((kw) => obj.includes(kw))
      )
    ) {
      additionalCapabilities.push('config_update')
    }

    return [...new Set([...baseCapabilities, ...additionalCapabilities])]
  }

  private extractContextualHints(content: string): string[] {
    const hintPatterns = [
      /\b(like|similar to|same as|based on)\s+(.+?)(?:\s|$)/g,
      /\b(using|with|via|through)\s+(\w+)/g,
      /\b(in|inside|within)\s+(.+?)(?:\s|$)/g,
    ]

    const hints: string[] = []
    hintPatterns.forEach((pattern) => {
      const matches = content.matchAll(pattern)
      for (const match of matches) {
        if (match[2]) hints.push(match[2].trim())
      }
    })

    return hints
  }

  private determineTechnicalDomain(content: string): string | undefined {
    const domainKeywords = {
      frontend: ['react', 'vue', 'angular', 'javascript', 'typescript', 'css', 'html', 'component'],
      backend: ['api', 'server', 'database', 'node', 'express', 'fastify', 'endpoint'],
      devops: ['docker', 'kubernetes', 'ci/cd', 'deploy', 'infrastructure', 'aws', 'gcp'],
      mobile: ['react native', 'flutter', 'ios', 'android', 'mobile', 'app'],
      testing: ['test', 'spec', 'jest', 'cypress', 'unit test', 'integration'],
      security: ['security', 'auth', 'permission', 'vulnerability', 'encrypt', 'token'],
    }

    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      if (keywords.some((keyword) => content.toLowerCase().includes(keyword))) {
        return domain
      }
    }

    return undefined
  }

  // Utility methods

  private generateCacheKey(content: string, projectContext?: ProjectContext): string {
    const contentHash = content.slice(0, 50).replace(/\s+/g, '_')
    const contextHash = projectContext
      ? `${projectContext.projectType}_${projectContext.currentDirectory}`.slice(0, 20)
      : 'no_context'
    return `${contentHash}_${contextHash}`
  }

  private calculateContextualRelevance(
    rec: ToolRecommendation,
    intentAnalysis: IntentAnalysis,
    projectContext?: ProjectContext
  ): number {
    let relevance = 0.5 // Base relevance

    // Boost relevance based on technical domain match
    if (projectContext?.frameworks && intentAnalysis.technicalDomain) {
      const frameworkMatch = projectContext.frameworks.some((fw) =>
        intentAnalysis.technicalDomain?.includes(fw.toLowerCase())
      )
      if (frameworkMatch) relevance += 0.2
    }

    // Boost relevance based on file context
    if (projectContext?.openFiles && rec.tool.includes('file')) {
      relevance += 0.15
    }

    // Boost relevance based on git context
    if (projectContext?.gitStatus && rec.tool.includes('git')) {
      relevance += 0.15
    }

    return Math.min(1.0, relevance)
  }

  private calculateUserExperienceScore(rec: ToolRecommendation): number {
    const toolUsageCount = this.userPatterns.get(rec.tool) || 0
    const maxUsage = Math.max(...Array.from(this.userPatterns.values()), 1)
    return toolUsageCount / maxUsage
  }

  private suggestAlternativeTools(tool: string, _intentAnalysis: IntentAnalysis): string[] {
    const alternatives: Record<string, string[]> = {
      read_file: ['explore_directory', 'semantic_search', 'web_search'],
      write_file: ['write_file', 'multi_edit', 'replace_in_file'],
      web_search: ['doc_search', 'semantic_search'],
      execute_command: ['manage_packages', 'git_workflow', 'web_search'],
      analyze_project: ['code_analysis', 'read_file'],

      manage_packages: ['dependency_analysis', 'read_file'],
      git_workflow: ['git_workflow', 'read_file'],
      doc_search: ['doc_search', 'read_file', 'web_search'],
      semantic_search: ['semantic_search', 'read_file'],
    }

    return alternatives[tool] || []
  }

  private estimateExecutionDuration(tool: string, intentAnalysis: IntentAnalysis): number {
    const baseDurations: Record<string, number> = {
      read_file: 2,
      write_file: 10,
      web_search: 10,
      execute_command: 15,
      analyze_project: 30,

    }

    const baseDuration = baseDurations[tool] || 10
    const complexityMultiplier = 1 + intentAnalysis.complexity / 10

    return Math.round(baseDuration * complexityMultiplier)
  }

  private determineApprovalRequirement(tool: string, intentAnalysis: IntentAnalysis): boolean {
    const alwaysApprovalTools = ['execute_command', 'manage_packages', 'git_workflow']
    const highRiskActions = ['modify', 'execute']

    return (
      alwaysApprovalTools.includes(tool) ||
      (highRiskActions.includes(intentAnalysis.primaryAction) && intentAnalysis.complexity > 5)
    )
  }

  private calculateExecutionOrder(tool: string, _intentAnalysis: IntentAnalysis): number {
    const orderMap: Record<string, number> = {
      ide_context: 1,
      read_file: 2,
      analyze_project: 3,
      search: 4,
      write_file: 5,
      execute_command: 6,
    }

    return orderMap[tool] || 5
  }

  private calculateCommandSimilarity(content: string): number {
    const recentContent = this.recentCommands.slice(-5).join(' ').toLowerCase()
    const currentContent = content.toLowerCase()

    const commonWords = currentContent.split(' ').filter((word) => recentContent.includes(word) && word.length > 3)

    return commonWords.length / Math.max(currentContent.split(' ').length, 1)
  }

  private getTimeContext() {
    const hour = new Date().getHours()
    return {
      timeOfDay: hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening',
      isWorkingHours: hour >= 9 && hour <= 17,
      dayOfWeek: new Date().getDay(),
    }
  }

  private calculateWorkspaceRelevance(content: string, projectContext?: ProjectContext): number {
    if (!projectContext) return 0.3

    let relevance = 0.5

    // Check if content mentions current directory files
    if (projectContext.openFiles) {
      const mentionedFiles = projectContext.openFiles.filter((file) =>
        content.toLowerCase().includes(file.toLowerCase())
      )
      relevance += mentionedFiles.length * 0.1
    }

    // Check if content mentions project frameworks
    if (projectContext.frameworks) {
      const mentionedFrameworks = projectContext.frameworks.filter((fw) =>
        content.toLowerCase().includes(fw.toLowerCase())
      )
      relevance += mentionedFrameworks.length * 0.15
    }

    return Math.min(1.0, relevance)
  }

  private getUserPatternMatch(tool: string): number {
    return (this.userPatterns.get(tool) || 0) / 10 // Normalize to 0-1
  }

  private getRecencyBoost(tool: string): number {
    const recentToolUsage = this.recentCommands.slice(-3).filter((cmd) => cmd.includes(tool)).length
    return Math.min(0.3, recentToolUsage * 0.1)
  }

  // Pattern learning methods

  public recordToolUsage(tool: string, content: string): void {
    this.userPatterns.set(tool, (this.userPatterns.get(tool) || 0) + 1)
    this.recentCommands.push(content)

    // Keep only recent commands
    if (this.recentCommands.length > 50) {
      this.recentCommands = this.recentCommands.slice(-30)
    }

    this.saveUserPatterns()
  }

  private loadUserPatterns(): void {
    // In a real implementation, this would load from persistent storage
    // For now, use in-memory storage
  }

  private saveUserPatterns(): void {
    // In a real implementation, this would save to persistent storage
    // For now, keep in memory
  }

  private cleanupCache(): void {
    // Clear old cache entries
    if (this.smartSuggestionCache.size > 100) {
      const entries = Array.from(this.smartSuggestionCache.entries())
      const toKeep = entries.slice(-50)
      this.smartSuggestionCache.clear()
      toKeep.forEach(([key, value]) => this.smartSuggestionCache.set(key, value))
    }
  }
}

export const enhancedToolRouter = new EnhancedToolRouter()
