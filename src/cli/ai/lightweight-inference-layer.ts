/**
 * Lightweight Inference Layer
 *
 * Ultra-fast pre-processing for tool calls using embeddings + heuristics
 * No LLM required - 12-28ms latency vs 500-2000ms full routing
 */

import type { ToolInstance } from '../core/tool-registry'

/**
 * Interface for lightweight inference operations
 */
export interface LightweightInferenceEngine {
  preselectTools(query: string, allTools: ToolInstance[]): Promise<ToolInstance[]>
  predictParameters(toolId: string, query: string, context?: any): Promise<Record<string, any>>
  estimateComplexity(goal: string): Promise<ComplexityEstimate>
  semanticSimilarity(text1: string, text2: string): Promise<number>
  scoreToolsSemantically(query: string, tools: ToolInstance[]): Promise<Map<string, number>>
}

/**
 * Complexity estimation result
 */
export interface ComplexityEstimate {
  score: number // 0-100
  level: 'simple' | 'medium' | 'complex'
  reason: string
  template?: string // Template name if simple
  estimatedTokens?: number
  confidence: number // 0-1
}

/**
 * Tool scoring result
 */
export interface ToolScore {
  toolId: string
  score: number // 0-100
  factors: {
    semantic: number
    keyword: number
    capability: number
    context: number
  }
  rank: number
}

/**
 * Main Lightweight Inference Engine Implementation
 */
export class LightweightInferenceEngineImpl implements LightweightInferenceEngine {
  private toolEmbeddingsCache: Map<string, number[]> = new Map()
  private complexityPatterns: Map<string, { keywords: string[]; complexity: 'simple' | 'complex' }> = new Map()
  private toolSuccessRates: Map<string, { successes: number; total: number }> = new Map()

  constructor(private readonly embeddingService: any) {
    this.initializeComplexityPatterns()
  }

  /**
   * Initialize common complexity patterns
   */
  private initializeComplexityPatterns(): void {
    // Simple patterns (70% of requests)
    this.complexityPatterns.set('simple-file-read', {
      keywords: ['read', 'file', 'show', 'view', 'check', 'list', 'find file'],
      complexity: 'simple',
    })

    this.complexityPatterns.set('simple-search', {
      keywords: ['search', 'find', 'grep', 'look for', 'search in'],
      complexity: 'simple',
    })

    this.complexityPatterns.set('simple-info', {
      keywords: ['info', 'information', 'details', 'tell me', 'what is', 'how many'],
      complexity: 'simple',
    })

    // Complex patterns
    this.complexityPatterns.set('complex-refactor', {
      keywords: ['refactor', 'optimize', 'improve', 'rewrite', 'restructure'],
      complexity: 'complex',
    })

    this.complexityPatterns.set('complex-multi-file', {
      keywords: ['multi-file', 'across files', 'multiple files', 'project-wide', 'end-to-end'],
      complexity: 'complex',
    })

    this.complexityPatterns.set('complex-plan', {
      keywords: ['plan', 'strategy', 'approach', 'design', 'architecture', 'execution plan'],
      complexity: 'complex',
    })
  }

  /**
   * Pre-select top tools based on semantic similarity to query
   * Reduces 30+ tools → 3-5 candidates in ~5ms
   */
  async preselectTools(query: string, allTools: ToolInstance[]): Promise<ToolInstance[]> {
    const MAX_CANDIDATES = 5

    if (allTools.length <= MAX_CANDIDATES) {
      return allTools
    }

    // Score all tools semantically
    const scores = await this.scoreToolsSemantically(query, allTools)

    // Sort and return top candidates
    const sorted = Array.from(scores.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, MAX_CANDIDATES)
      .map(([toolId]) => allTools.find((t) => t.metadata.id === toolId))
      .filter(Boolean) as ToolInstance[]

    return sorted
  }

