import type { CoreMessage } from 'ai'
import crypto from 'node:crypto'
import { universalTokenizer } from '../core/universal-tokenizer-service'
import { structuredLogger } from '../utils/structured-logger'
import type { ChatMessage } from './model-provider'

export type ModelScope = 'chat_default' | 'planning' | 'code_gen' | 'tool_light' | 'tool_heavy' | 'vision'

export interface ModelRouteInput {
  provider: 'openai' | 'anthropic' | 'google' | 'ollama' | 'vercel' | 'gateway' | 'openrouter' | 'groq' | 'cerebras'
  baseModel: string // model id configured as current for provider
  messages: Array<Pick<ChatMessage, 'role' | 'content'>>
  scope?: ModelScope
  needsVision?: boolean
  sizeHints?: { fileCount?: number; totalBytes?: number }
}

/**
 * Performance metrics for intelligent fallback
 */
interface ModelPerformanceMetrics {
  consecutiveFailures: number
  totalFailures: number
  totalSuccesses: number
  lastFailure?: Date
}

/**
 * Safe fallback models per provider (reliable models for emergency use)
 */
const SAFE_FALLBACK_MODELS: Record<string, string> = {
  openrouter: 'openai/gpt-5', // GPT-5 as safe fallback
  openai: 'gpt-5',
  anthropic: 'claude-3-5-sonnet-latest',
  google: 'gemini-2.5-flash',
}

export interface ModelRouteDecision {
  selectedModel: string
  tier: 'light' | 'medium' | 'heavy'
  reason: string
  estimatedTokens: number
  actualTokens?: number // Precise token count when available
  confidence: number // 0..1
  tokenizationMethod: 'precise' | 'fallback' // Indicates counting method used
}

/**
 * Precise token counting using UniversalTokenizerService
 * Falls back to character estimation if tokenizer fails
 */
async function estimateTokensPrecise(
  messages: Array<{ role: string; content: string }>,
  provider: string,
  model: string
): Promise<{ tokens: number; method: 'precise' | 'fallback' }> {
  try {
    // Convert to CoreMessage format for tokenizer
    const coreMessages: CoreMessage[] = messages.map((m) => ({
      role: m.role as any,
      content: m.content,
    }))

    const tokens = await universalTokenizer.countMessagesTokens(coreMessages, model, provider)
    return { tokens, method: 'precise' }
  } catch (error: any) {
    structuredLogger.warning(
      'Precise token counting failed, using fallback',
      JSON.stringify({
        error: error.message,
        provider,
        model,
      })
    )

    // Fallback to improved character-based estimation
    const chars = messages.reduce((s, m) => s + (m.content?.length || 0), 0)
    const tokens = Math.max(1, Math.round(chars / getCharTokenRatio(provider)))
    return { tokens, method: 'fallback' }
  }
}

/**
 * Legacy function for backwards compatibility
 * @deprecated Use estimateTokensPrecise instead
 */
function estimateTokens(messages: Array<{ content: string }>): number {
  const chars = messages.reduce((s, m) => s + (m.content?.length || 0), 0)
  return Math.max(1, Math.round(chars / 4))
}

/**
 * Get character-to-token ratio for different providers
 */
function getCharTokenRatio(provider: string): number {
  const ratios: Record<string, number> = {
    openai: 3.5, // GPT models are more efficient
    anthropic: 3.8, // Claude models
    google: 4.2, // Gemini is efficient
    ollama: 3.5, // Similar to GPT
    vercel: 3.7, // Mixed models
    gateway: 3.7, // Mixed models
    openrouter: 3.7, // Mixed models
    groq: 3.5, // Llama-based models, similar to GPT
    cerebras: 4.0, // GLM and mixed models
  }

  return ratios[provider] || 4.0 // Default fallback
}



function pickAnthropic(_baseModel: string, tier: 'light' | 'medium' | 'heavy', _needsVision?: boolean): string {
  // Claude-4 Opus/Sonnet-4/3.5 Sonnet present in defaults; Haiku may not be configured
  if (tier === 'heavy') return 'claude-sonnet-4-20250514'
  if (tier === 'medium') return 'claude-3-7-sonnet-20250219'
  return 'claude-3-5-sonnet-latest' // light fallback
}

