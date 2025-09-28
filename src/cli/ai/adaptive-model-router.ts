import type { CoreMessage } from 'ai'
import { universalTokenizer } from '../core/universal-tokenizer-service'
import { structuredLogger } from '../utils/structured-logger'
import type { ChatMessage } from './model-provider'

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

function pickAnthropic(_baseModel: string, tier: 'light' | 'medium' | 'heavy', _needsVision?: boolean): string {
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

function pickOpenRouter(baseModel: string, _tier: 'light' | 'medium' | 'heavy', needsVision?: boolean): string {
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
    // Filter and ensure messages have required properties
    const validMessages = input.messages
      .filter((m) => m.role && m.content)
      .map((m) => ({
        role: m.role!,
        content: m.content!,
      }))

    // Get precise token count
    const { tokens, method } = await estimateTokensPrecise(validMessages, input.provider, input.baseModel)

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
    const _contextUsage = tokens / limits.context

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
}

export const adaptiveModelRouter = new AdaptiveModelRouter()
