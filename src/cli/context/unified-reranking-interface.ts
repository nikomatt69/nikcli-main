import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import chalk from 'chalk'
import { fileExists, mkdirp, readJson, writeJson } from '../utils/bun-compat'
import { type CacheProvider, globalCacheManager } from '../core/cache-provider'
import { configManager } from '../core/config-manager'
import { createOpenRouterRerankingProvider, type OpenRouterRerankingProvider } from './openrouter-reranking-provider'

export interface RerankingConfig {
  provider: 'openrouter'
  model: string
  topK?: number
  cacheEnabled: boolean
  persistenceEnabled: boolean
  maxDocuments: number
  baseURL?: string
  headers?: Record<string, string>
}

export interface RerankingDocument {
  id: string
  content: string
  metadata?: Record<string, any>
}

export interface RerankingResult {
  results: Array<{
    index: number
    score: number
    relevanceScore: number
  }>
  cost: number
  tokensUsed: number
  model: string
  provider: string
  timestamp: Date
}

export interface RerankingQuery {
  query: string
  documents: RerankingDocument[]
  topK?: number
  useCache?: boolean
}

export interface UnifiedRerankingStats {
  totalRerankings: number
  totalQueries: number
  cacheHitRate: number
  averageLatency: number
  totalCost: number
  averageDocumentsPerQuery: number
  byModel: Record<
    string,
    {
      count: number
      cost: number
      averageLatency: number
    }
  >
  lastOptimization: Date
}

/**
 * Unified Reranking Interface - Standardizes reranking operations across all NikCLI components
 *
 * Features:
 * - Consistent reranking pipeline for RAG search results
 * - OpenRouter provider support with automatic fallback
 * - Persistent caching with hash validation
 * - Performance monitoring and cost tracking
 * - Integration with existing RAG system
 */
export class UnifiedRerankingInterface {
  private config: RerankingConfig
  private rerankingCache: Map<string, RerankingResult> = new Map()
  private persistentCacheDir: string
  private stats: UnifiedRerankingStats
  private cacheProvider: CacheProvider
  private provider: OpenRouterRerankingProvider

  // Performance monitoring
  private queryLatencies: number[] = []
  private lastOptimization = Date.now()
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours
  private readonly MAX_MEMORY_CACHE = 5000

  // Enhanced stats tracking
  private successCount = 0
  private failureCount = 0

  constructor(config?: Partial<RerankingConfig>) {
    this.config = {
      provider: 'openrouter',
      model: process.env.RERANKING_MODEL || 'sentence-transformers/paraphrase-minilm-l6-v2',
      topK: Number(process.env.RERANKING_TOP_K || 10),
      cacheEnabled: process.env.RERANKING_CACHE_ENABLED !== 'false',
      persistenceEnabled: true,
      maxDocuments: Number(process.env.RERANKING_MAX_DOCUMENTS || 100),
      baseURL: 'https://openrouter.ai/api/v1',
      headers: {
        'HTTP-Referer': 'https://nikcli.mintlify.app',
        'X-Title': 'NikCLI',
      },
      ...config,
    }

    this.syncConfigFromManager()

    this.persistentCacheDir = join(homedir(), '.nikcli', 'reranking-cache')
    this.stats = this.initializeStats()
    this.initializePersistentCache()

    // Initialize cache provider
    this.cacheProvider = globalCacheManager.getCache('reranking', {
      defaultTTL: this.CACHE_TTL,
      maxMemorySize: 50 * 1024 * 1024, // 50MB for reranking cache
    })

    // Initialize OpenRouter provider
    this.provider = createOpenRouterRerankingProvider({
      provider: 'openrouter',
      model: this.config.model,
      baseURL: this.config.baseURL,
      headers: this.config.headers,
    })
  }

  private syncConfigFromManager(): void {
    const currentModel = configManager.getCurrentRerankingModel?.() || this.config.model
    const cfg = currentModel ? configManager.getRerankingModelConfig?.(currentModel) : undefined

    if (cfg) {
      this.config = {
        ...this.config,
        provider: cfg.provider || 'openrouter',
        model: cfg.model || currentModel,
        topK: cfg.topK || this.config.topK,
        maxDocuments: cfg.maxDocuments || this.config.maxDocuments,
        baseURL: cfg.baseURL || this.config.baseURL,
        headers: { ...this.config.headers, ...(cfg.headers || {}) },
      }
    }
  }

