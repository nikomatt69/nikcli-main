import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { embed } from 'ai'
import chalk from 'chalk'
import { configManager } from '../core/config-manager'
import { redisProvider } from '../providers/redis/redis-provider'
import { advancedUI } from '../ui/advanced-cli-ui'

export interface EmbeddingConfig {
  provider: 'openai' | 'google' | 'anthropic' | 'openrouter'
  model: string
  batchSize: number
  maxTokens: number
  costPer1KTokens: number
  baseURL?: string
  headers?: Record<string, string>
  dimensions?: number
}

export interface EmbeddingResult {
  embeddings: number[][]
  tokensUsed: number
  cost: number
  provider: string
  model: string
}

type ResolvedEmbeddingModel = {
  name: string
  config: Required<EmbeddingConfig> & { dimensions: number }
}

export interface EmbeddingStats {
  totalRequests: number
  totalTokens: number
  totalCost: number
  providerUsage: Record<string, number>
  averageLatency: number
  successRate: number
}

/**
 * Unified AI SDK Embedding Provider
 * Supports multiple providers with automatic fallback and cost optimization
 */
export class AiSdkEmbeddingProvider {
  private stats: EmbeddingStats = {
    totalRequests: 0,
    totalTokens: 0,
    totalCost: 0,
    providerUsage: {},
    averageLatency: 0,
    successRate: 0,
  }

  private availableProviders: string[] = []
  private currentProvider: string | null = null
  private lastUsedDimensions: number = 1536

  constructor() {
    this.initializeProviders()
  }

  /**
   * Initialize available providers based on configured API keys
   * ALWAYS use OpenAI for embeddings (even via OpenRouter)
   */
  private initializeProviders(): void {
    const models = configManager.get('embeddingModels') || {}
    const configuredProviders = new Set<string>()

    Object.values(models).forEach((cfg: any) => configuredProviders.add(cfg.provider))

    const hasOpenAI = configManager.getApiKey('openai') || process.env.OPENAI_API_KEY
    const hasGoogle = configManager.getApiKey('google') || process.env.GOOGLE_GENERATIVE_AI_API_KEY
    const hasOpenRouter = configManager.getApiKey('openrouter') || process.env.OPENROUTER_API_KEY

    this.availableProviders = Array.from(configuredProviders).filter((p) => {
      if (p === 'openai') return !!hasOpenAI || !!hasOpenRouter
      if (p === 'google') return !!hasGoogle
      if (p === 'openrouter') return !!hasOpenRouter
      if (p === 'anthropic') return false
      return false
    })

    this.currentProvider = this.availableProviders[0] || null

    if (this.availableProviders.length === 0) {
      advancedUI.logInfo('⚡︎ RAG using local workspace analysis (no API keys configured)')
    }
  }

  private getDefaultDimensions(provider: string): number {
    switch (provider) {
      case 'google':
        return 768
      case 'anthropic':
        return 1536
      case 'openrouter':
        return this.lastUsedDimensions || 1536
      case 'openai':
      default:
        return 1536
    }
  }

  private buildModelCandidates(): ResolvedEmbeddingModel[] {
    const models = configManager.get('embeddingModels') || {}
    const currentName = configManager.getCurrentEmbeddingModel() || Object.keys(models)[0]
    const fallbackProviders = configManager.get('embeddingProvider')?.fallbackChain || []

    const requestedOrder: string[] = []
    if (currentName) requestedOrder.push(currentName)

    for (const provider of fallbackProviders) {
      const fallbackEntry = Object.entries(models).find(
        ([name, cfg]) => (cfg as any).provider === provider && name !== currentName
      )
      if (fallbackEntry) requestedOrder.push(fallbackEntry[0])
    }

    if (requestedOrder.length === 0) {
      requestedOrder.push(...Object.keys(models))
    }

    return requestedOrder
      .filter((name, idx, arr) => name && arr.indexOf(name) === idx)
      .map((name) => {
        const cfg: any = (models as any)[name] || {}
        const provider = cfg.provider || 'openrouter'
        return {
          name,
          config: {
            provider,
            model: cfg.model || name,
            dimensions: cfg.dimensions || this.getDefaultDimensions(provider),
            batchSize: cfg.batchSize || Number(process.env.EMBED_BATCH_SIZE || 300),
            maxTokens: cfg.maxTokens || 8191,
            costPer1KTokens: cfg.costPer1KTokens ?? 0,
            baseURL: cfg.baseURL,
            headers: cfg.headers,
          },
        }
      })
  }

