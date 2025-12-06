import { createHash } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import chalk from 'chalk'
import { configManager } from '../core/config-manager'
import { AiSdkEmbeddingProvider, aiSdkEmbeddingProvider } from './ai-sdk-embedding-provider'

export interface EmbeddingConfig {
  provider: 'openai' | 'google' | 'anthropic' | 'openrouter'
  model: string
  dimensions: number
  maxTokens: number
  batchSize: number
  cacheEnabled: boolean
  persistenceEnabled: boolean
}

export interface EmbeddingResult {
  id: string
  vector: number[]
  dimensions: number
  model: string
  provider: string
  timestamp: Date
  hash: string
  cost: number
  tokensUsed: number
}

export interface EmbeddingQuery {
  text: string
  id?: string
  metadata?: Record<string, any>
  useCache?: boolean
}

export interface EmbeddingSearchResult {
  id: string
  score: number
  metadata?: Record<string, any>
  embedding: EmbeddingResult
}

export interface UnifiedEmbeddingStats {
  totalEmbeddings: number
  totalQueries: number
  cacheHitRate: number
  averageLatency: number
  totalCost: number
  byProvider: Record<
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
 * Unified Embedding Interface - Standardizes embedding operations across all NikCLI components
 *
 * Features:
 * - Consistent embedding pipeline for all components
 * - Multi-provider support with automatic fallback
 * - Persistent caching with hash validation
 * - Performance monitoring and cost tracking
 * - Dimension consistency validation
 */
export class UnifiedEmbeddingInterface {
  private provider: AiSdkEmbeddingProvider
  private config: EmbeddingConfig
  private embeddingCache: Map<string, EmbeddingResult> = new Map()
  private persistentCacheDir: string
  private stats: UnifiedEmbeddingStats
  private enableRagCache: boolean = process.env.CACHE_RAG !== 'false' && process.env.CACHE_AI !== 'false'

  // Performance monitoring
  private queryLatencies: number[] = []
  private lastOptimization = Date.now()
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours
  private readonly MAX_MEMORY_CACHE = 10000
  private lastDimensionWarning: { expected: number; actual: number } | null = null

  // Enhanced stats tracking
  private batchLatencies: number[] = []
  private successCount = 0
  private failureCount = 0

  constructor(config?: Partial<EmbeddingConfig>) {
    this.provider = aiSdkEmbeddingProvider

    // Get default from current model config or use provider defaults
    const currentModel = configManager.getCurrentEmbeddingModel()
    const defaultCfg = currentModel ? configManager.getEmbeddingModelConfig(currentModel) : undefined

    this.config = {
      provider: defaultCfg?.provider || 'openrouter',
      model: defaultCfg?.model || currentModel || 'qwen/qwen3-embedding-8b',
      dimensions: defaultCfg?.dimensions || 4096, // Default to qwen3-embedding-8b (4096) or OpenAI (1536)
      maxTokens: defaultCfg?.maxTokens || 32000, // Default to qwen3-embedding-8b (32K) or OpenAI (8191)
      batchSize: defaultCfg?.batchSize || Number(process.env.EMBED_BATCH_SIZE || 300),
      cacheEnabled: true,
      persistenceEnabled: true,
      ...config,
    }

    this.syncConfigFromManager()

    this.persistentCacheDir = join(homedir(), '.nikcli', 'vector-cache')
    this.stats = this.initializeStats()
    this.initializePersistentCache()
  }

  private syncConfigFromManager(): void {
    const currentModel = configManager.getCurrentEmbeddingModel()
    const cfg = currentModel ? configManager.getEmbeddingModelConfig(currentModel) : undefined

    if (cfg) {
      this.config = {
        ...this.config,
        provider: cfg.provider,
        model: cfg.model || currentModel,
        dimensions: cfg.dimensions || this.provider.getCurrentDimensions(),
        maxTokens: cfg.maxTokens || this.config.maxTokens,
        batchSize: cfg.batchSize || this.config.batchSize,
      }
    }
  }