function pickOpenAI(baseModel: string, tier: 'light' | 'medium' | 'heavy', _needsVision?: boolean): string {
  // Use the configured OpenAI model as base, or intelligent tier-based selection
  if (baseModel.startsWith('gpt-')) {
    return baseModel // Use configured model directly
  }

  // Fallback tier-based selection for OpenAI
  if (tier === 'heavy') return 'gpt-5'
  if (tier === 'medium') return 'gpt-5-mini'
  return 'gpt-5' // light fallback
}

function pickGoogle(_baseModel: string, tier: 'light' | 'medium' | 'heavy'): string {
  if (tier === 'heavy') return 'gemini-2.5-pro'
  if (tier === 'medium') return 'gemini-2.5-flash'
  return 'gemini-2.5-flash-lite'
}

function pickOpenRouter(baseModel: string, _tier: 'light' | 'medium' | 'heavy', needsVision?: boolean): string {
  // Dynamic: Use the configured baseModel (already prefixed in config for OpenRouter)
  // No hardcoding - routes to any available model via OpenRouter
  // For vision, prefer vision-capable if baseModel indicates, but keep dynamic
  let selected = baseModel
  if (needsVision && baseModel.includes('@preset/nikcli')) {
    selected = baseModel // Keep if vision-capable
  }
  return selected // e.g., returns 'openrouter-claude-3-7-sonnet-20250219' directly
}

function pickGroq(baseModel: string, _tier: 'light' | 'medium' | 'heavy', _needsVision?: boolean): string {
  // Groq: Use configured baseModel directly (e.g., 'llama-3.1-8b-instant', 'meta-llama/llama-4-maverick-17b-128e-instruct')
  // No tier-based switching - Groq models are already optimized for ultra-fast inference
  return baseModel
}

function pickCerebras(baseModel: string, _tier: 'light' | 'medium' | 'heavy', _needsVision?: boolean): string {
  // Cerebras: Use configured baseModel directly (e.g., 'zai-glm-4.6', 'llama-3.3-70b')
  // No tier-based switching - Cerebras models are already optimized for high-speed inference
  return baseModel
}

function determineTier(tokens: number, scope?: ModelScope, content?: string): 'light' | 'medium' | 'heavy' {
  // Scope shortcuts override
  if (scope === 'tool_light') return 'light'
  if (scope === 'tool_heavy' || scope === 'planning' || scope === 'code_gen') return 'heavy'
  if (scope === 'vision') return tokens > 2000 ? 'heavy' : tokens > 800 ? 'medium' : 'light'

  // Keyword hints
  const text = (content || '').toLowerCase()
  const heavyHints = [
    'analizza la repository',
    'analyze the repository',
    'execution plan',
    'generate plan',
    'create project',
    'multi-file',
    'end-to-end',
  ]
  if (heavyHints.some((k) => text.includes(k))) return 'heavy'

  // Token thresholds
  if (tokens > 4000) return 'heavy'
  if (tokens > 800) return 'medium'
  return 'light'
}

export class AdaptiveModelRouter {
  private performanceMetrics: Map<string, ModelPerformanceMetrics> = new Map()
  private readonly FAILURE_THRESHOLD = 3 // Switch to fallback after 3 consecutive failures
  private readonly CONTEXT_WARNING_THRESHOLD = 0.8 // Warn when using >80% of context

  // Token counting memoization cache with TTL (1 hour)
  private tokenCountCache: Map<
    string,
    {
      tokens: number
      method: 'precise' | 'fallback'
      timestamp: number
    }
  > = new Map()
  private readonly TOKEN_CACHE_TTL = 3600000 // 1 hour

