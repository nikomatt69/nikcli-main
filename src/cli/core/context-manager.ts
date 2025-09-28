import path from 'node:path'
import type { CoreMessage } from 'ai'
import chalk from 'chalk'
import { calculateTokenCost, getModelPricing, TOKEN_LIMITS } from '../config/token-limits'
import { unifiedEmbeddingInterface } from '../context/unified-embedding-interface'
// Import RAG and context systems for integration
import { workspaceContext } from '../context/workspace-context'
import { contextEnhancer, type SmartContext } from './context-enhancer'
import { tokenTelemetry } from './token-telemetry'

/** Summary of workspace analysis. */
export interface ContextSummary {
  totalFiles: number
  totalDirs: number
  languages: Record<string, number>
  importantFiles: string[]
  projectType?: string
  frameworks?: string[]
  dependencies?: string[]
  gitInfo?: {
    branch?: string
    lastCommit?: string
    hasUncommitted?: boolean
  }
}

interface MessageMetrics {
  estimatedTokens: number
  importance: number
  timestamp: Date
  type: 'user' | 'assistant' | 'system' | 'tool'
  semanticHash?: string
  ragRelevance?: number
  contextSources?: string[]
}

interface ContextMetrics {
  totalMessages: number
  estimatedTokens: number
  tokenLimit: number
  compressionRatio: number
  ragIntegration?: boolean
  semanticSources?: number
  cacheHitRate?: number
  optimizationTime?: number
  costEstimate?: {
    inputCost: number
    outputCost: number
    totalCost: number
    model: string
  }
  // Enhanced RAG integration metrics
  embeddingStats?: {
    cacheHitRate: number
    totalQueries: number
    averageLatency: number
    costSaved: number
  }
  semanticAnalysis?: {
    queryConfidence: number
    intentDetected: string
    entitiesFound: number
    expansionRate: number
  }
  vectorStore?: {
    provider: string
    indexedDocuments: number
    searchLatency: number
    uptime: number
  }
}

interface OptimizationStrategy {
  preserveSystemMessages: boolean
  minRecentMessages: number
  useSemanticCompression: boolean
  enableRAGIntegration: boolean
  enableSmartSummarization: boolean
  targetCompressionRatio?: number
  maxContextSources?: number
}

interface ContextOptimizationResult {
  optimizedMessages: CoreMessage[]
  metrics: ContextMetrics
  smartContext?: SmartContext
  optimizationSteps: string[]
  semanticPreservation: number
}

/** Intelligent Context Manager with RAG integration and advanced optimization */
export class ContextManager {
  private readonly MAX_TOKENS = TOKEN_LIMITS.CHAT?.MAX_CONTEXT_TOKENS ?? 18000 // Leave buffer for response
  private readonly MIN_MESSAGES = 4 // Always keep recent messages
  private readonly MAX_METRICS_SIZE = 1000 // Maximum cached metrics
  private sessionMaxTokens: number | null = null // adaptive per-session cap

  // Enhanced caching and metrics
  private messageMetrics: Map<string, MessageMetrics> = new Map()
  private contextCache: Map<string, ContextOptimizationResult> = new Map()
  private workspaceCache: ContextSummary | null = null
  private lastWorkspaceAnalysis: number = 0
  private readonly WORKSPACE_CACHE_TTL = 300000 // 5 minutes
  private readonly CONTEXT_CACHE_TTL = 60000 // 1 minute for message context cache

  // Optimization strategies
  private defaultStrategy: OptimizationStrategy = {
    preserveSystemMessages: true,
    minRecentMessages: 4,
    useSemanticCompression: true,
    enableRAGIntegration: true,
    enableSmartSummarization: true,
    targetCompressionRatio: 0.7,
    maxContextSources: 5,
  }

  // Performance metrics
  private performanceMetrics = {
    totalOptimizations: 0,
    averageOptimizationTime: 0,
    cacheHits: 0,
    ragIntegrations: 0,
  }

  /** Get active max tokens considering session override */
  private get activeMaxTokens(): number {
    return this.sessionMaxTokens ?? this.MAX_TOKENS
  }

  /**
   * Set or reset the per-session max tokens cap.
   * Pass null to reset to default TOKEN_LIMITS.
   */
  setMaxTokensForSession(cap: number | null): void {
    if (cap === null) {
      this.sessionMaxTokens = null
      return
    }
    const minCap = 1000 // safety floor
    const maxCap = this.MAX_TOKENS
    this.sessionMaxTokens = Math.max(minCap, Math.min(maxCap, Math.floor(cap)))
  }