  /**
   * Generate embeddings for single text or batch of texts
   */
  async generateEmbeddings(queries: EmbeddingQuery[]): Promise<EmbeddingResult[]> {
    this.syncConfigFromManager()
    const startTime = Date.now()
    const results: EmbeddingResult[] = []

    // Separate cached and uncached queries
    const uncachedQueries: EmbeddingQuery[] = []

    for (const query of queries) {
      const cacheKey = this.generateCacheKey(query.text)
      const cached = this.getCachedEmbedding(cacheKey)

      if (cached && this.config.cacheEnabled && query.useCache !== false) {
        results.push(cached)
        this.stats.totalQueries++
      } else {
        uncachedQueries.push(query)
      }
    }

    // Generate embeddings for uncached queries
    if (uncachedQueries.length > 0) {
      const texts = uncachedQueries.map((q) => q.text)

      try {
        // Already cached via embeddingCache Map + persistent cache - AI SDK Tools cache would be redundant
        const embeddings = await this.provider.generate(texts)
        const currentProvider = this.provider.getCurrentProvider() || 'unknown'

        // Get actual dimensions from current provider (may differ from initial config)
        const actualDimensions = this.provider.getCurrentDimensions()

        for (let i = 0; i < uncachedQueries.length; i++) {
          const query = uncachedQueries[i]
          const vector = embeddings[i]
          const hash = this.generateCacheKey(query.text)

          if (vector) {
            // Accept the embedding regardless of dimensions - use what the provider gives us
            const result: EmbeddingResult = {
              id: query.id || hash,
              vector,
              dimensions: vector.length,
              model: this.config.model,
              provider: currentProvider,
              timestamp: new Date(),
              hash,
              cost: this.estimateCost(query.text, currentProvider),
              tokensUsed: this.estimateTokens(query.text),
            }

            results.push(result)

            // Cache the result
            if (this.config.cacheEnabled) {
              this.cacheEmbedding(hash, result)
            }

            this.updateStats(result, Date.now() - startTime)

            // If dimensions differ, update provider/config and warn once per change
            if (vector.length !== actualDimensions && this.shouldWarnDimensions(actualDimensions, vector.length)) {
              console.warn(
                chalk.yellow(
                  `⚠︎ Embedding dimensions mismatch: expected ${actualDimensions}, got ${vector.length} from ${currentProvider}. Using actual dimensions.`
                )
              )
              this.lastDimensionWarning = { expected: actualDimensions, actual: vector.length }
              this.provider.setLastUsedDimensions(vector.length)
              configManager.setEmbeddingModelConfig(this.config.model, {
                dimensions: vector.length,
              })
            }
          } else {
            console.warn(chalk.yellow(`⚠︎ No embedding vector generated for query index ${i}`))
          }
        }
      } catch (error) {
        console.error(chalk.red(`✖ Embedding generation failed: ${(error as Error).message}`))
        throw error
      }
    }

    // Update performance metrics
    const latency = Date.now() - startTime
    this.queryLatencies.push(latency)
    if (this.queryLatencies.length > 1000) {
      this.queryLatencies = this.queryLatencies.slice(-1000)
    }

    return results
  }

  /**
   * Generate single embedding (convenience method)
   */
  async generateEmbedding(text: string, id?: string, metadata?: Record<string, any>): Promise<EmbeddingResult> {
    const results = await this.generateEmbeddings([{ text, id, metadata }])
    if (!results || results.length === 0) {
      throw new Error(`Failed to generate embedding for text: ${text.substring(0, 100)}...`)
    }
    return results[0]
  }

  /**
   * Calculate similarity between two embeddings
   */
  calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error(`Embedding dimension mismatch: ${embedding1.length} vs ${embedding2.length}`)
    }

