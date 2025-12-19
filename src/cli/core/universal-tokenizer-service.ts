import { EventEmitter } from 'node:events'
import { countTokens as anthropicCountTokens } from '@anthropic-ai/tokenizer'
import type { CoreMessage } from 'ai'
import { encode } from 'gpt-tokenizer'
import { encodingForModel } from 'js-tiktoken'
import { MODEL_COSTS } from '../config/token-limits'
import { structuredLogger } from '../utils/structured-logger'

/**
 * Extract text content from complex content types
 */
function extractTextContent(content: any): string {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part?.text) return part.text
        if (part?.type === 'text' && part?.text) return part.text
        return ''
      })
      .join('')
  }

  if (content?.text) {
    return content.text
  }

  return JSON.stringify(content)
}

export interface TokenizerAdapter {
  countTokens(text: string, model: string): Promise<number>
  countMessagesTokens(messages: CoreMessage[], model: string): Promise<number>
  getModelLimits(model: string): { context: number; output: number }
  getEncoding?(model: string): string
}

export interface UniversalTokenizerOptions {
  enableCache?: boolean
  cacheSize?: number
  fallbackEnabled?: boolean
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCost: number
  model: string
  provider: string
}

export interface ModelLimits {
  context: number
  output: number
  provider: string
}

/**
 * OpenAI/GPT Tokenizer Adapter using gpt-tokenizer (fastest 2025)
 */
class GPTTokenizerAdapter implements TokenizerAdapter {
  async countTokens(text: string, model: string): Promise<number> {
    try {
      const encoding = this.getEncodingForModel(model)

      if (encoding === 'o200k_base') {
        // GPT-5 family - use gpt-tokenizer
        return encode(text).length
      } else {
        // GPT-4 family - use gpt-tokenizer
        return encode(text).length
      }
    } catch (error: any) {
      structuredLogger.warning(
        'GPT tokenizer failed, using fallback estimation',
        JSON.stringify({ error: error.message })
      )
      return this.fallbackTokenCount(text)
    }
  }

  async countMessagesTokens(messages: CoreMessage[], model: string): Promise<number> {
    let totalTokens = 0

    for (const message of messages) {
      // Base token count for message content
      totalTokens += await this.countTokens(extractTextContent(message.content), model)

      // Add overhead for message structure (role, formatting)
      totalTokens += 4 // Typical overhead per message
    }

    // Add conversation overhead
    totalTokens += 2

    return totalTokens
  }

  getModelLimits(model: string): { context: number; output: number } {
    const limits: Record<string, { context: number; output: number }> = {
      'gpt-5': { context: 200000, output: 8192 },
      'gpt-5-mini-2025-08-07': { context: 128000, output: 4096 },
      'gpt-5-nano-2025-08-07': { context: 32000, output: 2048 },
      'gpt-4o': { context: 128000, output: 8192 },
      'gpt-4.1': { context: 64000, output: 4096 },
      'gpt-4o-mini': { context: 128000, output: 4096 },
      'gpt-4.1-mini': { context: 64000, output: 2048 },
      'gpt-4.1-nano': { context: 32000, output: 1024 },
    }

    return limits[model] || { context: 128000, output: 4096 }
  }

  getEncodingForModel(model: string): string {
    if (model.includes('gpt-5')) return 'o200k_base'
    if (model.includes('gpt-4')) return 'cl100k_base'
    return 'cl100k_base'
  }

  private fallbackTokenCount(text: string): number {
    return Math.ceil(text.length / 3.5) // More accurate than /4 for GPT models
  }
}

/**
 * Anthropic/Claude Tokenizer Adapter with hybrid approach
 */
class AnthropicTokenizerAdapter implements TokenizerAdapter {
  async countTokens(text: string, model: string): Promise<number> {
    try {
      if (this.isLegacyModel(model)) {
        // Use official tokenizer for Claude 2.x and earlier
        return anthropicCountTokens(text)
      } else {
        // Enhanced estimation for Claude 3+ and Sonnet 4
        return this.estimateClaudeTokens(text, model)
      }
    } catch (error: any) {
      structuredLogger.warning(
        'Anthropic tokenizer failed, using fallback estimation',
        JSON.stringify({ error: error.message })
      )
      return this.fallbackTokenCount(text)
    }
  }

  async countMessagesTokens(messages: CoreMessage[], model: string): Promise<number> {
    let totalTokens = 0

    for (const message of messages) {
      totalTokens += await this.countTokens(extractTextContent(message.content), model)
      // Claude message overhead
      totalTokens += 3
    }

    return totalTokens + 1 // Conversation start token
  }

