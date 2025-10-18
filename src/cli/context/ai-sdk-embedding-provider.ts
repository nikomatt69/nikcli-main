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
}

export interface EmbeddingResult {
  embeddings: number[][]
  tokensUsed: number
  cost: number
  provider: string
  model: string
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

  private readonly providerConfigs: Record<string, EmbeddingConfig & { dimensions: number }> = {
    openai: {
      provider: 'openai',
      model: 'text-embedding-3-small',
      batchSize: 100, // Configurable via env
      maxTokens: 8000, // Set to 8000 instead of 8191 for safety margin (model limit is 8192)
      costPer1KTokens: 0.00002,
      dimensions: 1536,
    },
    google: {
      provider: 'google',
      model: 'text-embedding-004',
      batchSize: 50,
      maxTokens: 2048,
      costPer1KTokens: 0.000025,
      dimensions: 768,
    },
  }

  private availableProviders: string[] = []
  private currentProvider: string | null = null

  constructor() {
    this.initializeProviders()
  }

  /**
   * Initialize available providers based on configured API keys
   * ALWAYS use OpenAI for embeddings (even via OpenRouter)
   */
  private initializeProviders(): void {
    this.availableProviders = []

    // Primary: Check OpenAI API key (direct or via OpenRouter)
    const hasOpenAI = configManager.getApiKey('openai') || process.env.OPENAI_API_KEY
    const hasOpenRouter = configManager.getApiKey('openrouter') || process.env.OPENROUTER_API_KEY

    if (hasOpenAI || hasOpenRouter) {
      this.availableProviders.push('openai')
      this.currentProvider = 'openai' // ALWAYS use OpenAI for embeddings

    } else {
      // Fallback: Check Google only if no OpenAI key available
      if (configManager.getApiKey('google') || process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        this.availableProviders.push('google')
        this.currentProvider = 'google'

      }
    }

    if (this.availableProviders.length === 0) {
      advancedUI.logInfo('⚡︎ RAG using local workspace analysis (no API keys configured)')
    }
  }

  /**
   * Get the dimensions for the current provider
   */
  getCurrentDimensions(): number {
    if (!this.currentProvider) return 1536 // Default
    return this.providerConfigs[this.currentProvider]?.dimensions || 1536
  }

  /**
   * Generate embeddings using the best available provider with caching
   */
  async generate(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return []

    if (!this.currentProvider) {
      throw new Error('No embedding providers available. Configure API keys for OpenAI, Google, or Anthropic.')
    }

    const startTime = Date.now()
    this.stats.totalRequests++

    // Check cache for each text
    const config = this.providerConfigs[this.currentProvider]
    const cachedResults: Array<number[] | null> = []
    const uncachedTexts: string[] = []
    const uncachedIndices: number[] = []

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i]
      const cached = await redisProvider.getCachedVector(text, this.currentProvider, config.model)

