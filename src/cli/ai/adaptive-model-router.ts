import type { CoreMessage } from 'ai'
import { universalTokenizer } from '../core/universal-tokenizer-service'
import { logger } from '../utils/logger'
import type { ChatMessage } from './model-provider'

let tokenizerInitialized = false
let tokenizerError: Error | null = null

// Safe initialization of tokenizer
try {
  // Test tokenizer availability
  if (universalTokenizer && typeof universalTokenizer.countMessagesTokens === 'function') {
    tokenizerInitialized = true
  } else {
    throw new Error('UniversalTokenizer not properly initialized')
  }
} catch (error) {
  tokenizerError = error instanceof Error ? error : new Error('Unknown tokenizer error')
  console.warn('Failed to initialize tokenizer:', tokenizerError.message)
}

export type ModelScope = 'chat_default' | 'planning' | 'code_gen' | 'tool_light' | 'tool_heavy' | 'vision'

export interface ModelRouteInput {
  provider: 'openai' | 'anthropic' | 'google' | 'ollama' | 'vercel' | 'gateway' | 'openrouter'
  baseModel: string // model id configured as current for provider
  messages: Array<Pick<ChatMessage, 'role' | 'content'>>
  scope?: ModelScope
  needsVision?: boolean
  sizeHints?: { fileCount?: number; totalBytes?: number }
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
    // Validate inputs
    if (!messages || !Array.isArray(messages)) {
      throw new Error('Messages must be a valid array')
    }

    if (messages.length === 0) {
      return { tokens: 0, method: 'fallback' }
    }

    if (!provider || typeof provider !== 'string') {
      throw new Error('Provider must be a valid string')
    }

    if (!model || typeof model !== 'string') {
      throw new Error('Model must be a valid string')
    }

    // Check if tokenizer is available
    if (!tokenizerInitialized || tokenizerError) {
      throw new Error(`Tokenizer not available: ${tokenizerError?.message || 'Unknown error'}`)
    }

    // Validate and clean messages
    const validMessages = messages.filter((m, index) => {
      if (!m || typeof m !== 'object') {
        console.warn(`Invalid message at index ${index}:`, m)
        return false
      }
      if (!m.role || !m.content) {
        console.warn(`Message missing role or content at index ${index}:`, m)
        return false
      }
      if (typeof m.content !== 'string') {
        console.warn(`Message content must be string at index ${index}:`, m)
        return false
      }
      return true
    })

    if (validMessages.length === 0) {
      throw new Error('No valid messages found')
    }

    // Convert to CoreMessage format for tokenizer
    const coreMessages: CoreMessage[] = validMessages.map((m) => ({
      role: m.role as any,
      content: m.content,
    }))

    // Use tokenizer with timeout protection
    const tokens = await Promise.race([
      universalTokenizer.countMessagesTokens(coreMessages, model, provider),
      new Promise<number>((_, reject) =>
        setTimeout(() => reject(new Error('Token counting timeout')), 10000)
      )
    ])

    if (typeof tokens !== 'number' || tokens < 0) {
      throw new Error(`Invalid token count: ${tokens}`)
    }

    return { tokens, method: 'precise' }

  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.warn('Precise token counting failed, using fallback', {
      error: errorMessage,
      provider,
      model,
      messageCount: messages?.length || 0,
    })

    // Fallback to improved character-based estimation
    try {
      const chars = messages.reduce((s, m) => s + (m?.content?.length || 0), 0)
      const tokens = Math.max(1, Math.round(chars / getCharTokenRatio(provider)))
      return { tokens, method: 'fallback' }
    } catch (fallbackError) {
      console.error('Fallback token estimation also failed:', fallbackError)
      return { tokens: 1, method: 'fallback' } // Last resort fallback
    }
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
  }

  return ratios[provider] || 4.0 // Default fallback
}

function pickOpenAI(baseModel: string, tier: 'light' | 'medium' | 'heavy', needsVision?: boolean): string {
  // Prefer GPT-5 family when base is gpt-5; otherwise fallback to 4o family
  const isGpt5 = /gpt-5/i.test(baseModel)
  if (needsVision) {
    // 4o family supports vision well; prefer 4o for vision tasks
    return 'gpt-4o'
  }
  if (isGpt5) {
    if (tier === 'heavy') return 'gpt-5'
    if (tier === 'medium') return 'gpt-5-mini-2025-08-07'
    return 'gpt-5-nano-2025-08-07'
  } else {
    if (tier === 'heavy') return 'gpt-4o'
    if (tier === 'medium') return 'gpt-4o-mini'
    // Light fallback — prefer mini; if not available, still use mini
    return 'gpt-4o-mini'
  }
}