  getModelLimits(model: string): { context: number; output: number } {
    const limits: Record<string, { context: number; output: number }> = {
      'claude-sonnet-4-20250514': { context: 200000, output: 8192 },
      'claude-3-7-sonnet-20250219': { context: 200000, output: 8192 },
      'claude-3-5-sonnet-latest': { context: 200000, output: 8192 },
      'claude-3-5-sonnet-20241022': { context: 200000, output: 8192 },
      'claude-3-opus-20240229': { context: 200000, output: 4096 },
      'claude-3-sonnet-20240229': { context: 200000, output: 4096 },
      'claude-3-haiku-20240307': { context: 200000, output: 4096 },
      'claude-3-5-haiku': { context: 200000, output: 8192 },
    }

    return limits[model] || { context: 200000, output: 4096 }
  }

  private isLegacyModel(model: string): boolean {
    return model.includes('claude-2') || model.includes('claude-instant')
  }

  private estimateClaudeTokens(text: string, model: string): number {
    // Enhanced estimation algorithm for Claude 3+ models
    const baseTokens = Math.ceil(text.length / 3.8) // More accurate than /4

    // Apply model-specific adjustments
    let multiplier = 1.0
    if (model.includes('claude-sonnet-4')) {
      multiplier = 1.05 // Sonnet 4 has slightly different tokenization
    } else if (model.includes('claude-3-5')) {
      multiplier = 1.02 // Claude 3.5 refinements
    }

    // Complexity analysis
    const complexity = this.analyzeTextComplexity(text)

    return Math.round(baseTokens * multiplier * complexity)
  }

  private analyzeTextComplexity(text: string): number {
    let complexity = 1.0

    // Code detection
    if (text.includes('```') || text.includes('function') || text.includes('class')) {
      complexity *= 1.1
    }

    // Mathematical content
    if (text.match(/[∑∏∫∂∆∇]/g) || text.includes('equation')) {
      complexity *= 1.05
    }

    // Special characters and symbols
    const specialChars = text.match(/[^\w\s.,;:!?]/g)?.length || 0
    if (specialChars > text.length * 0.1) {
      complexity *= 1.08
    }

    return Math.min(complexity, 1.2) // Cap at 20% increase
  }

  private fallbackTokenCount(text: string): number {
    return Math.ceil(text.length / 3.8)
  }
}

/**
 * Google/Gemini Tokenizer Adapter with enhanced estimation
 */
class GeminiTokenizerAdapter implements TokenizerAdapter {
  async countTokens(text: string, model: string): Promise<number> {
    // Gemini tokenization estimation based on observed patterns
    return this.estimateGeminiTokens(text, model)
  }

  async countMessagesTokens(messages: CoreMessage[], model: string): Promise<number> {
    let totalTokens = 0

    for (const message of messages) {
      totalTokens += await this.countTokens(extractTextContent(message.content), model)
      // Gemini message formatting overhead
      totalTokens += 2
    }

    return totalTokens
  }

  getModelLimits(model: string): { context: number; output: number } {
    const limits: Record<string, { context: number; output: number }> = {
      'gemini-2.5-pro': { context: 2000000, output: 8192 },
      'gemini-2.5-pro-200k': { context: 200000, output: 8192 },
      'gemini-2.5-flash': { context: 1000000, output: 4096 },
      'gemini-2.5-flash-lite': { context: 100000, output: 2048 },
      'gemini-2.0-flash': { context: 1000000, output: 8192 },
      'gemini-1.5-pro': { context: 2000000, output: 8192 },
      'gemini-1.5-flash': { context: 1000000, output: 4096 },
    }

    return limits[model] || { context: 1000000, output: 4096 }
  }

  private estimateGeminiTokens(text: string, model: string): number {
    // Gemini tokenization tends to be more efficient
    let baseTokens = Math.ceil(text.length / 4.2)

    // Model-specific adjustments
    if (model.includes('gemini-2.5')) {
      baseTokens *= 0.95 // 2.5 is more efficient
    }

    return baseTokens
  }
}

/**
 * Ollama Local Models Tokenizer Adapter
 */
class OllamaTokenizerAdapter implements TokenizerAdapter {
  async countTokens(text: string, model: string): Promise<number> {
    try {
      // Use tiktoken with appropriate encoding based on base model
      const encoding = this.getEncodingForOllamaModel(model)
      const encoder = encodingForModel(encoding as any)
      return encoder.encode(text).length
    } catch (error: any) {
      structuredLogger.warning('Ollama tokenizer failed, using fallback', JSON.stringify({ error: error.message }))
      return this.fallbackTokenCount(text, model)
    }
  }

  async countMessagesTokens(messages: CoreMessage[], model: string): Promise<number> {
    let totalTokens = 0

    for (const message of messages) {
      totalTokens += await this.countTokens(extractTextContent(message.content), model)
      totalTokens += 3 // Message overhead
    }

    return totalTokens
  }