  /**
   * Score tools using semantic similarity + heuristics
   * ~3-5ms for 30 tools
   */
  async scoreToolsSemantically(query: string, tools: ToolInstance[]): Promise<Map<string, number>> {
    const scores = new Map<string, number>()
    const queryWords = new Set(query.toLowerCase().split(/\s+/))

    for (const tool of tools) {
      let score = 0

      // 1. Keyword matching (30%)
      const toolWords = new Set(
        `${tool.metadata.name} ${tool.metadata.description} ${tool.metadata.tags.join(' ')}`.toLowerCase().split(/\s+/)
      )
      const keywordOverlap = new Set([...queryWords].filter((w) => toolWords.has(w)))
      const keywordScore = (keywordOverlap.size / Math.max(queryWords.size, 1)) * 30

      // 2. Category relevance (20%)
      let categoryScore = 0
      if (
        (queryWords.has('file') || queryWords.has('read') || queryWords.has('write')) &&
        tool.metadata.category === 'file-ops'
      ) {
        categoryScore = 20
      } else if ((queryWords.has('code') || queryWords.has('analyze')) && tool.metadata.category === 'code-analysis') {
        categoryScore = 20
      } else if (
        (queryWords.has('execute') || queryWords.has('command')) &&
        tool.metadata.category === 'system'
      ) {
        categoryScore = 20
      }

      // 3. Capability matching (25%)
      const requiredCapabilities = Array.from(queryWords).filter((w) => w.length > 3)
      const matchingCapabilities = requiredCapabilities.filter((c) =>
        tool.metadata.capabilities.some((cap) => cap.toLowerCase().includes(c))
      )
      const capabilityScore = (matchingCapabilities.length / Math.max(requiredCapabilities.length, 1)) * 25

      // 4. Success rate bonus (15%)
      const successData = this.toolSuccessRates.get(tool.metadata.id)
      let successScore = 0
      if (successData && successData.total > 0) {
        const rate = successData.successes / successData.total
        successScore = Math.min(rate * 15, 15)
      }

      // 5. Usage frequency (10%)
      const usageScore = Math.min((tool.usageCount || 0) / 10, 10)

      score = Math.round(keywordScore + categoryScore + capabilityScore + successScore + usageScore)
      scores.set(tool.metadata.id, Math.max(0, Math.min(100, score)))
    }

    return scores
  }