function pickAnthropic(baseModel: string, tier: 'light' | 'medium' | 'heavy', needsVision?: boolean): string {
  // Claude-4 Opus/Sonnet-4/3.5 Sonnet present in defaults; Haiku may not be configured
  if (tier === 'heavy') return 'claude-sonnet-4-20250514'
  if (tier === 'medium') return 'claude-3-7-sonnet-20250219'
  return 'claude-3-5-sonnet-latest' // light fallback
}

function pickGoogle(_baseModel: string, tier: 'light' | 'medium' | 'heavy'): string {
  if (tier === 'heavy') return 'gemini-2.5-pro'
  if (tier === 'medium') return 'gemini-2.5-flash'
  return 'gemini-2.5-flash-lite'
}

function pickOpenRouter(baseModel: string, tier: 'light' | 'medium' | 'heavy', needsVision?: boolean): string {
  // Dynamic: Use the configured baseModel (already prefixed in config for OpenRouter)
  // No hardcoding - routes to any available model via OpenRouter
  // For vision, prefer vision-capable if baseModel indicates, but keep dynamic
  let selected = baseModel
  if (needsVision && baseModel.includes('claude-3-5-sonnet-latest')) {
    selected = baseModel // Keep if vision-capable
  }
  return selected // e.g., returns 'openrouter-claude-3-7-sonnet-20250219' directly
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
  /**
   * Choose optimal model with precise token counting
   */
  async choose(input: ModelRouteInput): Promise<ModelRouteDecision> {
    try {
      // Validate input
      if (!input) {
        throw new Error('ModelRouteInput is required')
      }

      if (!input.provider || typeof input.provider !== 'string') {
        throw new Error('Provider must be a valid string')
      }

      if (!input.baseModel || typeof input.baseModel !== 'string') {
        throw new Error('BaseModel must be a valid string')
      }

      if (!input.messages || !Array.isArray(input.messages)) {
        throw new Error('Messages must be a valid array')
      }

      // Filter and ensure messages have required properties
      const validMessages = input.messages
        .filter((m) => m && typeof m === 'object' && m.role && m.content)
        .map((m) => ({
          role: m.role!,
          content: m.content!,
        }))

      if (validMessages.length === 0) {
        throw new Error('At least one valid message is required')
      }

      // Get precise token count with error handling
      let tokens = 0
      let method: 'precise' | 'fallback' = 'fallback'

      try {
        const tokenResult = await estimateTokensPrecise(validMessages, input.provider, input.baseModel)
        tokens = tokenResult.tokens
        method = tokenResult.method
      } catch (tokenError) {
        console.warn('Token estimation failed, using fallback:', tokenError)
        // Use basic estimation as last resort
        const chars = validMessages.reduce((s, m) => s + (m.content?.length || 0), 0)
        tokens = Math.max(1, Math.round(chars / getCharTokenRatio(input.provider)))
      }

      // Determine tier with error handling
      let tier: 'light' | 'medium' | 'heavy' = 'medium'
      try {
        const lastUser = [...input.messages].reverse().find((m) => m.role === 'user')?.content || ''
        tier = determineTier(tokens, input.scope, lastUser)
      } catch (tierError) {
        console.warn('Tier determination failed, using medium:', tierError)
        tier = 'medium'
      }

      // Select model with error handling
      let selected = input.baseModel
      let reason = 'base model'

      try {
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
          case 'vercel':
          case 'gateway':
            selected = input.baseModel
            reason = `${input.provider} base (${method})`
            break
          case 'ollama':
            selected = input.baseModel
            reason = `ollama base (${method})`
            break
          default:
            throw new Error(`Unsupported provider: ${input.provider}`)
        }
      } catch (selectionError) {
        console.warn('Model selection failed, using base model:', selectionError)
        selected = input.baseModel
        reason = `fallback (${method})`
      }

      // Get model limits with error handling
      let limits = { context: 100000 } // Default fallback
      try {
        limits = universalTokenizer.getModelLimits(selected, input.provider)
        if (!limits.context || limits.context <= 0) {
          throw new Error('Invalid context limit')
        }
      } catch (limitsError) {
        console.warn('Could not get model limits, using defaults:', limitsError)
        limits = { context: 100000 }
      }

      const contextUsage = tokens / limits.context
      const confidence = method === 'precise' ? 0.95 : 0.7

      return {
        selectedModel: selected,
        tier,
        reason,
        estimatedTokens: tokens,
        actualTokens: method === 'precise' ? tokens : undefined,
        confidence,
        tokenizationMethod: method,
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('Model selection failed:', errorMessage)

      // Return safe fallback
      return {
        selectedModel: input?.baseModel || 'gpt-4o-mini',
        tier: 'medium',
        reason: 'error fallback',
        estimatedTokens: 1,
        confidence: 0.1,
        tokenizationMethod: 'fallback',
      }
    }
  }

  /**
   * Synchronous version for backwards compatibility
   * @deprecated Use async choose() method instead for precise counting
   */
  chooseFast(input: ModelRouteInput): ModelRouteDecision {
    try {
      // Validate input
      if (!input) {
        throw new Error('ModelRouteInput is required')
      }

      if (!input.provider || typeof input.provider !== 'string') {
        throw new Error('Provider must be a valid string')
      }

      if (!input.baseModel || typeof input.baseModel !== 'string') {
        throw new Error('BaseModel must be a valid string')
      }

      if (!input.messages || !Array.isArray(input.messages)) {
        throw new Error('Messages must be a valid array')
      }

      // Filter and ensure messages have required properties
      const validMessages = input.messages
        .filter((m) => m && typeof m === 'object' && m.role && m.content)
        .map((m) => ({
          content: m.content!,
        }))

      if (validMessages.length === 0) {
        throw new Error('At least one valid message is required')
      }

      // Estimate tokens with error handling
      let tokens = 1
      try {
        tokens = estimateTokens(validMessages)
      } catch (tokenError) {
        console.warn('Token estimation failed in chooseFast:', tokenError)
      }

      // Determine tier with error handling
      let tier: 'light' | 'medium' | 'heavy' = 'medium'
      try {
        const lastUser = [...input.messages].reverse().find((m) => m.role === 'user')?.content || ''
        tier = determineTier(tokens, input.scope, lastUser)
      } catch (tierError) {
        console.warn('Tier determination failed in chooseFast:', tierError)
      }

      // Select model with error handling
      let selected = input.baseModel
      let reason = 'base model'

      try {
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
          case 'vercel':
          case 'gateway':
            selected = input.baseModel
            reason = `${input.provider} base`
            break
          case 'ollama':
            selected = input.baseModel
            reason = 'ollama base'
            break
          default:
            throw new Error(`Unsupported provider: ${input.provider}`)
        }
      } catch (selectionError) {
        console.warn('Model selection failed in chooseFast:', selectionError)
        selected = input.baseModel
        reason = 'fallback'
      }

      return {
        selectedModel: selected,
        tier,
        reason,
        estimatedTokens: tokens,
        confidence: 0.7,
        tokenizationMethod: 'fallback',
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('chooseFast failed:', errorMessage)

      // Return safe fallback
      return {
        selectedModel: input?.baseModel || 'gpt-4o-mini',
        tier: 'medium',
        reason: 'error fallback',
        estimatedTokens: 1,
        confidence: 0.1,
        tokenizationMethod: 'fallback',
      }
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
    try {
      // Validate inputs
      if (!input) {
        throw new Error('ModelRouteInput is required')
      }

      if (!decision) {
        throw new Error('ModelRouteDecision is required')
      }

      if (!decision.selectedModel) {
        throw new Error('Decision must have a selected model')
      }

      // Get model limits with error handling
      let limits = { context: 100000 }
      try {
        limits = universalTokenizer.getModelLimits(decision.selectedModel, input.provider)
        if (!limits.context || limits.context <= 0) {
          throw new Error('Invalid context limit')
        }
      } catch (limitsError) {
        console.warn('Could not get model limits, using defaults:', limitsError)
        limits = { context: 100000 }
      }

      // Calculate token usage
      const tokenCount = decision.actualTokens || decision.estimatedTokens || 1
      const usagePercentage = (tokenCount / limits.context) * 100

      // Validate usage percentage
      const validUsagePercentage = isNaN(usagePercentage) || !isFinite(usagePercentage) ? 0 : usagePercentage

      // Get cost estimation with error handling
      let cost = { inputCost: 0 }
      try {
        cost = universalTokenizer.calculateCost(tokenCount, 0, decision.selectedModel)
        if (typeof cost.inputCost !== 'number' || isNaN(cost.inputCost)) {
          throw new Error('Invalid cost calculation')
        }
      } catch (costError) {
        console.warn('Could not calculate cost, using zero:', costError)
        cost = { inputCost: 0 }
      }

      return {
        inputTokens: tokenCount,
        contextLimit: limits.context,
        usagePercentage: Math.max(0, Math.min(100, validUsagePercentage)),
        estimatedCost: cost.inputCost,
        recommendedTier: decision.tier || 'medium',
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('getTokenUsageInfo failed:', errorMessage)

      // Return safe defaults
      return {
        inputTokens: 1,
        contextLimit: 100000,
        usagePercentage: 0,
        estimatedCost: 0,
        recommendedTier: 'medium',
      }
    }
  }
}

// Create singleton instance with error handling
let adaptiveModelRouterInstance: AdaptiveModelRouter | null = null
let routerInitializationError: Error | null = null

try {
  adaptiveModelRouterInstance = new AdaptiveModelRouter()
} catch (error) {
  routerInitializationError = error instanceof Error ? error : new Error('Unknown router initialization error')
  console.error('Failed to initialize AdaptiveModelRouter:', routerInitializationError.message)
}

export const adaptiveModelRouter = adaptiveModelRouterInstance || new AdaptiveModelRouter()