    // Cosine similarity
    let dotProduct = 0
    let norm1 = 0
    let norm2 = 0

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i]
      norm1 += embedding1[i] * embedding1[i]
      norm2 += embedding2[i] * embedding2[i]
    }

    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2)
    return magnitude > 0 ? dotProduct / magnitude : 0
  }

  /**
   * Search for similar embeddings
   */
  async searchSimilar(
    queryText: string,
    candidateEmbeddings: EmbeddingResult[],
    limit: number = 10,
    threshold: number = 0.3
  ): Promise<EmbeddingSearchResult[]> {
    const queryEmbedding = await this.generateEmbedding(queryText)
    const results: EmbeddingSearchResult[] = []

    for (const candidate of candidateEmbeddings) {
      const similarity = this.calculateSimilarity(queryEmbedding.vector, candidate.vector)

      if (similarity >= threshold) {
        results.push({
          id: candidate.id,
          score: similarity,
          metadata: candidate,
          embedding: candidate,
        })
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit)
  }

  /**
   * Validate embedding consistency across components
   */
  validateEmbedding(embedding: number[], source: string): boolean {
    if (!Array.isArray(embedding)) {
      console.warn(chalk.yellow(`⚠︎ Invalid embedding format from ${source}: not an array`))
      return false
    }

    // Get actual dimensions from current provider
    const actualDimensions = this.provider.getCurrentDimensions()

    if (embedding.length !== actualDimensions) {
      console.warn(
        chalk.yellow(`⚠︎ Dimension mismatch from ${source}: expected ${actualDimensions}, got ${embedding.length}`)
      )
      return false
    }

    if (embedding.some((val) => typeof val !== 'number' || !Number.isFinite(val))) {
      console.warn(chalk.yellow(`⚠︎ Invalid embedding values from ${source}: contains non-finite numbers`))
      return false
    }

    return true
  }

  /**
   * Get current configuration
   */
  getConfig(): EmbeddingConfig {
    return { ...this.config }
  }

  /**
   * Get current embedding dimensions from the active provider
   */
  getCurrentDimensions(): number {
    return this.provider.getCurrentDimensions()
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<EmbeddingConfig>): void {
    const oldConfig = { ...this.config }
    this.config = { ...this.config, ...updates }

    // Clear cache if model or provider changed
    if (oldConfig.model !== this.config.model || oldConfig.provider !== this.config.provider) {
      console.log(chalk.blue('🔧 Model/provider changed, clearing embedding cache'))
      this.clearCache()
    }

    console.log(chalk.green('✓ Embedding configuration updated'))
    this.logConfig()
  }

  /**
   * Get performance statistics
   */
  getStats(): UnifiedEmbeddingStats {
    this.stats.averageLatency =
      this.queryLatencies.length > 0
        ? this.queryLatencies.reduce((sum, lat) => sum + lat, 0) / this.queryLatencies.length
        : 0

    this.stats.cacheHitRate =
      this.stats.totalQueries > 0
        ? (this.stats.totalQueries - Object.values(this.stats.byProvider).reduce((sum, p) => sum + p.count, 0)) /
        this.stats.totalQueries
        : 0

    return { ...this.stats }
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.embeddingCache.clear()
    if (this.config.persistenceEnabled) {
      this.clearPersistentCache()
    }
    console.log(chalk.green('✓ Embedding cache cleared'))
  }

  /**
   * Optimize cache and performance
   */
  async optimizeCache(): Promise<void> {
    console.log(chalk.blue('🔧 Optimizing embedding cache...'))

    // Remove old entries if cache is too large
    if (this.embeddingCache.size > this.MAX_MEMORY_CACHE) {
      const entries = Array.from(this.embeddingCache.entries())
      const sortedByAge = entries.sort((a, b) => b[1].timestamp.getTime() - a[1].timestamp.getTime())
      const toKeep = sortedByAge.slice(0, Math.floor(this.MAX_MEMORY_CACHE * 0.8))

      this.embeddingCache.clear()
      toKeep.forEach(([key, value]) => this.embeddingCache.set(key, value))

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

    console.log(chalk.blue.bold('\n⚡︎ Unified Embedding Interface Status'))
    console.log(chalk.gray('═'.repeat(50)))

    this.logConfig()

    console.log(chalk.cyan('\nPerformance:'))
    console.log(`  Total Embeddings: ${stats.totalEmbeddings.toLocaleString()}`)
    console.log(`  Total Queries: ${stats.totalQueries.toLocaleString()}`)
    console.log(`  Cache Hit Rate: ${(stats.cacheHitRate * 100).toFixed(1)}%`)
    console.log(`  Average Latency: ${Math.round(stats.averageLatency)}ms`)
    console.log(`  Total Cost: $${stats.totalCost.toFixed(6)}`)

    if (Object.keys(stats.byProvider).length > 0) {
      console.log(chalk.cyan('\nBy Provider:'))
      Object.entries(stats.byProvider).forEach(([provider, providerStats]) => {
        console.log(
          `  ${provider}: ${providerStats.count} embeddings, $${providerStats.cost.toFixed(6)}, ${Math.round(providerStats.averageLatency)}ms avg`
        )
      })
    }

    console.log(chalk.cyan('\nCache:'))
    console.log(`  Memory Cache: ${this.embeddingCache.size.toLocaleString()} entries`)
    console.log(`  Persistent Cache: ${this.config.persistenceEnabled ? 'enabled' : 'disabled'}`)
    console.log(`  Last Optimization: ${stats.lastOptimization.toLocaleTimeString()}`)
  }

  // Private methods
  private logConfig(): void {
    console.log(chalk.cyan('\nConfiguration:'))
    console.log(`  Provider: ${this.config.provider}`)
    console.log(`  Model: ${this.config.model}`)
    console.log(`  Dimensions: ${this.config.dimensions}`)
    console.log(`  Max Tokens: ${this.config.maxTokens.toLocaleString()}`)
    console.log(`  Batch Size: ${this.config.batchSize}`)
    console.log(`  Caching: ${this.config.cacheEnabled ? 'enabled' : 'disabled'}`)
    console.log(`  Persistence: ${this.config.persistenceEnabled ? 'enabled' : 'disabled'}`)
  }

  private generateCacheKey(text: string): string {
    const content = `${this.config.provider}:${this.config.model}:${text}`
    return createHash('md5').update(content).digest('hex')
  }

  private getCachedEmbedding(key: string): EmbeddingResult | null {
    const cached = this.embeddingCache.get(key)
    if (cached) {
      // Check if cache entry is still valid
      const age = Date.now() - cached.timestamp.getTime()
      if (age < this.CACHE_TTL) {
        return cached
      } else {
        this.embeddingCache.delete(key)
      }
    }
    return null
  }

  private cacheEmbedding(key: string, result: EmbeddingResult): void {
    this.embeddingCache.set(key, result)
  }

  private estimateCost(text: string, provider: string): number {
    return AiSdkEmbeddingProvider.estimateCost([text], provider)
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
  }

  private shouldWarnDimensions(expected: number, actual: number): boolean {
    if (!this.lastDimensionWarning) return true
    return this.lastDimensionWarning.expected !== expected || this.lastDimensionWarning.actual !== actual
  }

  private updateStats(result: EmbeddingResult, latency: number): void {
    this.stats.totalEmbeddings++
    this.stats.totalQueries++
    this.stats.totalCost += result.cost

    if (!this.stats.byProvider[result.provider]) {
      this.stats.byProvider[result.provider] = {
        count: 0,
        cost: 0,
        averageLatency: 0,
      }
    }

    const providerStats = this.stats.byProvider[result.provider]
    providerStats.count++
    providerStats.cost += result.cost
    providerStats.averageLatency =
      (providerStats.averageLatency * (providerStats.count - 1) + latency) / providerStats.count
  }

  private initializeStats(): UnifiedEmbeddingStats {
    return {
      totalEmbeddings: 0,
      totalQueries: 0,
      cacheHitRate: 0,
      averageLatency: 0,
      totalCost: 0,
      byProvider: {},
      lastOptimization: new Date(),
    }
  }

  private async initializePersistentCache(): Promise<void> {
    if (!this.config.persistenceEnabled) return

    try {
      if (!existsSync(this.persistentCacheDir)) {
        mkdirSync(this.persistentCacheDir, { recursive: true })
      }

      await this.loadPersistentCache()
      console.log(chalk.gray(`✓ Persistent embedding cache initialized`))
    } catch (error) {
      console.warn(chalk.yellow(`⚠︎ Failed to initialize persistent cache: ${error}`))
    }
  }

  private async loadPersistentCache(): Promise<void> {
    const cacheFile = join(this.persistentCacheDir, 'unified-embeddings.json')

    try {
      if (existsSync(cacheFile)) {
        const data = await readFile(cacheFile, 'utf-8')
        const cached = JSON.parse(data)

        for (const [key, value] of Object.entries(cached.embeddings || {})) {
          const result = value as any
          result.timestamp = new Date(result.timestamp)
          this.embeddingCache.set(key, result as EmbeddingResult)
        }

        if (cached.stats) {
          this.stats = { ...this.stats, ...cached.stats }
          this.stats.lastOptimization = new Date(this.stats.lastOptimization)
        }

        console.log(chalk.gray(`📦 Loaded ${this.embeddingCache.size} embeddings from persistent cache`))
      }
    } catch (error) {
      console.warn(chalk.yellow(`⚠︎ Failed to load persistent cache: ${error}`))
    }
  }

  private async savePersistentCache(): Promise<void> {
    const cacheFile = join(this.persistentCacheDir, 'unified-embeddings.json')

    try {
      const data = {
        embeddings: Object.fromEntries(this.embeddingCache),
        stats: this.stats,
        lastSaved: new Date(),
      }

      await writeFile(cacheFile, JSON.stringify(data, null, 2))
      console.log(chalk.gray(`💾 Saved ${this.embeddingCache.size} embeddings to persistent cache`))
    } catch (error) {
      console.warn(chalk.yellow(`⚠︎ Failed to save persistent cache: ${error}`))
    }
  }

  private async clearPersistentCache(): Promise<void> {
    const cacheFile = join(this.persistentCacheDir, 'unified-embeddings.json')

    try {
      if (existsSync(cacheFile)) {
        await writeFile(
          cacheFile,
          JSON.stringify({ embeddings: {}, stats: this.initializeStats(), lastSaved: new Date() })
        )
      }
    } catch (error) {
      console.warn(chalk.yellow(`⚠︎ Failed to clear persistent cache: ${error}`))
    }
  }
}

// Export singleton instance
export const unifiedEmbeddingInterface = new UnifiedEmbeddingInterface()