  getModelLimits(model: string): { context: number; output: number } {
    const limits: Record<string, { context: number; output: number }> = {
      'llama3.1:8b': { context: 128000, output: 4096 },
      'codellama:7b': { context: 16000, output: 2048 },
      'deepseek-r1:8b': { context: 32000, output: 4096 },
      'deepseek-r1:3b': { context: 32000, output: 2048 },
      'deepseek-r1:7b': { context: 32000, output: 4096 },
      'mistral:7b': { context: 32000, output: 2048 },
    }

    return limits[model] || { context: 32000, output: 2048 }
  }

  private getEncodingForOllamaModel(model: string): string {
    if (model.includes('llama') || model.includes('codellama')) {
      return 'cl100k_base' // Llama models are similar to GPT-4
    }
    if (model.includes('deepseek')) {
      return 'cl100k_base' // DeepSeek uses similar tokenization
    }
    return 'cl100k_base' // Default fallback
  }

  private fallbackTokenCount(text: string, model: string): number {
    // Different models have different tokenization efficiency
    let divisor = 4.0

    if (model.includes('codellama')) {
      divisor = 3.5 // Code models are more token-dense
    } else if (model.includes('deepseek')) {
      divisor = 4.1 // DeepSeek is efficient
    }

    return Math.ceil(text.length / divisor)
  }
}

/**
 * Dynamic Tokenizer Adapter for Gateway/Vercel/OpenRouter
 */
class DynamicTokenizerAdapter implements TokenizerAdapter {
  private adapters: Map<string, TokenizerAdapter> = new Map()

  constructor() {
    this.adapters.set('openai', new GPTTokenizerAdapter())
    this.adapters.set('anthropic', new AnthropicTokenizerAdapter())
    this.adapters.set('google', new GeminiTokenizerAdapter())
  }

  async countTokens(text: string, model: string): Promise<number> {
    const provider = this.detectProviderFromModel(model)
    const adapter = this.adapters.get(provider)

    if (adapter) {
      return await adapter.countTokens(text, model)
    }

    // Fallback estimation
    return this.fallbackTokenCount(text)
  }

  async countMessagesTokens(messages: CoreMessage[], model: string): Promise<number> {
    const provider = this.detectProviderFromModel(model)
    const adapter = this.adapters.get(provider)

    if (adapter) {
      return await adapter.countMessagesTokens(messages, model)
    }

    // Fallback
    let totalTokens = 0
    for (const message of messages) {
      totalTokens += await this.countTokens(extractTextContent(message.content), model)
      totalTokens += 3
    }
    return totalTokens
  }

  getModelLimits(model: string): { context: number; output: number } {
    const provider = this.detectProviderFromModel(model)
    const adapter = this.adapters.get(provider)

    if (adapter) {
      return adapter.getModelLimits(model)
    }

    return { context: 128000, output: 4096 } // Safe default
  }

  private detectProviderFromModel(model: string): string {
    if (model.includes('gpt') || model.includes('openai')) return 'openai'
    if (model.includes('claude') || model.includes('anthropic')) return 'anthropic'
    if (model.includes('gemini') || model.includes('google')) return 'google'
    return 'openai' // Default fallback
  }

  private fallbackTokenCount(text: string): number {
    return Math.ceil(text.length / 4)
  }
}

/**
 * Universal Tokenizer Service - Main Entry Point
 */
export class UniversalTokenizerService extends EventEmitter {
  private adapters: Map<string, TokenizerAdapter> = new Map()
  private cache: Map<string, number> = new Map()
  private options: UniversalTokenizerOptions

  constructor(options: UniversalTokenizerOptions = {}) {
    super()

    this.options = {
      enableCache: true,
      cacheSize: 1000,
      fallbackEnabled: true,
      ...options,
    }

    this.initializeAdapters()
  }

  private initializeAdapters(): void {
    this.adapters.set('openai', new GPTTokenizerAdapter())
    this.adapters.set('anthropic', new AnthropicTokenizerAdapter())
    this.adapters.set('google', new GeminiTokenizerAdapter())
    this.adapters.set('ollama', new OllamaTokenizerAdapter())
    this.adapters.set('gateway', new DynamicTokenizerAdapter())
    this.adapters.set('vercel', new DynamicTokenizerAdapter())
    this.adapters.set('openrouter', new DynamicTokenizerAdapter())
    this.adapters.set('groq', new DynamicTokenizerAdapter())
    this.adapters.set('cerebras', new DynamicTokenizerAdapter())
    this.adapters.set('opencode', new DynamicTokenizerAdapter())

  }