  private hasApiKey(provider: string): boolean {
    switch (provider) {
      case 'openai':
        return !!(
          configManager.getApiKey('openai') ||
          process.env.OPENAI_API_KEY ||
          configManager.getApiKey(configManager.getCurrentEmbeddingModel()) ||
          configManager.getApiKey('openrouter') ||
          process.env.OPENROUTER_API_KEY
        )
      case 'google':
        return !!(configManager.getApiKey('google') || process.env.GOOGLE_GENERATIVE_AI_API_KEY)
      case 'openrouter':
        return !!(
          configManager.getApiKey('openrouter') ||
          configManager.getApiKey(configManager.getCurrentEmbeddingModel()) ||
          process.env.OPENROUTER_API_KEY
        )
      case 'anthropic':
        return !!configManager.getApiKey('anthropic')
      default:
        return false
    }
  }

  private async collectCachedEmbeddings(
    texts: string[],
    candidate: ResolvedEmbeddingModel
  ): Promise<{
    cachedResults: Array<number[] | null>
    uncachedTexts: string[]
    uncachedIndices: number[]
  }> {
    const cachedResults: Array<number[] | null> = []
    const uncachedTexts: string[] = []
    const uncachedIndices: number[] = []

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i]
      const cached = await redisProvider.getCachedVector(text, candidate.config.provider, candidate.config.model)
      if (cached) {
        cachedResults[i] = cached.embedding
      } else {
        cachedResults[i] = null
        uncachedTexts.push(text)
        uncachedIndices.push(i)
      }
    }

    return { cachedResults, uncachedTexts, uncachedIndices }
  }

  private async cacheEmbeddings(
    texts: string[],
    embeddings: number[][],
    candidate: ResolvedEmbeddingModel,
    costPerVector: number
  ): Promise<void> {
    const cachePromises = texts.map(async (text, idx) => {
      const embedding = embeddings[idx]
      if (!embedding) return
      await redisProvider.cacheVector(
        text,
        embedding,
        candidate.config.provider,
        candidate.config.model,
        costPerVector,
        300
      )
    })

    await Promise.allSettled(cachePromises)
  }

  private mergeResults(
    total: number,
    cachedResults: Array<number[] | null>,
    newEmbeddings: number[][],
    uncachedIndices: number[]
  ): number[][] {
    const finalResults: number[][] = []
    let uncachedIndex = 0

    for (let i = 0; i < total; i++) {
      if (cachedResults[i] !== null) {
        finalResults[i] = cachedResults[i]!
      } else {
        finalResults[i] = newEmbeddings[uncachedIndex]
        uncachedIndex++
      }
    }

    return finalResults
  }

  /**
   * Get the dimensions for the current provider
   */
  getCurrentDimensions(): number {
    const modelName = configManager.getCurrentEmbeddingModel()
    const cfg = modelName ? configManager.getEmbeddingModelConfig(modelName) : undefined
    return cfg?.dimensions || this.lastUsedDimensions || 1536
  }

  setLastUsedDimensions(dim: number): void {
    this.lastUsedDimensions = dim
  }

  /**
   * Generate embeddings using the best available provider with caching
   */
  async generate(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return []

    const startTime = Date.now()
    this.stats.totalRequests++
    this.initializeProviders()

    const candidates = this.buildModelCandidates()
    if (candidates.length === 0) {
      throw new Error('No embedding models configured. Use /embed-model to set one or configure API keys.')
    }

    let lastError: Error | null = null

    for (const candidate of candidates) {
      if (!this.hasApiKey(candidate.config.provider)) {
        advancedUI.logWarning(`⚠︎ No API key for ${candidate.config.provider}, skipping ${candidate.name}`)
        continue
      }

      const { cachedResults, uncachedTexts, uncachedIndices } = await this.collectCachedEmbeddings(texts, candidate)

      if (uncachedTexts.length === 0) {
        this.currentProvider = candidate.config.provider
        this.lastUsedDimensions = candidate.config.dimensions
        advancedUI.logSuccess(`✓ All ${texts.length} embeddings served from cache (${candidate.name})`)
        return cachedResults as number[][]
      }

      try {
        const result = await this.generateWithModel(uncachedTexts, candidate.config)

        const perVectorCost = result.embeddings.length > 0 ? result.cost / result.embeddings.length : 0
        await this.cacheEmbeddings(uncachedTexts, result.embeddings, candidate, perVectorCost)

        const finalResults = this.mergeResults(texts.length, cachedResults, result.embeddings, uncachedIndices)

        this.currentProvider = candidate.config.provider
        this.lastUsedDimensions = candidate.config.dimensions

        this.updateStats(
          {
            ...result,
            provider: candidate.config.provider,
            model: candidate.config.model,
            cost: result.cost,
          },
          Date.now() - startTime,
          true
        )

        return finalResults
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error))
        advancedUI.logWarning(`⚠︎ Embedding failed with ${candidate.name}: ${lastError.message}`)
      }
    }

    this.updateStats(
      { embeddings: [], tokensUsed: 0, cost: 0, provider: this.currentProvider || 'unknown', model: '' },
      Date.now() - startTime,
      false
    )
    throw lastError || new Error('All embedding providers failed.')
  }

  /**
   * Generate embeddings with a specific provider using concurrent processing
   */
  private async generateWithModel(texts: string[], config: ResolvedEmbeddingModel['config']): Promise<EmbeddingResult> {
    // Truncate texts to fit within token limits with safety margin
    const processedTexts = texts.map((text) => {
      const truncated = this.truncateText(text, config.maxTokens)
      // Double-check the truncation worked
      const estimatedTokens = Math.ceil(truncated.length / 3.5)
      if (estimatedTokens > config.maxTokens) {
        // Emergency truncation if still too long
        const safeMaxChars = Math.floor(config.maxTokens * 0.7 * 3.5)
        return truncated.substring(0, safeMaxChars) + '\n[truncated]'
      }
      return truncated
    })

    // Create batches
    const effectiveBatchSize = this._calculateOptimalBatchSize(processedTexts, config.batchSize)
    const batches: string[][] = []
    for (let i = 0; i < processedTexts.length; i += effectiveBatchSize) {
      batches.push(processedTexts.slice(i, i + effectiveBatchSize))
    }

    // Process batches concurrently with controlled concurrency
    const maxConcurrentBatches = Math.min(Number(process.env.EMBED_MAX_CONCURRENCY || 6), batches.length) // Configurable concurrency
    const results: number[][] = []
    let totalTokens = 0

    // Use Promise pool for controlled concurrency
    for (let i = 0; i < batches.length; i += maxConcurrentBatches) {
      const batchGroup = batches.slice(i, i + maxConcurrentBatches)

      const batchPromises = batchGroup.map(async (batch, batchIndex) => {
        try {
          const batchResult = await this.generateBatch(batch, config)
          return { index: i + batchIndex, result: batchResult }
        } catch (error) {
          advancedUI.logWarning(`⚠︎ Batch ${i + batchIndex} failed: ${(error as Error).message}`)
          throw error
        }
      })

      // Wait for current batch group to complete
      const batchResults = await Promise.all(batchPromises)

      // Collect results in order
      for (const { result } of batchResults.sort((a, b) => a.index - b.index)) {
        results.push(...result.embeddings)
        totalTokens += result.tokensUsed
      }

      // Rate limiting between batch groups
      if (i + maxConcurrentBatches < batches.length) {
        await new Promise((resolve) => setTimeout(resolve, Number(process.env.EMBED_INTER_BATCH_DELAY_MS || 25))) // Configurable delay
      }
    }

    const cost = (totalTokens / 1000) * config.costPer1KTokens

    return {
      embeddings: results,
      tokensUsed: totalTokens,
      cost,
      provider: config.provider,
      model: config.model,
    }
  }

  /**
   * Calculate optimal batch size based on text characteristics and success rate
   */
  private _calculateOptimalBatchSize(texts: string[], base: number, recentSuccessRate: number = 1.0): number {
    const adaptiveEnabled = process.env.EMBED_ADAPTIVE_BATCHING !== 'false'

    if (!adaptiveEnabled) return base

    const avgLength = texts.reduce((sum, text) => sum + text.length, 0) / texts.length

    // Adjust based on text length
    let multiplier = 1.0
    if (avgLength < 100)
      multiplier = 1.5 // Short texts - can handle larger batches
    else if (avgLength < 500)
      multiplier = 1.2 // Medium texts
    else if (avgLength < 1000)
      multiplier = 1.0 // Long texts
    else multiplier = 0.8 // Very long texts - smaller batches

    // Adjust based on recent success rate
    if (recentSuccessRate < 0.9)
      multiplier *= 0.8 // Reduce batch size if failing
    else if (recentSuccessRate > 0.95) multiplier *= 1.1 // Increase if very successful

    return Math.max(50, Math.min(500, Math.round(base * multiplier)))
  }

  /**
   * Generate embeddings for a batch of texts
   */
  private async generateBatch(texts: string[], config: ResolvedEmbeddingModel['config']): Promise<EmbeddingResult> {
    try {
      // Configure AI SDK provider and generate embeddings
      let embeddings: number[][]
      let usage: any

      switch (config.provider) {
        case 'openai':
          {
            // Configure OpenAI with API key from config or environment
            const modelKey = configManager.getApiKey(config.model)
            const apiKey = config.baseURL?.includes('openrouter.ai')
              ? configManager.getApiKey('openrouter') ||
                modelKey ||
                process.env.OPENROUTER_API_KEY ||
                configManager.getApiKey('openai') ||
                process.env.OPENAI_API_KEY
              : modelKey || configManager.getApiKey('openai') || process.env.OPENAI_API_KEY

            if (!apiKey) {
              throw new Error('OpenAI API key not found')
            }

            const openaiProvider = createOpenAI({
              apiKey,
              baseURL: config.baseURL,
              headers: config.headers,
            })
            const model = openaiProvider.embedding(config.model)

            // Helper function for embedding with retry and timeout
            const embedWithRetry = async (text: string, retries = 3): Promise<number[]> => {
              for (let attempt = 1; attempt <= retries; attempt++) {
                try {
                  const result = await embed({
                    model,
                    value: text,
                  })
                  return result.embedding
                } catch (error) {
                  if (attempt === retries) throw error

                  // Wait before retry (exponential backoff)
                  const delay = Math.min(1000 * 2 ** (attempt - 1), 5000)
                  await new Promise((resolve) => setTimeout(resolve, delay))
                }
              }
              throw new Error('Max retries exceeded')
            }

            // For multiple texts, use embedMany with retry
            if (texts.length > 1) {
              const results = await Promise.all(texts.map(async (text) => embedWithRetry(text)))
              embeddings = results
            } else {
              embeddings = [await embedWithRetry(texts[0])]
            }
            usage = { tokens: this.estimateTokens(texts.join(' ')) }
          }
          break
        case 'google':
          {
            // Configure Google with API key from config or environment
            const apiKey = configManager.getApiKey('google') || process.env.GOOGLE_GENERATIVE_AI_API_KEY
            if (!apiKey) {
              throw new Error('Google API key not found')
            }

            const googleProvider = createGoogleGenerativeAI({ apiKey })
            const model = googleProvider.textEmbeddingModel(config.model)

            // For multiple texts, use embedMany
            if (texts.length > 1) {
              const results = await Promise.all(
                texts.map(async (text) => {
                  const result = await embed({
                    model,
                    value: text,
                  })
                  return result.embedding
                })
              )
              embeddings = results
            } else {
              const result = await embed({
                model,
                value: texts[0],
              })
              embeddings = [result.embedding]
            }
            usage = { tokens: this.estimateTokens(texts.join(' ')) }
          }
          break
        case 'openrouter': {
          const apiKey =
            configManager.getApiKey('openrouter') ||
            configManager.getApiKey(config.model) ||
            process.env.OPENROUTER_API_KEY
          if (!apiKey) {
            throw new Error('OpenRouter API key not found')
          }

          const openrouterProvider = createOpenAI({
            apiKey,
            baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
            headers: {
              'HTTP-Referer': 'https://nikcli.mintlify.app',
              'X-Title': 'NikCLI',
              ...(config.headers || {}),
            },
          })
          const model = openrouterProvider.embedding(config.model)

          const embedWithRetry = async (text: string, retries = 3): Promise<number[]> => {
            for (let attempt = 1; attempt <= retries; attempt++) {
              try {
                const result = await embed({
                  model,
                  value: text,
                })
                return result.embedding
              } catch (error) {
                if (attempt === retries) throw error
                const delay = Math.min(1000 * 2 ** (attempt - 1), 5000)
                await new Promise((resolve) => setTimeout(resolve, delay))
              }
            }
            throw new Error('Max retries exceeded')
          }

          if (texts.length > 1) {
            const results = await Promise.all(texts.map(async (text) => embedWithRetry(text)))
            embeddings = results
          } else {
            embeddings = [await embedWithRetry(texts[0])]
          }
          usage = { tokens: this.estimateTokens(texts.join(' ')) }
          break
        }
        case 'anthropic':
          // Anthropic doesn't have direct embedding model via AI SDK yet
          // Fallback to simpler approach
          throw new Error('Anthropic embeddings not yet supported via AI SDK')
        default:
          throw new Error(`Unsupported provider: ${config.provider}`)
      }

      return {
        embeddings,
        tokensUsed: usage?.tokens || this.estimateTokens(texts.join(' ')),
        cost: 0, // Will be calculated by caller
        provider: config.provider,
        model: config.model,
      }
    } catch (error: any) {
      // Enhanced error handling
      if (error.message?.includes('rate limit')) {
        advancedUI.logWarning(`⚠︎ Rate limit reached for ${config.provider}, waiting...`)
        await new Promise((resolve) => setTimeout(resolve, 2000))
        // Retry once
        return this.generateBatch(texts, config)
      }

      throw new Error(`${config.provider} embedding failed: ${error.message}`)
    }
  }

  /**
   * Truncate text to fit within token limits (with safety margin)
   */
  private truncateText(text: string, maxTokens: number): string {
    // Use conservative token estimation: 1 token ≈ 3.5 characters (safer than 4)
    // Add 20% safety margin to avoid edge cases
    const safeMaxTokens = Math.floor(maxTokens * 0.8) // 80% of limit for safety
    const maxChars = safeMaxTokens * 3.5

    if (text.length <= maxChars) return text

    // Truncate with clear marker
    const truncated = text.substring(0, Math.floor(maxChars))
    return `${truncated}\n[... truncated for embedding ...]`
  }

  /**
   * Estimate token count for text
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
  }

  /**
   * Update provider statistics
   */
  private updateStats(result: EmbeddingResult, latency: number, success: boolean): void {
    this.stats.totalTokens += result.tokensUsed
    this.stats.totalCost += result.cost
    this.stats.providerUsage[result.provider] = (this.stats.providerUsage[result.provider] || 0) + 1

    // Update average latency
    this.stats.averageLatency =
      (this.stats.averageLatency * (this.stats.totalRequests - 1) + latency) / this.stats.totalRequests

    // Update success rate
    const successCount = Math.round(this.stats.successRate * (this.stats.totalRequests - 1)) + (success ? 1 : 0)
    this.stats.successRate = successCount / this.stats.totalRequests
  }

  /**
   * Estimate cost for given texts
   */
  static estimateCost(texts: string[] | string, modelName?: string): number {
    const activeModel = modelName || configManager.getCurrentEmbeddingModel()
    const config = activeModel ? configManager.getEmbeddingModelConfig(activeModel) : undefined

    const totalChars = typeof texts === 'string' ? texts.length : texts.reduce((sum, text) => sum + text.length, 0)
    const estimatedTokens = Math.ceil(totalChars / 4)

    return (estimatedTokens / 1000) * (config?.costPer1KTokens ?? 0)
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): string[] {
    this.initializeProviders()
    return [...this.availableProviders]
  }

  /**
   * Get current provider
   */
  getCurrentProvider(): string | null {
    return this.currentProvider
  }

  /**
   * Manually set provider
   */
  setProvider(provider: string): boolean {
    if (this.availableProviders.includes(provider)) {
      this.currentProvider = provider
      advancedUI.logInfo(`🔧 Switched to embedding provider: ${provider}`)
      return true
    }

    advancedUI.logError(`✖ Provider ${provider} not available. Available: ${this.availableProviders.join(', ')}`)
    return false
  }

  /**
   * Get provider statistics
   */
  getStats(): EmbeddingStats {
    return { ...this.stats }
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      providerUsage: {},
      averageLatency: 0,
      successRate: 0,
    }
  }

  /**
   * Get provider health status
   */
  async healthCheck(): Promise<Record<string, boolean>> {
    const health: Record<string, boolean> = {}

    const candidates = this.buildModelCandidates()
    for (const candidate of candidates) {
      if (!this.hasApiKey(candidate.config.provider)) {
        health[candidate.name] = false
        continue
      }
      try {
        await this.generateWithModel(['test'], candidate.config)
        health[candidate.name] = true
      } catch {
        health[candidate.name] = false
      }
    }

    return health
  }

  /**
   * Log provider status and statistics
   */
  logStatus(): void {
    console.log(chalk.blue.bold('\n🔌 AI SDK Embedding Provider Status'))
    console.log(chalk.gray('═'.repeat(50)))

    const currentEmbeddingModel = configManager.getCurrentEmbeddingModel()
    console.log(`Current Provider: ${this.currentProvider || 'None'}`)
    console.log(`Current Embedding Model: ${currentEmbeddingModel || 'None'}`)
    console.log(`Available Providers: ${this.availableProviders.join(', ') || 'None'}`)

    if (this.stats.totalRequests > 0) {
      console.log(`\nStatistics:`)
      console.log(`  Total Requests: ${this.stats.totalRequests}`)
      console.log(`  Total Tokens: ${this.stats.totalTokens.toLocaleString()}`)
      console.log(`  Total Cost: $${this.stats.totalCost.toFixed(6)}`)
      console.log(`  Success Rate: ${(this.stats.successRate * 100).toFixed(1)}%`)
      console.log(`  Avg Latency: ${Math.round(this.stats.averageLatency)}ms`)

      if (Object.keys(this.stats.providerUsage).length > 0) {
        console.log(`  Provider Usage:`)
        for (const [provider, count] of Object.entries(this.stats.providerUsage)) {
          console.log(`    ${provider}: ${count} requests`)
        }
      }
    }
  }
}

// Export singleton instance
export const aiSdkEmbeddingProvider = new AiSdkEmbeddingProvider()
