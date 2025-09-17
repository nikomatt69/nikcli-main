import { embed } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import chalk from 'chalk'
import { configManager } from '../core/config-manager'

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

  private readonly providerConfigs: Record<string, EmbeddingConfig> = {
    openai: {
      provider: 'openai',
      model: 'text-embedding-3-small',
      batchSize: 100,
      maxTokens: 8191,
      costPer1KTokens: 0.00002,
    },
    google: {
      provider: 'google',
      model: 'text-embedding-004',
      batchSize: 50,
      maxTokens: 2048,
      costPer1KTokens: 0.000025,
    },
    anthropic: {
      provider: 'anthropic',
      model: 'claude-3-haiku-20240307', // Fallback to text generation if no embedding
      batchSize: 10,
      maxTokens: 1000,
      costPer1KTokens: 0.0001,
    },
    openrouter: {
      provider: 'openrouter',
      model: 'text-embedding-3-small', // Uses OpenAI compatible embeddings
      batchSize: 50,
      maxTokens: 8191,
      costPer1KTokens: 0.00003, // Slightly higher than OpenAI direct
    },
  }

  private availableProviders: string[] = []
  private currentProvider: string | null = null

  constructor() {
    this.initializeProviders()
  }

  /**
   * Initialize available providers based on configured API keys
   */
  private initializeProviders(): void {
    this.availableProviders = []

    // Check OpenAI (config manager or environment)
    if (configManager.getApiKey('openai') || process.env.OPENAI_API_KEY) {
      this.availableProviders.push('openai')
    }

    // Check Google (config manager or environment)
    if (configManager.getApiKey('google') || process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      this.availableProviders.push('google')
    }

    // Check Anthropic (config manager or environment)
    if (configManager.getApiKey('anthropic') || process.env.ANTHROPIC_API_KEY) {
      this.availableProviders.push('anthropic')
    }

    // Check OpenRouter (config manager or environment)
    if (configManager.getApiKey('openrouter') || process.env.OPENROUTER_API_KEY) {
      this.availableProviders.push('openrouter')
    }

    // Set default provider (prefer OpenRouter if available, then OpenAI for cost efficiency)
    if (this.availableProviders.includes('openrouter')) {
      this.currentProvider = 'openrouter'
    } else {
      this.currentProvider = this.availableProviders[0] || null
    }

    if (this.availableProviders.length === 0) {
      console.log(chalk.blue('🧠 RAG using local workspace analysis (no API keys configured)'))
    } else {
      console.log(chalk.green(`✅ Embedding providers available: ${this.availableProviders.join(', ')}`))
      console.log(chalk.gray(`   Default: ${this.currentProvider}`))
    }
  }

  /**
   * Generate embeddings using the best available provider
   */
  async generate(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return []

    if (!this.currentProvider) {
      throw new Error('No embedding providers available. Configure API keys for OpenAI, Google, or Anthropic.')
    }

    const startTime = Date.now()
    this.stats.totalRequests++

    try {
      const result = await this.generateWithProvider(texts, this.currentProvider)

      // Update stats
      this.updateStats(result, Date.now() - startTime, true)

      return result.embeddings
    } catch (error: any) {
      console.log(chalk.yellow(`⚠️ Embedding failed with ${this.currentProvider}: ${error.message}`))

      // Try fallback providers
      for (const provider of this.availableProviders) {
        if (provider !== this.currentProvider) {
          try {
            console.log(chalk.blue(`🔄 Trying fallback provider: ${provider}`))
            const result = await this.generateWithProvider(texts, provider)

            // Update current provider to working one
            this.currentProvider = provider
            this.updateStats(result, Date.now() - startTime, true)

            return result.embeddings
          } catch (fallbackError: any) {
            console.log(chalk.yellow(`⚠️ Fallback ${provider} also failed: ${fallbackError.message}`))
          }
        }
      }

      // All providers failed
      this.updateStats({ embeddings: [], tokensUsed: 0, cost: 0, provider: this.currentProvider, model: '' }, Date.now() - startTime, false)
      throw new Error(`All embedding providers failed. Last error: ${error.message}`)
    }
  }

  /**
   * Generate embeddings with a specific provider
   */
  private async generateWithProvider(texts: string[], providerName: string): Promise<EmbeddingResult> {
    const config = this.providerConfigs[providerName]
    const processedTexts = texts.map(text => this.truncateText(text, config.maxTokens))

    // Process in batches to respect rate limits
    const results: number[][] = []
    let totalTokens = 0

    for (let i = 0; i < processedTexts.length; i += config.batchSize) {
      const batch = processedTexts.slice(i, i + config.batchSize)
      const batchResult = await this.generateBatch(batch, providerName)

      results.push(...batchResult.embeddings)
      totalTokens += batchResult.tokensUsed

      // Rate limiting between batches
      if (i + config.batchSize < processedTexts.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
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
            const apiKey = configManager.getApiKey('openai') || process.env.OPENAI_API_KEY
            if (!apiKey) {
              throw new Error('OpenAI API key not found')
            }

            const openaiProvider = createOpenAI({ apiKey })
            const model = openaiProvider.embedding(config.model)

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
        case 'openrouter':
          {
            // Configure OpenRouter with API key from config or environment
            const apiKey = configManager.getApiKey('openrouter') || process.env.OPENROUTER_API_KEY
            if (!apiKey) {
              throw new Error('OpenRouter API key not found')
            }

            // OpenRouter uses OpenAI-compatible interface for embeddings
            const openrouterProvider = createOpenAI({
              apiKey,
              baseURL: 'https://openrouter.ai/api/v1'
            })
            const model = openrouterProvider.embedding(config.model)

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
        console.log(chalk.yellow(`⚠️ Rate limit reached for ${providerName}, waiting...`))
        await new Promise(resolve => setTimeout(resolve, 2000))
        // Retry once
        return this.generateBatch(texts, providerName)
      }

      throw new Error(`${providerName} embedding failed: ${error.message}`)
    }
  }

  /**
   * Truncate text to fit within token limits
   */
  private truncateText(text: string, maxTokens: number): string {
    const maxChars = maxTokens * 4 // Rough estimation: 1 token ≈ 4 characters
    if (text.length <= maxChars) return text

    return text.substring(0, maxChars - 50) + '\n[... content truncated ...]'
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
    this.stats.averageLatency = (this.stats.averageLatency * (this.stats.totalRequests - 1) + latency) / this.stats.totalRequests

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
      console.log(chalk.blue(`🔧 Switched to embedding provider: ${provider}`))
      return true
    }

    console.log(chalk.red(`❌ Provider ${provider} not available. Available: ${this.availableProviders.join(', ')}`))
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
    console.log(chalk.blue.bold('\n🤖 AI SDK Embedding Provider Status'))
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