      if (cached) {
        cachedResults[i] = cached.embedding

      } else {
        cachedResults[i] = null
        uncachedTexts.push(text)
        uncachedIndices.push(i)
      }
    }

    // If all results are cached, return immediately
    if (uncachedTexts.length === 0) {
      advancedUI.logSuccess(`✓ All ${texts.length} embeddings served from cache`)
      return cachedResults as number[][]
    }

    try {
      const result = await this.generateWithProvider(uncachedTexts, this.currentProvider)

      // Cache new embeddings
      const cachePromises = uncachedTexts.map(async (text, idx) => {
        const embedding = result.embeddings[idx]
        if (embedding) {
          await redisProvider.cacheVector(
            text,
            embedding,
            this.currentProvider!,
            config.model,
            result.cost / uncachedTexts.length, // Proportional cost
            300 // 5 min TTL
          )
        }
      })

      // Cache in background, don't wait
      Promise.allSettled(cachePromises).catch(() => {
        console.log(chalk.yellow('⚠️ Some embeddings failed to cache'))
      })

      // Merge cached and new results
      const finalResults: number[][] = []
      let uncachedIndex = 0

      for (let i = 0; i < texts.length; i++) {
        if (cachedResults[i] !== null) {
          finalResults[i] = cachedResults[i]!
        } else {
          finalResults[i] = result.embeddings[uncachedIndex]
          uncachedIndex++
        }
      }

      // Update stats (only for uncached requests)
      this.updateStats(result, Date.now() - startTime, true)

      return finalResults
    } catch (error: any) {
      advancedUI.logWarning(`⚠️ Embedding failed with ${this.currentProvider}: ${error.message}`)

      // Try fallback providers for uncached texts only
      for (const provider of this.availableProviders) {
        if (provider !== this.currentProvider) {
          try {
            advancedUI.logInfo(`⚡︎ Trying fallback provider: ${provider}`)
            const result = await this.generateWithProvider(uncachedTexts, provider)

            // Update current provider to working one
            this.currentProvider = provider
            this.updateStats(result, Date.now() - startTime, true)

            // Merge results and return
            const finalResults: number[][] = []
            let uncachedIndex = 0

            for (let i = 0; i < texts.length; i++) {
              if (cachedResults[i] !== null) {
                finalResults[i] = cachedResults[i]!
              } else {
                finalResults[i] = result.embeddings[uncachedIndex]
                uncachedIndex++
              }
            }

            return finalResults
          } catch (fallbackError: any) {
            advancedUI.logWarning(`⚠️ Fallback ${provider} also failed: ${fallbackError.message}`)
          }
        }
      }

      // All providers failed
      this.updateStats(
        { embeddings: [], tokensUsed: 0, cost: 0, provider: this.currentProvider, model: '' },
        Date.now() - startTime,
        false
      )
      throw new Error(`All embedding providers failed. Last error: ${error.message}`)
    }
  }

  /**
   * Generate embeddings with a specific provider using concurrent processing
   */
  private async generateWithProvider(texts: string[], providerName: string): Promise<EmbeddingResult> {
    const config = this.providerConfigs[providerName]

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
    const batches: string[][] = []
    for (let i = 0; i < processedTexts.length; i += config.batchSize) {
      batches.push(processedTexts.slice(i, i + config.batchSize))
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
          const batchResult = await this.generateBatch(batch, providerName)
          return { index: i + batchIndex, result: batchResult }
        } catch (error) {
          advancedUI.logWarning(`⚠️ Batch ${i + batchIndex} failed: ${(error as Error).message}`)
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
      provider: providerName,
      model: config.model,
    }
  }

  /**
   * Calculate optimal batch size based on text characteristics and success rate
   */
  private _calculateOptimalBatchSize(texts: string[], recentSuccessRate: number = 1.0): number {
    const base = Number(process.env.EMBED_BATCH_SIZE || 300)
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
  private async generateBatch(texts: string[], providerName: string): Promise<EmbeddingResult> {
    const config = this.providerConfigs[providerName]

    try {
      // Configure AI SDK provider and generate embeddings
      let embeddings: number[][]
      let usage: any

      switch (providerName) {
        case 'openai':
          {
            // Configure OpenAI with API key from config or environment
            // Also accepts OpenRouter key as fallback for OpenAI embeddings
            const apiKey = configManager.getApiKey('openai') ||
              process.env.OPENAI_API_KEY ||
              configManager.getApiKey('openrouter') ||
              process.env.OPENROUTER_API_KEY

            if (!apiKey) {
              throw new Error('OpenAI or OpenRouter API key not found')
            }

            const openaiProvider = createOpenAI({ apiKey })
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
                  const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
                  await new Promise(resolve => setTimeout(resolve, delay))
                }
              }
              throw new Error('Max retries exceeded')
            }

            // For multiple texts, use embedMany with retry
            if (texts.length > 1) {
              const results = await Promise.all(
                texts.map(async (text) => embedWithRetry(text))
              )
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
        case 'anthropic':
          // Anthropic doesn't have direct embedding model via AI SDK yet
          // Fallback to simpler approach
          throw new Error('Anthropic embeddings not yet supported via AI SDK')
        default:
          throw new Error(`Unsupported provider: ${providerName}`)
      }

      return {
        embeddings,
        tokensUsed: usage?.tokens || this.estimateTokens(texts.join(' ')),
        cost: 0, // Will be calculated by caller
        provider: providerName,
        model: config.model,
      }
    } catch (error: any) {
      // Enhanced error handling
      if (error.message?.includes('rate limit')) {
        advancedUI.logWarning(`⚠️ Rate limit reached for ${providerName}, waiting...`)
        await new Promise((resolve) => setTimeout(resolve, 2000))
        // Retry once
        return this.generateBatch(texts, providerName)
      }

      throw new Error(`${providerName} embedding failed: ${error.message}`)
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
  static estimateCost(texts: string[] | string, provider: string = 'openai'): number {
    const instance = new AiSdkEmbeddingProvider()
    const config = instance.providerConfigs[provider] || instance.providerConfigs.openai

    const totalChars = typeof texts === 'string' ? texts.length : texts.reduce((sum, text) => sum + text.length, 0)
    const estimatedTokens = Math.ceil(totalChars / 4)

    return (estimatedTokens / 1000) * config.costPer1KTokens
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): string[] {
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

    advancedUI.logError(`❌ Provider ${provider} not available. Available: ${this.availableProviders.join(', ')}`)
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

    for (const provider of this.availableProviders) {
      try {
        await this.generateWithProvider(['test'], provider)
        health[provider] = true
      } catch {
        health[provider] = false
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

    console.log(`Current Provider: ${this.currentProvider || 'None'}`)
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