  /**
   * Count tokens for a text string with specific model and provider
   */
  async countTokens(text: string, model: string, provider: string = 'openai'): Promise<number> {
    const cacheKey = this.getCacheKey(text, model, provider)

    // Check cache first
    if (this.options.enableCache && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!
    }

    try {
      const adapter = this.getAdapter(provider)
      const tokenCount = await adapter.countTokens(text, model)

      // Cache the result
      if (this.options.enableCache) {
        this.setCachedResult(cacheKey, tokenCount)
      }

      this.emit('token_count', { text: text.substring(0, 100), model, provider, tokens: tokenCount })
      return tokenCount
    } catch (error: any) {
      structuredLogger.error('Token counting failed', JSON.stringify({ error: error.message, model, provider }))

      if (this.options.fallbackEnabled) {
        const fallbackTokens = this.fallbackTokenCount(text)
        structuredLogger.warning('Using fallback token counting', JSON.stringify({ tokens: fallbackTokens }))
        return fallbackTokens
      }

      throw error
    }
  }

  /**
   * Count tokens for an array of messages
   */
  async countMessagesTokens(messages: CoreMessage[], model: string, provider: string = 'openai'): Promise<number> {
    try {
      const adapter = this.getAdapter(provider)
      const tokenCount = await adapter.countMessagesTokens(messages, model)

      this.emit('messages_token_count', { messageCount: messages.length, model, provider, tokens: tokenCount })
      return tokenCount
    } catch (error: any) {
      structuredLogger.error(
        'Messages token counting failed',
        JSON.stringify({ error: error.message, model, provider })
      )

      if (this.options.fallbackEnabled) {
        // Fallback: count each message individually and add overhead
        let totalTokens = 0
        for (const message of messages) {
          totalTokens += await this.countTokens(extractTextContent(message.content), model, provider)
        }
        return totalTokens + messages.length * 3 // Message overhead
      }

      throw error
    }
  }

  /**
   * Get model limits for context and output tokens
   */
  getModelLimits(model: string, provider: string = 'openai'): ModelLimits {
    const adapter = this.getAdapter(provider)
    const limits = adapter.getModelLimits(model)

    return {
      ...limits,
      provider,
    }
  }

  /**
   * Calculate cost estimation for token usage
   */
  calculateCost(
    inputTokens: number,
    outputTokens: number,
    model: string
  ): {
    inputCost: number
    outputCost: number
    totalCost: number
    model: string
  } {
    const pricing = MODEL_COSTS[model] || MODEL_COSTS.default

    const inputCost = (inputTokens / 1000000) * pricing.input
    const outputCost = (outputTokens / 1000000) * pricing.output
    const totalCost = inputCost + outputCost

    return {
      inputCost: Number(inputCost.toFixed(6)),
      outputCost: Number(outputCost.toFixed(6)),
      totalCost: Number(totalCost.toFixed(6)),
      model: pricing.displayName,
    }
  }

  /**
   * Get comprehensive token usage info
   */
  async getTokenUsage(
    messages: CoreMessage[],
    model: string,
    provider: string,
    estimatedOutputTokens: number = 0
  ): Promise<TokenUsage> {
    const promptTokens = await this.countMessagesTokens(messages, model, provider)
    const totalTokens = promptTokens + estimatedOutputTokens
    const cost = this.calculateCost(promptTokens, estimatedOutputTokens, model)

    return {
      promptTokens,
      completionTokens: estimatedOutputTokens,
      totalTokens,
      estimatedCost: cost.totalCost,
      model,
      provider,
    }
  }

  /**
   * Clear token counting cache
   */
  clearCache(): void {
    this.cache.clear()
    this.emit('cache_cleared')
    structuredLogger.info('Token counting cache cleared', 'Universal Tokenizer Service')
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size,
      hitRate: 0, // TODO: Track hit rate
    }
  }

  private getAdapter(provider: string): TokenizerAdapter {
    const adapter = this.adapters.get(provider.toLowerCase())
    if (!adapter) {
      structuredLogger.warning(
        `No tokenizer adapter for provider: ${provider}, using fallback`,
        JSON.stringify({
          provider,
        })
      )
      return this.adapters.get('openai')! // Fallback to OpenAI
    }
    return adapter
  }

  private getCacheKey(text: string, model: string, provider: string): string {
    const textHash = text.length > 100 ? text.substring(0, 50) + text.substring(text.length - 50) : text
    return `${provider}:${model}:${textHash.length}:${textHash.slice(0, 20)}`
  }

  private setCachedResult(cacheKey: string, tokenCount: number): void {
    if (this.cache.size >= this.options.cacheSize!) {
      // Remove oldest entries (simple LRU)
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
      }
    }

    this.cache.set(cacheKey, tokenCount)
  }

  private fallbackTokenCount(text: string): number {
    return Math.ceil(text.length / 4)
  }
}

// Singleton instance
export const universalTokenizer = new UniversalTokenizerService()