  /**
   * Generate cache key for token count memoization
   */
  private generateTokenCacheKey(
    messages: Array<{ role: string; content: string }>,
    provider: string,
    model: string
  ): string {
    const messageHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(messages))
      .digest('hex')
    return `${provider}:${model}:${messageHash}`
  }

  /**
   * Get token count with memoization (1 hour TTL)
   */
  private async getTokenCountMemoized(
    messages: Array<{ role: string; content: string }>,
    provider: string,
    model: string
  ): Promise<{ tokens: number; method: 'precise' | 'fallback' }> {
    const cacheKey = this.generateTokenCacheKey(messages, provider, model)

    // Check cache
    const cached = this.tokenCountCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < this.TOKEN_CACHE_TTL) {
      return {
        tokens: cached.tokens,
        method: cached.method,
      }
    }

    // Fetch and cache
    const result = await estimateTokensPrecise(messages, provider, model)
    this.tokenCountCache.set(cacheKey, {
      ...result,
      timestamp: Date.now(),
    })

    return result
  }

  /**
   * Choose optimal model with precise token counting and intelligent fallback
   */
  async choose(input: ModelRouteInput): Promise<ModelRouteDecision> {
    // Filter and ensure messages have required properties
    const validMessages = input.messages
      .filter((m) => m.role && m.content)
      .map((m) => ({
        role: m.role!,
        content: m.content!,
      }))

    // Get precise token count with memoization
    const { tokens, method } = await this.getTokenCountMemoized(
      validMessages,
      input.provider,
      input.baseModel
    )

    const lastUser = [...input.messages].reverse().find((m) => m.role === 'user')?.content || ''
    const tier = determineTier(tokens, input.scope, lastUser)

    let selected = input.baseModel
    let reason = 'base model'

    switch (input.provider) {
      case 'openai':
        selected = pickOpenAI(input.baseModel, tier, input.needsVision)
        reason = `openai ${tier} (${method})`
        break
      case 'anthropic':
        selected = pickAnthropic(input.baseModel, tier, input.needsVision)
        reason = `anthropic ${tier} (${method})`
        break
      case 'google':
        selected = pickGoogle(input.baseModel, tier)
        reason = `google ${tier} (${method})`
        break
      case 'openrouter':
        selected = pickOpenRouter(input.baseModel, tier, input.needsVision)
        reason = `openrouter ${tier} (${method})`
        break
      case 'groq':
        selected = pickGroq(input.baseModel, tier, input.needsVision)
        reason = `groq ${tier} (${method})`
        break
      case 'cerebras':
        selected = pickCerebras(input.baseModel, tier, input.needsVision)
        reason = `cerebras ${tier} (${method})`
        break
      case 'vercel':
      case 'gateway':
        // Default: keep base model (gateways often wrap specific ids)
        selected = input.baseModel
        reason = `${input.provider} base (${method})`
        break
      case 'ollama':
        selected = input.baseModel // keep local model selection
        reason = `ollama base (${method})`
        break
    }

    // Get model limits for additional context
    const limits = universalTokenizer.getModelLimits(selected, input.provider)
    const contextUsage = tokens / limits.context

    // Context usage warning
    if (contextUsage > this.CONTEXT_WARNING_THRESHOLD) {
      structuredLogger.warning(
        `High context usage: ${Math.round(contextUsage * 100)}%`,
        JSON.stringify({
          model: selected,
          tokens,
          contextLimit: limits.context,
          tier,
        })
      )
    }

    // Check for consecutive failures and use safe fallback if needed
    const metrics = this.getMetrics(input.baseModel)
    if (metrics.consecutiveFailures >= this.FAILURE_THRESHOLD && input.provider in SAFE_FALLBACK_MODELS) {
      const fallbackModel = SAFE_FALLBACK_MODELS[input.provider]
      structuredLogger.warning(
        `Model ${input.baseModel} has ${metrics.consecutiveFailures} consecutive failures, using safe fallback`,
        JSON.stringify({
          originalModel: selected,
          fallbackModel,
          failures: metrics.consecutiveFailures,
        })
      )
      selected = fallbackModel || selected
      reason = `${reason} (fallback due to failures)`
    }

    return {
      selectedModel: selected,
      tier,
      reason,
      estimatedTokens: tokens,
      actualTokens: method === 'precise' ? tokens : undefined,
      confidence: method === 'precise' ? 0.95 : 0.7,
      tokenizationMethod: method,
    }
  }

  /**
   * Synchronous version for backwards compatibility
   * @deprecated Use async choose() method instead for precise counting
   */
  chooseFast(input: ModelRouteInput): ModelRouteDecision {
    // Filter and ensure messages have required properties
    const validMessages = input.messages
      .filter((m) => m.role && m.content)
      .map((m) => ({
        content: m.content!,
      }))

    const tokens = estimateTokens(validMessages)
    const lastUser = [...input.messages].reverse().find((m) => m.role === 'user')?.content || ''
    const tier = determineTier(tokens, input.scope, lastUser)

    let selected = input.baseModel
    let reason = 'base model'

    switch (input.provider) {
      case 'openai':
        selected = pickOpenAI(input.baseModel, tier, input.needsVision)
        reason = `openai ${tier}`
        break
      case 'anthropic':
        selected = pickAnthropic(input.baseModel, tier, input.needsVision)
        reason = `anthropic ${tier}`
        break
      case 'google':
        selected = pickGoogle(input.baseModel, tier)
        reason = `google ${tier}`
        break
      case 'openrouter':
        selected = pickOpenRouter(input.baseModel, tier, input.needsVision)
        reason = `openrouter ${tier}`
        break
      case 'groq':
        selected = pickGroq(input.baseModel, tier, input.needsVision)
        reason = `groq ${tier}`
        break
      case 'cerebras':
        selected = pickCerebras(input.baseModel, tier, input.needsVision)
        reason = `cerebras ${tier}`
        break
      case 'vercel':
      case 'gateway':
        selected = input.baseModel
        reason = `${input.provider} base`
        break
      case 'ollama':
        selected = input.baseModel
        reason = 'ollama base'
        break
    }

    return {
      selectedModel: selected,
      tier,
      reason,
      estimatedTokens: tokens,
      confidence: 0.7,
      tokenizationMethod: 'fallback',
    }
  }

  /**
   * Get token usage statistics for a model decision
   */
  async getTokenUsageInfo(
    input: ModelRouteInput,
    decision: ModelRouteDecision
  ): Promise<{
    inputTokens: number
    contextLimit: number
    usagePercentage: number
    estimatedCost: number
    recommendedTier: 'light' | 'medium' | 'heavy'
  }> {
    const limits = universalTokenizer.getModelLimits(decision.selectedModel, input.provider)
    const usagePercentage = ((decision.actualTokens || decision.estimatedTokens) / limits.context) * 100

    // Get cost estimation (assuming 0 output tokens for input analysis)
    const cost = universalTokenizer.calculateCost(
      decision.actualTokens || decision.estimatedTokens,
      0,
      decision.selectedModel
    )

    return {
      inputTokens: decision.actualTokens || decision.estimatedTokens,
      contextLimit: limits.context,
      usagePercentage,
      estimatedCost: cost.inputCost,
      recommendedTier: decision.tier,
    }
  }

  /**
   * Record model success (resets consecutive failures)
   */
  recordSuccess(modelKey: string): void {
    const metrics = this.getMetrics(modelKey)
    metrics.consecutiveFailures = 0
    metrics.totalSuccesses++
    this.performanceMetrics.set(modelKey, metrics)
  }

  /**
   * Record model failure (increments consecutive failures)
   */
  recordFailure(modelKey: string): void {
    const metrics = this.getMetrics(modelKey)
    metrics.consecutiveFailures++
    metrics.totalFailures++
    metrics.lastFailure = new Date()
    this.performanceMetrics.set(modelKey, metrics)

    if (metrics.consecutiveFailures >= this.FAILURE_THRESHOLD) {
      structuredLogger.error(
        `Model ${modelKey} reached failure threshold (${metrics.consecutiveFailures} consecutive failures)`,
        JSON.stringify({
          totalFailures: metrics.totalFailures,
          totalSuccesses: metrics.totalSuccesses,
          lastFailure: metrics.lastFailure,
        })
      )
    }
  }

  /**
   * Get performance metrics for a model
   */
  getMetrics(modelKey: string): ModelPerformanceMetrics {
    if (!this.performanceMetrics.has(modelKey)) {
      this.performanceMetrics.set(modelKey, {
        consecutiveFailures: 0,
        totalFailures: 0,
        totalSuccesses: 0,
      })
    }
    return this.performanceMetrics.get(modelKey)!
  }

  /**
   * Get model health status
   */
  getModelHealth(modelKey: string): {
    status: 'healthy' | 'degraded' | 'failing'
    consecutiveFailures: number
    successRate: number
  } {
    const metrics = this.getMetrics(modelKey)
    const total = metrics.totalFailures + metrics.totalSuccesses
    const successRate = total > 0 ? metrics.totalSuccesses / total : 1.0

    let status: 'healthy' | 'degraded' | 'failing'
    if (metrics.consecutiveFailures >= this.FAILURE_THRESHOLD) {
      status = 'failing'
    } else if (metrics.consecutiveFailures > 0 || successRate < 0.8) {
      status = 'degraded'
    } else {
      status = 'healthy'
    }

    return {
      status,
      consecutiveFailures: metrics.consecutiveFailures,
      successRate,
    }
  }

  /**
   * Reset metrics for a model (useful after recovery)
   */
  resetMetrics(modelKey: string): void {
    this.performanceMetrics.delete(modelKey)
  }
}

export const adaptiveModelRouter = new AdaptiveModelRouter()