  private checkMetricsSize(): void {
    const currentSize = this.messageMetrics.size
    if (currentSize <= this.MAX_METRICS_SIZE) {
      return
    }

    const numEntriesToRemove = currentSize - this.MAX_METRICS_SIZE
    let removedCount = 0
    const keysIterator = this.messageMetrics.keys()

    while (removedCount < numEntriesToRemove) {
      const nextKey = keysIterator.next()
      if (nextKey.done) {
        break
      }
      this.messageMetrics.delete(nextKey.value)
      removedCount += 1
    }

    if (removedCount > 0) {
      console.log(chalk.yellow(`⚠️ Trimmed ${removedCount} oldest message metrics to cap at ${this.MAX_METRICS_SIZE}`))
    }
  }
  /**
   * Estimate tokens in a message (rough approximation)
   * 1 token ≈ 4 characters for English text
   */
  private estimateTokens(content: string): number {
    return Math.ceil(content.length / 4)
  }
  private hashMessage(message: CoreMessage): string {
    const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
    // Simple hash function - consider using crypto.createHash for production
    let hash = 0
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return `msg-${message.role}-${hash}`
  }
  /**
   * Calculate importance score for a message
   */
  private calculateImportance(message: CoreMessage, index: number, total: number): number {
    let importance = 0

    // Recent messages are more important
    const recency = (total - index) / total
    importance += recency * 0.4

    // Message type importance
    if (message.role === 'system') importance += 0.3
    if (message.role === 'user') importance += 0.2
    if (message.role === 'assistant') importance += 0.1

    // Content-based importance
    const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)

    // Important keywords boost importance
    const importantKeywords = ['error', 'bug', 'fix', 'implement', 'create', 'modify', 'delete', 'update']
    const keywordCount = importantKeywords.filter((kw) => content.toLowerCase().includes(kw)).length
    importance += keywordCount * 0.05

    // Length penalty for very long messages
    if (content.length > 5000) importance -= 0.1