  /**
   * Rerank documents based on query relevance
   */
  async rerank(query: RerankingQuery): Promise<RerankingResult> {
    this.syncConfigFromManager()
    const startTime = Date.now()

    // Validate input
    if (!query.query || !query.documents || query.documents.length === 0) {
      throw new Error('Invalid reranking query: query and documents are required')
    }

    // Limit documents to maxDocuments
    const documents = query.documents.slice(0, this.config.maxDocuments)
    const topK = query.topK || this.config.topK || Math.min(10, documents.length)

    // Check cache first
    if (this.config.cacheEnabled && query.useCache !== false) {
      const cacheKey = this.generateCacheKey(query.query, documents)
      const cached = await this.getCachedReranking(cacheKey)
      if (cached) {
        this.stats.totalQueries++
        this.stats.cacheHitRate =
          (this.stats.cacheHitRate * (this.stats.totalQueries - 1) + 1) / this.stats.totalQueries
        return cached
      }
    }

    try {
      // Call OpenRouter reranking API via provider
      const documentTexts = documents.map((doc) => doc.content)
      const providerResult = await this.provider.rerank({
        query: query.query,
        documents: documentTexts,
        topK,
      })

      // Convert provider result to unified result
      const result: RerankingResult = {
        results: providerResult.results,
        cost: providerResult.cost,
        tokensUsed: providerResult.tokensUsed,
        model: this.config.model,
        provider: this.config.provider,
        timestamp: new Date(),
      }

      // Cache the result
      if (this.config.cacheEnabled) {
        const cacheKey = this.generateCacheKey(query.query, documents)
        await this.cacheReranking(cacheKey, result)
      }

      // Update stats
      const latency = Date.now() - startTime
      this.updateStats(result, latency, true)
      this.successCount++

      return result
    } catch (error) {
      this.failureCount++
      const latency = Date.now() - startTime
      this.updateStats(
        {
          results: [],
          cost: 0,
          tokensUsed: 0,
          model: this.config.model,
          provider: this.config.provider,
          timestamp: new Date(),
        },
        latency,
        false
      )
      throw error
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): RerankingConfig {
    return { ...this.config }
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<RerankingConfig>): void {
    const oldConfig = { ...this.config }
    this.config = { ...this.config, ...updates }

    // Update provider config if model or baseURL changed
    if (oldConfig.model !== this.config.model || oldConfig.baseURL !== this.config.baseURL) {
      this.provider.updateConfig({
        model: this.config.model,
        baseURL: this.config.baseURL,
        headers: this.config.headers,
      })
    }

    // Clear cache if model changed
    if (oldConfig.model !== this.config.model) {
      console.log(chalk.blue('🔧 Reranking model changed, clearing cache'))
      this.clearCache()
    }

    console.log(chalk.green('✓ Reranking configuration updated'))
    this.logConfig()
  }

  /**
   * Get performance statistics
   */
  getStats(): UnifiedRerankingStats {
    this.stats.averageLatency =
      this.queryLatencies.length > 0
        ? this.queryLatencies.reduce((sum, lat) => sum + lat, 0) / this.queryLatencies.length
        : 0

    return { ...this.stats }
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.rerankingCache.clear()
    if (this.config.persistenceEnabled) {
      this.clearPersistentCache()
    }
    this.cacheProvider.clear()
    console.log(chalk.green('✓ Reranking cache cleared'))
  }

  /**
   * Optimize cache and performance
   */
  async optimizeCache(): Promise<void> {
    console.log(chalk.blue('🔧 Optimizing reranking cache...'))

    // Remove old entries if cache is too large
    if (this.rerankingCache.size > this.MAX_MEMORY_CACHE) {
      const entries = Array.from(this.rerankingCache.entries())
      const sortedByAge = entries.sort((a, b) => b[1].timestamp.getTime() - a[1].timestamp.getTime())
      const toKeep = sortedByAge.slice(0, Math.floor(this.MAX_MEMORY_CACHE * 0.8))

      this.rerankingCache.clear()
      toKeep.forEach(([key, value]) => this.rerankingCache.set(key, value))

      console.log(chalk.green(`✓ Cache optimized: kept ${toKeep.length}/${entries.length} entries`))
    }

    // Save to persistent cache
    if (this.config.persistenceEnabled) {
      await this.savePersistentCache()
    }

    this.stats.lastOptimization = new Date()
    this.lastOptimization = Date.now()
  }

  /**
   * Log current configuration and stats
   */
  logStatus(): void {
    const stats = this.getStats()

    console.log(chalk.blue.bold('\n⚡︎ Unified Reranking Interface Status'))
    console.log(chalk.gray('═'.repeat(50)))

    this.logConfig()

    console.log(chalk.cyan('\nPerformance:'))
    console.log(`  Total Rerankings: ${stats.totalRerankings.toLocaleString()}`)
    console.log(`  Total Queries: ${stats.totalQueries.toLocaleString()}`)
    console.log(`  Cache Hit Rate: ${(stats.cacheHitRate * 100).toFixed(1)}%`)
    console.log(`  Average Latency: ${Math.round(stats.averageLatency)}ms`)
    console.log(`  Total Cost: $${stats.totalCost.toFixed(6)}`)
    console.log(`  Avg Documents/Query: ${stats.averageDocumentsPerQuery.toFixed(1)}`)

    if (Object.keys(stats.byModel).length > 0) {
      console.log(chalk.cyan('\nBy Model:'))
      Object.entries(stats.byModel).forEach(([model, modelStats]) => {
        console.log(
          `  ${model}: ${modelStats.count} rerankings, $${modelStats.cost.toFixed(6)}, ${Math.round(modelStats.averageLatency)}ms avg`
        )
      })
    }

    console.log(chalk.cyan('\nCache:'))
    console.log(`  Memory Cache: ${this.rerankingCache.size.toLocaleString()} entries`)
    console.log(`  Persistent Cache: ${this.config.persistenceEnabled ? 'enabled' : 'disabled'}`)
    console.log(`  Last Optimization: ${stats.lastOptimization.toLocaleTimeString()}`)
  }

  // Private methods
  private logConfig(): void {
    console.log(chalk.cyan('\nConfiguration:'))
    console.log(`  Provider: ${this.config.provider}`)
    console.log(`  Model: ${this.config.model}`)
    console.log(`  Top K: ${this.config.topK}`)
    console.log(`  Max Documents: ${this.config.maxDocuments}`)
    console.log(`  Caching: ${this.config.cacheEnabled ? 'enabled' : 'disabled'}`)
    console.log(`  Persistence: ${this.config.persistenceEnabled ? 'enabled' : 'disabled'}`)
  }

  private generateCacheKey(query: string, documents: RerankingDocument[]): string {
    const docHashes = documents.map((doc) => createHash('md5').update(doc.content).digest('hex').substring(0, 8))
    const content = `${this.config.provider}:${this.config.model}:${query}:${docHashes.join(',')}`
    return createHash('md5').update(content).digest('hex')
  }

  private async getCachedReranking(key: string): Promise<RerankingResult | null> {
    // Check memory cache first
    const cached = this.rerankingCache.get(key)
    if (cached) {
      const age = Date.now() - cached.timestamp.getTime()
      if (age < this.CACHE_TTL) {
        return cached
      } else {
        this.rerankingCache.delete(key)
      }
    }

    // Check persistent cache
    if (this.config.persistenceEnabled) {
      const cachedFromDisk = await this.cacheProvider.get<RerankingResult>(key)
      if (cachedFromDisk) {
        const age = Date.now() - cachedFromDisk.timestamp.getTime()
        if (age < this.CACHE_TTL) {
          // Restore to memory cache
          this.rerankingCache.set(key, cachedFromDisk)
          return cachedFromDisk
        }
      }
    }

    return null
  }

  private async cacheReranking(key: string, result: RerankingResult): Promise<void> {
    this.rerankingCache.set(key, result)

    if (this.config.persistenceEnabled) {
      await this.cacheProvider.set(key, result, {
        tags: ['reranking', this.config.model],
      })
    }
  }

  private estimateCost(query: string, documents: string[]): number {
    // OpenRouter reranking costs vary by model
    // Cohere rerank-english-v3.0: ~$0.001 per 1K documents
    // Jina reranker: ~$0.0005 per 1K documents
    // This is a rough estimate - actual costs may vary
    const baseCostPer1K = this.config.model.includes('cohere') ? 0.001 : 0.0005
    const totalChars = query.length + documents.reduce((sum, doc) => sum + doc.length, 0)
    const estimatedTokens = Math.ceil(totalChars / 4)
    return (estimatedTokens / 1000) * baseCostPer1K
  }

  private estimateTokens(query: string, documents: string[]): number {
    const totalChars = query.length + documents.reduce((sum, doc) => sum + doc.length, 0)
    return Math.ceil(totalChars / 4)
  }

  private updateStats(result: RerankingResult, latency: number, success: boolean): void {
    this.stats.totalRerankings++
    this.stats.totalQueries++
    this.stats.totalCost += result.cost

    if (!this.stats.byModel[result.model]) {
      this.stats.byModel[result.model] = {
        count: 0,
        cost: 0,
        averageLatency: 0,
      }
    }

    const modelStats = this.stats.byModel[result.model]
    modelStats.count++
    modelStats.cost += result.cost
    modelStats.averageLatency = (modelStats.averageLatency * (modelStats.count - 1) + latency) / modelStats.count

    // Update average documents per query
    const totalDocs = this.stats.averageDocumentsPerQuery * (this.stats.totalQueries - 1) + result.results.length
    this.stats.averageDocumentsPerQuery = totalDocs / this.stats.totalQueries

    // Update latency tracking
    this.queryLatencies.push(latency)
    if (this.queryLatencies.length > 1000) {
      this.queryLatencies = this.queryLatencies.slice(-1000)
    }
  }

  private initializeStats(): UnifiedRerankingStats {
    return {
      totalRerankings: 0,
      totalQueries: 0,
      cacheHitRate: 0,
      averageLatency: 0,
      totalCost: 0,
      averageDocumentsPerQuery: 0,
      byModel: {},
      lastOptimization: new Date(),
    }
  }

  private async initializePersistentCache(): Promise<void> {
    if (!this.config.persistenceEnabled) return

    try {
      // Use Bun APIs
      if (!(await fileExists(this.persistentCacheDir))) {
        await mkdirp(this.persistentCacheDir)
      }

      await this.loadPersistentCache()
      console.log(chalk.gray(`✓ Persistent reranking cache initialized`))
    } catch (error) {
      console.warn(chalk.yellow(`⚠︎ Failed to initialize persistent cache: ${error}`))
    }
  }

  private async loadPersistentCache(): Promise<void> {
    const cacheFile = join(this.persistentCacheDir, 'unified-reranking.json')

    try {
      if (await fileExists(cacheFile)) {
        const cached = await readJson<{ rerankings?: Record<string, any>; stats?: any }>(cacheFile)

        for (const [key, value] of Object.entries(cached.rerankings || {})) {
          const result = value as any
          result.timestamp = new Date(result.timestamp)
          this.rerankingCache.set(key, result as RerankingResult)
        }

        if (cached.stats) {
          this.stats = { ...this.stats, ...cached.stats }
          this.stats.lastOptimization = new Date(this.stats.lastOptimization)
        }

        console.log(chalk.gray(`📦 Loaded ${this.rerankingCache.size} rerankings from persistent cache`))
      }
    } catch (error) {
      console.warn(chalk.yellow(`⚠︎ Failed to load persistent cache: ${error}`))
    }
  }

  private async savePersistentCache(): Promise<void> {
    const cacheFile = join(this.persistentCacheDir, 'unified-reranking.json')

    try {
      const data = {
        rerankings: Object.fromEntries(this.rerankingCache),
        stats: this.stats,
        lastSaved: new Date(),
      }

      await writeJson(cacheFile, data)
      console.log(chalk.gray(`💾 Saved ${this.rerankingCache.size} rerankings to persistent cache`))
    } catch (error) {
      console.warn(chalk.yellow(`⚠︎ Failed to save persistent cache: ${error}`))
    }
  }

  private async clearPersistentCache(): Promise<void> {
    const cacheFile = join(this.persistentCacheDir, 'unified-reranking.json')

    try {
      if (await fileExists(cacheFile)) {
        await writeJson(cacheFile, { rerankings: {}, stats: this.initializeStats(), lastSaved: new Date() })
      }
    } catch (error) {
      console.warn(chalk.yellow(`⚠︎ Failed to clear persistent cache: ${error}`))
    }
  }
}

// Export singleton instance
export const unifiedRerankingInterface = new UnifiedRerankingInterface()