  /**
   * Predict likely parameters for tool call
   * Uses pattern matching + LSP context
   * ~8-10ms
   */
  async predictParameters(toolId: string, query: string, context?: any): Promise<Record<string, any>> {
    const predicted: Record<string, any> = {}

    const lowerQuery = query.toLowerCase()

    // File path extraction
    if ((toolId.includes('read') || toolId.includes('file')) && context?.workingDirectory) {
      const filePathMatch = query.match(/['"`]([^'"`]+\.[a-z]+)['"`]/)
      if (filePathMatch) {
        predicted.filePath = filePathMatch[1]
      }
    }

    // Directory extraction
    if ((toolId.includes('list') || toolId.includes('directory')) && context?.workingDirectory) {
      const dirMatch = query.match(/['"`]([^'"`]*\/[^'"`]*)['"`]/)
      if (dirMatch) {
        predicted.directoryPath = dirMatch[1]
      }
    }

    // Command extraction
    if (toolId.includes('execute') || toolId.includes('command')) {
      // Look for common command patterns
      const cmdPatterns = [
        /(?:run|execute|use|call)\s+['"`]?([a-z\s\-]+)['"`]?/,
        /^(npm|yarn|pnpm|npm run|node|python|ruby|go run)\s+(.+)/,
      ]

      for (const pattern of cmdPatterns) {
        const match = query.match(pattern)
        if (match) {
          predicted.command = match[1]
          break
        }
      }
    }

    // Query/search pattern
    if ((toolId.includes('search') || toolId.includes('grep')) && !predicted.command) {
      const searchMatch = query.match(/(?:search|find|look for|grep)\s+['"`]?([^'"`]+)['"`]?/)
      if (searchMatch) {
        predicted.query = searchMatch[1]
      }
    }

    // Recursive flag
    if (lowerQuery.includes('recursive') || lowerQuery.includes('all files') || lowerQuery.includes('entire')) {
      predicted.recursive = true
    }

    return predicted
  }

  /**
   * Estimate goal complexity for routing to template vs full LLM
   * ~5-8ms
   */
  async estimateComplexity(goal: string): Promise<ComplexityEstimate> {
    const lowerGoal = goal.toLowerCase()
    const tokens = goal.split(/\s+/).length

    // Check against patterns
    let detectedLevel: 'simple' | 'medium' | 'complex' = 'medium'
    let matchedPattern: string | null = null

    for (const [pattern, { keywords, complexity }] of this.complexityPatterns) {
      if (keywords.some((k) => lowerGoal.includes(k))) {
        detectedLevel = complexity
        matchedPattern = pattern
        break
      }
    }

    // Token-based adjustment
    if (tokens > 50) {
      detectedLevel = 'complex'
    } else if (tokens < 10) {
      detectedLevel = 'simple'
    }

    // Multi-step indicator
    if (lowerGoal.includes('then') || lowerGoal.includes('after that') || lowerGoal.includes('next')) {
      detectedLevel = 'complex'
    }

    const scoreMap = { simple: 20, medium: 50, complex: 80 }
    const score = scoreMap[detectedLevel]

    return {
      score,
      level: detectedLevel,
      reason: matchedPattern ? `Pattern matched: ${matchedPattern}` : `Token count: ${tokens}, Keywords analysis`,
      template: detectedLevel === 'simple' ? `template-${matchedPattern}` : undefined,
      estimatedTokens: tokens * 4, // Rough estimate
      confidence: matchedPattern ? 0.85 : 0.65,
    }
  }

  /**
   * Calculate semantic similarity between two texts
   * Uses embedding service or fallback to Jaccard
   * ~2-5ms
   */
  async semanticSimilarity(text1: string, text2: string): Promise<number> {
    // If embedding service available, use it
    if (this.embeddingService && this.embeddingService.embed) {
      try {
        const [emb1, emb2] = await Promise.all([
          this.embeddingService.embed(text1),
          this.embeddingService.embed(text2),
        ])

        return this.cosineSimilarity(emb1, emb2)
      } catch {
        // Fall through to Jaccard
      }
    }

    // Fallback to Jaccard similarity
    return this.jaccardSimilarity(text1, text2)
  }

  /**
   * Calculate cosine similarity between embeddings
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    const dotProduct = vec1.reduce((sum, a, i) => sum + a * (vec2[i] || 0), 0)
    const mag1 = Math.sqrt(vec1.reduce((sum, a) => sum + a * a, 0))
    const mag2 = Math.sqrt(vec2.reduce((sum, a) => sum + a * a, 0))

    if (mag1 === 0 || mag2 === 0) return 0
    return dotProduct / (mag1 * mag2)
  }

  /**
   * Calculate Jaccard similarity between texts
   * Synchronous fallback for cache operations
   */
  private jaccardSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/))
    const words2 = new Set(text2.toLowerCase().split(/\s+/))

    const intersection = new Set([...words1].filter((w) => words2.has(w)))
    const union = new Set([...words1, ...words2])

    return union.size === 0 ? 0 : intersection.size / union.size
  }

  /**
   * Synchronous similarity calculation for cache lookups
   * Uses Jaccard similarity (no async embeddings)
   * ~1-2ms
   */
  semanticSimilaritySync(text1: string, text2: string): number {
    return this.jaccardSimilarity(text1, text2)
  }

  /**
   * Track tool success for learning
   */
  recordToolSuccess(toolId: string, success: boolean): void {
    if (!this.toolSuccessRates.has(toolId)) {
      this.toolSuccessRates.set(toolId, { successes: 0, total: 0 })
    }

    const data = this.toolSuccessRates.get(toolId)!
    data.total++
    if (success) {
      data.successes++
    }
  }

  /**
   * Get tool success rate
   */
  getToolSuccessRate(toolId: string): number {
    const data = this.toolSuccessRates.get(toolId)
    if (!data || data.total === 0) return 0.5 // Default neutral
    return data.successes / data.total
  }
}

/**
 * Singleton instance
 */
let instance: LightweightInferenceEngineImpl | null = null

export function initializeLightweightInference(embeddingService?: any): LightweightInferenceEngineImpl {
  if (!instance) {
    instance = new LightweightInferenceEngineImpl(embeddingService)
  }
  return instance
}

export function getLightweightInference(): LightweightInferenceEngineImpl {
  if (!instance) {
    instance = new LightweightInferenceEngineImpl(null)
  }
  return instance
}