    return Math.max(0, Math.min(1, importance))
  }

  /**
   * Enhanced context optimization with RAG integration and smart compression
   */
  async optimizeContextAdvanced(
    messages: CoreMessage[],
    strategy?: Partial<OptimizationStrategy>,
    model?: string
  ): Promise<ContextOptimizationResult> {
    const startTime = Date.now()
    const activeStrategy = { ...this.defaultStrategy, ...strategy }
    const optimizationSteps: string[] = []

    console.log(chalk.blue('⚡︎ Starting advanced context optimization...'))

    // Check cache first
    const cacheKey = this.generateContextCacheKey(messages, activeStrategy)
    const cached = this.contextCache.get(cacheKey)
    if (cached && Date.now() - startTime < this.CONTEXT_CACHE_TTL) {
      this.performanceMetrics.cacheHits++
      console.log(chalk.green('✓ Using cached optimization result'))
      return cached
    }

    this.checkMetricsSize()

    if (messages.length === 0) {
      return {
        optimizedMessages: messages,
        metrics: {
          totalMessages: 0,
          estimatedTokens: 0,
          tokenLimit: this.activeMaxTokens,
          compressionRatio: 0,
          optimizationTime: Date.now() - startTime,
        },
        optimizationSteps: ['Empty message array'],
        semanticPreservation: 1.0,
      }
    }

    let optimizedMessages = [...messages]
    let smartContext: SmartContext | undefined

    // Step 1: RAG Integration
    if (activeStrategy.enableRAGIntegration) {
      optimizationSteps.push('RAG Integration')
      const ragResult = await this.integrateRAGContext(messages, activeStrategy)
      if (ragResult.smartContext) {
        smartContext = ragResult.smartContext
        optimizedMessages = ragResult.enhancedMessages
        this.performanceMetrics.ragIntegrations++
        console.log(chalk.cyan(`🔗 RAG integrated: ${ragResult.smartContext.sources.length} context sources`))
      }
    }

    // Step 2: Calculate initial metrics with cost estimation
    const initialMetrics = this.calculateAdvancedMetrics(optimizedMessages, model)
    optimizationSteps.push(`Initial: ${initialMetrics.totalMessages} msgs, ${initialMetrics.estimatedTokens} tokens`)

    // Step 3: Token-based optimization if needed
    if (initialMetrics.estimatedTokens > this.activeMaxTokens) {
      optimizationSteps.push('Token-based compression')
      const compressed = await this.performIntelligentCompression(optimizedMessages, activeStrategy)
      optimizedMessages = compressed.messages
      optimizationSteps.push(...compressed.steps)
    }

    // Step 4: Semantic optimization
    if (activeStrategy.useSemanticCompression && optimizedMessages.length > activeStrategy.minRecentMessages * 2) {
      optimizationSteps.push('Semantic compression')
      const semantic = await this.performSemanticCompression(optimizedMessages, activeStrategy)
      optimizedMessages = semantic.messages
      optimizationSteps.push(...semantic.steps)
    }

    // Final metrics calculation
    const finalMetrics = this.calculateAdvancedMetrics(optimizedMessages, model)
    const semanticPreservation = this.calculateSemanticPreservation(messages, optimizedMessages)

    const optimizationTime = Date.now() - startTime
    this.updatePerformanceMetrics(optimizationTime)

    console.log(chalk.green(`✓ Advanced optimization completed in ${optimizationTime}ms`))
    console.log(chalk.gray(`   ${messages.length} → ${optimizedMessages.length} messages`))
    console.log(chalk.gray(`   ${initialMetrics.estimatedTokens} → ${finalMetrics.estimatedTokens} tokens`))
    console.log(chalk.gray(`   Semantic preservation: ${Math.round(semanticPreservation * 100)}%`))

    const result: ContextOptimizationResult = {
      optimizedMessages,
      metrics: {
        ...finalMetrics,
        compressionRatio:
          (initialMetrics.estimatedTokens - finalMetrics.estimatedTokens) / initialMetrics.estimatedTokens,
        ragIntegration: !!smartContext,
        semanticSources: smartContext?.sources.length || 0,
        cacheHitRate: this.getCacheHitRate(),
        optimizationTime,
        // Enhanced RAG integration metrics
        embeddingStats: this.getEmbeddingStats(),
        semanticAnalysis: this.getSemanticAnalysisStats(),
        vectorStore: this.getVectorStoreStats(),
      },
      smartContext,
      optimizationSteps,
      semanticPreservation,
    }

    // Cache the result
    this.cacheOptimizationResult(cacheKey, result)

    return result
  }

  /**
   * Legacy method for backward compatibility - calls advanced method internally
   */
  optimizeContext(messages: CoreMessage[]): { optimizedMessages: CoreMessage[]; metrics: ContextMetrics } {
    // For sync compatibility, use a simplified version without RAG integration
    console.log(chalk.blue('⚡︎ Using legacy context optimization (consider upgrading to optimizeContextAdvanced)'))

    this.checkMetricsSize()
    if (messages.length === 0) {
      return {
        optimizedMessages: messages,
        metrics: { totalMessages: 0, estimatedTokens: 0, tokenLimit: this.activeMaxTokens, compressionRatio: 0 },
      }
    }

    // Calculate metrics for all messages
    let totalTokens = 0
    messages.forEach((message, index) => {
      const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
      const tokens = this.estimateTokens(content)
      const importance = this.calculateImportance(message, index, messages.length)

      totalTokens += tokens
      const contentHash = this.hashMessage(message)
      this.messageMetrics.set(contentHash, {
        estimatedTokens: tokens,
        importance,
        timestamp: new Date(),
        type: message.role as any,
      })
    })

    // Telemetry: prompt snapshot
    tokenTelemetry.recordPrompt({
      source: 'ContextManager.optimizeContext',
      estimatedTokens: totalTokens,
      tokenLimit: this.activeMaxTokens,
      messages: messages.length,
    })

    // If within limits, return as-is
    if (totalTokens <= this.activeMaxTokens) {
      return {
        optimizedMessages: messages,
        metrics: {
          totalMessages: messages.length,
          estimatedTokens: totalTokens,
          tokenLimit: this.activeMaxTokens,
          compressionRatio: 0,
        },
      }
    }

    console.log(chalk.yellow(`⚠️ Context optimization needed: ${totalTokens} tokens > ${this.activeMaxTokens} limit`))

    // Use enhanced compression but synchronously
    const optimized = this.compressContextIntelligent(messages)
    const optimizedTokens = this.calculateTotalTokens(optimized)

    // Telemetry: optimization effect
    tokenTelemetry.recordOptimization({
      source: 'ContextManager.optimizeContext',
      beforeTokens: totalTokens,
      afterTokens: optimizedTokens,
      compressionRatio: optimizedTokens / Math.max(1, totalTokens),
    })

    console.log(
      chalk.green(
        `✓ Context optimized: ${messages.length} → ${optimized.length} messages, ${totalTokens} → ${optimizedTokens} tokens`
      )
    )

    return {
      optimizedMessages: optimized,
      metrics: {
        totalMessages: optimized.length,
        estimatedTokens: optimizedTokens,
        tokenLimit: this.MAX_TOKENS,
        compressionRatio: (totalTokens - optimizedTokens) / totalTokens,
      },
    }
  }

  // RAG Integration Methods
  private async integrateRAGContext(
    messages: CoreMessage[],
    strategy: OptimizationStrategy
  ): Promise<{ enhancedMessages: CoreMessage[]; smartContext?: SmartContext }> {
    try {
      const contextOptions = {
        workingDirectory: process.cwd(),
        executionContext: new Map(),
        conversationMemory: messages.slice(-10), // Last 10 for memory
        analysisCache: new Map(),
        enableRAGIntegration: true,
        enableDocsContext: true,
        enableWorkspaceContext: true,
        maxContextTokens: strategy.maxContextSources ? strategy.maxContextSources * 1000 : 5000,
        semanticSearchEnabled: strategy.useSemanticCompression,
        cachingEnabled: true,
      }

      const smartContext = await contextEnhancer.getSmartContextForMessages(messages, contextOptions)

      // Don't enhance messages here, just return the smart context for metrics
      return {
        enhancedMessages: messages,
        smartContext,
      }
    } catch (_error) {
      console.log(chalk.yellow('⚠️ RAG integration failed, continuing without'))
      return { enhancedMessages: messages }
    }
  }

  private calculateAdvancedMetrics(messages: CoreMessage[], model?: string): ContextMetrics {
    const totalTokens = this.calculateTotalTokens(messages)
    const baseMetrics: ContextMetrics = {
      totalMessages: messages.length,
      estimatedTokens: totalTokens,
      tokenLimit: this.activeMaxTokens,
      compressionRatio: 0,
    }

    // Add cost estimation if model is provided
    if (model) {
      try {
        const pricing = getModelPricing(model)
        if (pricing) {
          const estimatedOutputTokens = Math.min(totalTokens * 0.3, 1000) // Rough estimate
          const costEstimate = calculateTokenCost(totalTokens, estimatedOutputTokens, model)

          baseMetrics.costEstimate = costEstimate
        }
      } catch (_error) {
        // Cost estimation failed, continue without
      }
    }

    return baseMetrics
  }

  private async performIntelligentCompression(
    messages: CoreMessage[],
    _strategy: OptimizationStrategy
  ): Promise<{ messages: CoreMessage[]; steps: string[] }> {
    const steps: string[] = []
    let optimized = [...messages]

    // Enhanced version of existing compression logic
    const compressed = this.compressContextIntelligent(optimized)
    if (compressed.length < optimized.length) {
      steps.push(`Intelligent compression: ${optimized.length} → ${compressed.length} messages`)
      optimized = compressed
    }

    return { messages: optimized, steps }
  }

  private async performSemanticCompression(
    messages: CoreMessage[],
    _strategy: OptimizationStrategy
  ): Promise<{ messages: CoreMessage[]; steps: string[] }> {
    const steps: string[] = []
    let optimized = [...messages]

    // Group semantically similar messages
    const grouped = this.groupSimilarMessages(optimized)
    if (grouped.length < optimized.length) {
      steps.push(`Semantic grouping: ${optimized.length} → ${grouped.length} messages`)
      optimized = grouped
    }

    return { messages: optimized, steps }
  }

  private calculateSemanticPreservation(original: CoreMessage[], optimized: CoreMessage[]): number {
    // Simple heuristic: ratio of preserved content keywords
    const originalKeywords = this.extractKeywords(original)
    const optimizedKeywords = this.extractKeywords(optimized)

    const intersection = originalKeywords.filter((kw) => optimizedKeywords.includes(kw))
    return originalKeywords.length > 0 ? intersection.length / originalKeywords.length : 1.0
  }

  private extractKeywords(messages: CoreMessage[]): string[] {
    const keywords = new Set<string>()
    const importantWords =
      /\b(implement|create|fix|bug|error|file|function|class|method|variable|import|export|async|await|return|if|for|while|try|catch)\b/gi

    messages.forEach((msg) => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      const matches = content.match(importantWords)
      if (matches) {
        matches.forEach((match) => keywords.add(match.toLowerCase()))
      }
    })

    return Array.from(keywords)
  }

  private generateContextCacheKey(messages: CoreMessage[], strategy: OptimizationStrategy): string {
    const messageHash = this.hashMessage(messages[messages.length - 1] || { role: 'user', content: '' })
    const strategyHash = this.hashString(JSON.stringify(strategy))
    return `ctx-${messageHash}-${strategyHash}`
  }

  private hashString(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash
    }
    return Math.abs(hash).toString(36)
  }

  private cacheOptimizationResult(key: string, result: ContextOptimizationResult): void {
    if (this.contextCache.size >= 50) {
      // Limit cache size
      const firstKey = this.contextCache.keys().next().value
      if (firstKey) {
        this.contextCache.delete(firstKey)
      }
    }
    this.contextCache.set(key, result)
  }

  private getCacheHitRate(): number {
    const total = this.performanceMetrics.totalOptimizations
    return total > 0 ? this.performanceMetrics.cacheHits / total : 0
  }

  private updatePerformanceMetrics(optimizationTime: number): void {
    this.performanceMetrics.totalOptimizations++
    this.performanceMetrics.averageOptimizationTime =
      (this.performanceMetrics.averageOptimizationTime * (this.performanceMetrics.totalOptimizations - 1) +
        optimizationTime) /
      this.performanceMetrics.totalOptimizations
  }

  // Enhanced compression methods
  private compressContextIntelligent(messages: CoreMessage[]): CoreMessage[] {
    // Use the enhanced version with better strategies
    return this.compressContext(messages)
  }

  private groupSimilarMessages(messages: CoreMessage[]): CoreMessage[] {
    const grouped: CoreMessage[] = []
    const processed = new Set<number>()

    for (let i = 0; i < messages.length; i++) {
      if (processed.has(i)) continue

      const current = messages[i]
      const similar: CoreMessage[] = [current]
      processed.add(i)

      // Find similar messages (simple content similarity)
      for (let j = i + 1; j < messages.length; j++) {
        if (processed.has(j)) continue

        const candidate = messages[j]
        if (this.areMessagesSimilar(current, candidate)) {
          similar.push(candidate)
          processed.add(j)
        }
      }

      // If we found similar messages, compress them
      if (similar.length > 1 && current.role !== 'system') {
        const compressed = this.compressMessageGroup(similar)
        grouped.push(compressed)
      } else {
        grouped.push(current)
      }
    }

    return grouped
  }

  private areMessagesSimilar(msg1: CoreMessage, msg2: CoreMessage): boolean {
    if (msg1.role !== msg2.role) return false

    const content1 = typeof msg1.content === 'string' ? msg1.content : JSON.stringify(msg1.content)
    const content2 = typeof msg2.content === 'string' ? msg2.content : JSON.stringify(msg2.content)

    // Simple similarity check based on common words
    const words1 = content1.toLowerCase().split(/\s+/)
    const words2 = content2.toLowerCase().split(/\s+/)
    const intersection = words1.filter((w) => words2.includes(w))

    const similarity = intersection.length / Math.max(words1.length, words2.length)
    return similarity > 0.4 // 40% similarity threshold
  }

  private compressMessageGroup(messages: CoreMessage[]): CoreMessage {
    const first = messages[0]
    const contents = messages.map((msg) =>
      typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    )

    // Create a summary of the grouped messages
    const summary = this.createMessageGroupSummary(contents)

    return {
      role: first.role as 'user' | 'assistant' | 'system' | 'tool',
      content: `[COMPRESSED ${messages.length} messages]: ${summary}`,
    } as CoreMessage
  }

  private createMessageGroupSummary(contents: string[]): string {
    // Extract key points from multiple messages
    const allText = contents.join(' ')
    const sentences = allText.split(/[.!?]+/).filter((s) => s.trim().length > 10)

    // Keep most important sentences (first and last, plus any with keywords)
    const important = sentences.filter((sentence, idx) => {
      return (
        idx === 0 ||
        idx === sentences.length - 1 ||
        /\b(error|bug|fix|implement|create|important|critical)\b/i.test(sentence)
      )
    })

    return important.slice(0, 3).join('. ').substring(0, 300) + (important.length > 3 ? '...' : '')
  }

  /**
   * Enhanced workspace analysis with real implementation
   */
  async analyzeWorkspace(): Promise<ContextSummary> {
    const now = Date.now()

    // Use cache if fresh
    if (this.workspaceCache && now - this.lastWorkspaceAnalysis < this.WORKSPACE_CACHE_TTL) {
      return this.workspaceCache
    }

    console.log(chalk.blue('🔍 Analyzing workspace...'))

    try {
      const cwd = process.cwd()
      const summary: ContextSummary = {
        totalFiles: 0,
        totalDirs: 0,
        languages: {},
        importantFiles: [],
        frameworks: [],
        dependencies: [],
      }

      // Enhanced analysis using existing workspace context
      const workspaceInfo = workspaceContext.getContextForAgent('context-manager', 20)

      if (workspaceInfo.relevantFiles && workspaceInfo.relevantFiles.length > 0) {
        summary.totalFiles = workspaceInfo.relevantFiles.length
        summary.importantFiles = workspaceInfo.relevantFiles.slice(0, 10).map((f) => f.path)

        // Analyze file types
        workspaceInfo.relevantFiles.forEach((file) => {
          const ext = path.extname(file.path).toLowerCase()
          const language = this.getLanguageFromExtension(ext)
          if (language) {
            summary.languages[language] = (summary.languages[language] || 0) + 1
          }
        })

        // Detect frameworks and project type
        summary.frameworks = this.detectFrameworks(workspaceInfo.relevantFiles.map((f) => f.path))
        summary.projectType = this.detectProjectType(summary.languages, summary.frameworks)
      }

      // Try to get git info
      try {
        const gitInfo = await this.getGitInfo(cwd)
        summary.gitInfo = gitInfo
      } catch (_error) {
        // Git not available or not a git repo
      }

      // Cache the result
      this.workspaceCache = summary
      this.lastWorkspaceAnalysis = now

      console.log(
        chalk.green(
          `✓ Workspace analyzed: ${summary.totalFiles} files, ${Object.keys(summary.languages).length} languages`
        )
      )

      return summary
    } catch (_error) {
      console.log(chalk.yellow('⚠️ Workspace analysis failed, using minimal summary'))
      return {
        totalFiles: 0,
        totalDirs: 0,
        languages: {},
        importantFiles: [],
      }
    }
  }

  private getLanguageFromExtension(ext: string): string | null {
    const langMap: Record<string, string> = {
      '.ts': 'TypeScript',
      '.js': 'JavaScript',
      '.tsx': 'TypeScript React',
      '.jsx': 'JavaScript React',
      '.py': 'Python',
      '.java': 'Java',
      '.cpp': 'C++',
      '.c': 'C',
      '.cs': 'C#',
      '.go': 'Go',
      '.rs': 'Rust',
      '.php': 'PHP',
      '.rb': 'Ruby',
      '.swift': 'Swift',
      '.kt': 'Kotlin',
      '.dart': 'Dart',
      '.vue': 'Vue',
      '.svelte': 'Svelte',
    }
    return langMap[ext] || null
  }

  private detectFrameworks(filePaths: string[]): string[] {
    const frameworks: string[] = []
    const fileList = filePaths.join(' ').toLowerCase()

    if (fileList.includes('package.json')) {
      if (fileList.includes('next.config') || fileList.includes('next')) frameworks.push('Next.js')
      if (fileList.includes('nuxt.config') || fileList.includes('nuxt')) frameworks.push('Nuxt.js')
      if (fileList.includes('vite.config') || fileList.includes('vite')) frameworks.push('Vite')
      if (fileList.includes('webpack.config')) frameworks.push('Webpack')
      if (fileList.includes('react')) frameworks.push('React')
      if (fileList.includes('vue')) frameworks.push('Vue.js')
      if (fileList.includes('angular')) frameworks.push('Angular')
      if (fileList.includes('svelte')) frameworks.push('Svelte')
    }

    if (fileList.includes('requirements.txt') || fileList.includes('pipfile')) {
      frameworks.push('Python')
      if (fileList.includes('django')) frameworks.push('Django')
      if (fileList.includes('flask')) frameworks.push('Flask')
      if (fileList.includes('fastapi')) frameworks.push('FastAPI')
    }

    return frameworks
  }

  private detectProjectType(languages: Record<string, number>, frameworks: string[]): string {
    if (frameworks.includes('Next.js') || frameworks.includes('React')) return 'Frontend/Full-stack'
    if (frameworks.includes('Django') || frameworks.includes('Flask')) return 'Backend/API'
    if (languages.TypeScript || languages.JavaScript) return 'Web Development'
    if (languages.Python) return 'Python Application'
    if (languages.Java) return 'Java Application'
    return 'General Development'
  }

  private async getGitInfo(cwd: string): Promise<ContextSummary['gitInfo']> {
    try {
      const { exec } = require('node:child_process')
      const { promisify } = require('node:util')
      const execAsync = promisify(exec)

      const [branchResult, statusResult] = await Promise.all([
        execAsync('git branch --show-current', { cwd }).catch(() => ({ stdout: '' })),
        execAsync('git status --porcelain', { cwd }).catch(() => ({ stdout: '' })),
      ])

      return {
        branch: branchResult.stdout.trim() || undefined,
        hasUncommitted: statusResult.stdout.trim().length > 0,
      }
    } catch (_error) {
      return undefined
    }
  }

  // Performance and utility methods
  getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      cacheHitRate: this.getCacheHitRate(),
      cacheSizes: {
        messageMetrics: this.messageMetrics.size,
        contextCache: this.contextCache.size,
        workspaceCache: this.workspaceCache ? 1 : 0,
      },
    }
  }

  clearCaches(): void {
    this.messageMetrics.clear()
    this.contextCache.clear()
    this.workspaceCache = null
    this.lastWorkspaceAnalysis = 0
    console.log(chalk.green('✓ All context manager caches cleared'))
  }

  setOptimizationStrategy(strategy: Partial<OptimizationStrategy>): void {
    this.defaultStrategy = { ...this.defaultStrategy, ...strategy }
    console.log(chalk.blue('🔧 Context optimization strategy updated'))
  }

  /**
   * Enhanced legacy compress context method
   */
  private compressContext(messages: CoreMessage[]): CoreMessage[] {
    const optimized: CoreMessage[] = []
    let currentTokens = 0

    // Always keep system messages with enhanced handling
    const systemMessages = messages.filter((m) => m.role === 'system')
    systemMessages.forEach((msg) => {
      optimized.push(msg)
      currentTokens += this.getMessageTokens(msg)
    })

    // Enhanced message importance calculation
    const nonSystemMessages = messages.filter((m) => m.role !== 'system')
    const recentMessages = nonSystemMessages.slice(-this.MIN_MESSAGES)

    recentMessages.forEach((msg) => {
      optimized.push(msg)
      currentTokens += this.getMessageTokens(msg)
    })

    // Improved importance-based selection
    const olderMessages = nonSystemMessages.slice(0, -this.MIN_MESSAGES)
    const sortedByImportance = olderMessages
      .map((msg, index) => ({
        message: msg,
        importance: this.calculateImportance(msg, index, olderMessages.length),
        tokens: this.getMessageTokens(msg),
        semanticValue: this.calculateSemanticValue(msg),
      }))
      .sort((a, b) => b.importance + b.semanticValue - (a.importance + a.semanticValue))

    // Smart token allocation
    const availableTokens = this.activeMaxTokens - currentTokens
    let allocatedTokens = 0

    for (const item of sortedByImportance) {
      if (allocatedTokens + item.tokens <= availableTokens * 0.8) {
        // Leave 20% buffer
        optimized.splice(-this.MIN_MESSAGES, 0, item.message)
        allocatedTokens += item.tokens
      }
    }

    // Final check and compression if needed
    const finalTokens = this.calculateTotalTokens(optimized)
    if (finalTokens > this.activeMaxTokens) {
      return this.createEnhancedSummaryContext(optimized)
    }

    return optimized
  }

  private calculateSemanticValue(message: CoreMessage): number {
    const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
    let value = 0

    // Technical terms increase value
    const techTerms = ['function', 'class', 'interface', 'async', 'await', 'import', 'export', 'const', 'let', 'var']
    value += techTerms.filter((term) => content.toLowerCase().includes(term)).length * 0.1

    // Code blocks are valuable
    if (content.includes('```') || content.includes('`')) value += 0.3

    // Questions and answers are valuable
    if (content.includes('?') || content.toLowerCase().includes('how') || content.toLowerCase().includes('what'))
      value += 0.2

    return Math.min(value, 1.0)
  }

  private createEnhancedSummaryContext(messages: CoreMessage[]): CoreMessage[] {
    const systemMessages = messages.filter((m) => m.role === 'system')
    const nonSystemMessages = messages.filter((m) => m.role !== 'system')

    const window = TOKEN_LIMITS.CHAT?.HEAD_TAIL_WINDOW ?? 6
    const keepStart = Math.max(0, Math.floor(window / 2))
    const keepEnd = Math.max(0, window - keepStart)

    if (nonSystemMessages.length <= keepStart + keepEnd) {
      return messages
    }

    const startMessages = nonSystemMessages.slice(0, keepStart)
    const endMessages = nonSystemMessages.slice(-keepEnd)
    const middleMessages = nonSystemMessages.slice(keepStart, -keepEnd)

    // Enhanced summary creation
    const summaryContent = this.createEnhancedMiddleSummary(middleMessages)
    const summaryMessage: CoreMessage = {
      role: 'system',
      content: `[ENHANCED CONTEXT SUMMARY] ${middleMessages.length} messages: ${summaryContent}`,
    }

    return [...systemMessages, ...startMessages, summaryMessage, ...endMessages]
  }

  private createEnhancedMiddleSummary(messages: CoreMessage[]): string {
    const summary: string[] = []
    const codeBlocks: string[] = []
    const questions: string[] = []
    const actions: Set<string> = new Set()

    messages.forEach((msg) => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)

      // Extract code blocks
      const codeMatches = content.match(/```[\s\S]*?```/g)
      if (codeMatches) {
        codeBlocks.push(...codeMatches.map((code) => `${code.substring(0, 100)}...`))
      }

      // Extract questions
      const sentences = content.split(/[.!?]+/)
      questions.push(...sentences.filter((s) => s.includes('?')))

      // Track actions
      ;['create', 'modify', 'delete', 'fix', 'implement', 'test'].forEach((action) => {
        if (content.toLowerCase().includes(action)) {
          actions.add(action)
        }
      })
    })

    if (actions.size > 0) summary.push(`Actions: ${Array.from(actions).join(', ')}`)
    if (codeBlocks.length > 0) summary.push(`Code examples: ${codeBlocks.length}`)
    if (questions.length > 0) summary.push(`Questions addressed: ${questions.length}`)

    return summary.join('. ') || `${messages.length} messages processed`
  }

  /**
   * Calculate total tokens for message array
   */
  private calculateTotalTokens(messages: CoreMessage[]): number {
    return messages.reduce((total, msg) => total + this.getMessageTokens(msg), 0)
  }

  /**
   * Get token count for a single message
   */
  private getMessageTokens(message: CoreMessage): number {
    const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
    return this.estimateTokens(content)
  }

  /**
   * Get context metrics (enhanced)
   */
  getContextMetrics(messages: CoreMessage[]): ContextMetrics {
    const totalTokens = this.calculateTotalTokens(messages)
    return {
      totalMessages: messages.length,
      estimatedTokens: totalTokens,
      tokenLimit: this.activeMaxTokens,
      compressionRatio: 0, // No compression in this method
      cacheHitRate: this.getCacheHitRate(),
      ragIntegration: false, // Not used in legacy method
    }
  }

  /**
   * Get embedding statistics from unified embedding interface
   */
  private getEmbeddingStats() {
    try {
      const stats = unifiedEmbeddingInterface.getStats()
      return {
        cacheHitRate: stats.cacheHitRate || 0,
        totalQueries: stats.totalQueries || 0,
        averageLatency: stats.averageLatency || 0,
        costSaved: stats.totalCost || 0,
      }
    } catch {
      return {
        cacheHitRate: 0,
        totalQueries: 0,
        averageLatency: 0,
        costSaved: 0,
      }
    }
  }

  /**
   * Get semantic analysis statistics from semantic search engine
   */
  private getSemanticAnalysisStats() {
    try {
      // Since semantic search engine doesn't expose individual stats methods,
      // we'll provide basic defaults and could enhance this later
      return {
        queryConfidence: 0.8, // Default confidence
        intentDetected: 'analysis',
        entitiesFound: 0,
        expansionRate: 1.0,
      }
    } catch {
      return {
        queryConfidence: 0,
        intentDetected: 'unknown',
        entitiesFound: 0,
        expansionRate: 0,
      }
    }
  }

  /**
   * Get vector store statistics from RAG system
   */
  private getVectorStoreStats() {
    try {
      // Since RAG system doesn't expose vector store status method,
      // we'll provide basic defaults for now
      return {
        provider: 'local', // Default to local
        indexedDocuments: 0,
        searchLatency: 0,
        uptime: Date.now() - this.lastWorkspaceAnalysis,
      }
    } catch {
      return {
        provider: 'unknown',
        indexedDocuments: 0,
        searchLatency: 0,
        uptime: 0,
      }
    }
  }
}

// Export singleton instance
export const contextManager = new ContextManager()
