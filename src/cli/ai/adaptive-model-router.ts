import * as crypto from 'node:crypto'
import type { CoreMessage } from 'ai'
import { simpleConfigManager } from '../core/config-manager'
import { universalTokenizer } from '../core/universal-tokenizer-service'
import { structuredLogger } from '../utils/structured-logger'
import type { ChatMessage } from './model-provider'
import { type OpenRouterModel, openRouterRegistry } from './openrouter-model-registry'
import { MODEL_ALIASES, resolveModelAlias } from './provider-registry'

export type ModelScope = 'chat_default' | 'planning' | 'code_gen' | 'tool_light' | 'tool_heavy' | 'vision'

/**
 * Routing strategy for model selection
 * - 'adaptive': NikCLI's intelligent tier-based routing (default)
 * - 'auto': Use OpenRouter's Auto Router (powered by NotDiamond)
 * - 'fallback': Use model fallback chain
 * - 'fixed': Use the exact model specified
 */
export type RoutingStrategy = 'adaptive' | 'auto' | 'fallback' | 'fixed'

export interface ModelRouteInput {
  provider:
    | 'openai'
    | 'anthropic'
    | 'google'
    | 'ollama'
    | 'vercel'
    | 'gateway'
    | 'openrouter'
    | 'groq'
    | 'cerebras'
    | 'openai-compatible'
  baseModel: string // model id configured as current for provider
  messages: Array<Pick<ChatMessage, 'role' | 'content'>>
  scope?: ModelScope
  needsVision?: boolean
  sizeHints?: { fileCount?: number; totalBytes?: number; toolCount?: number }
  /**
   * Routing strategy to use
   * @default 'adaptive'
   */
  strategy?: RoutingStrategy
  /**
   * Fallback models to try if primary model fails
   * Only used when strategy is 'fallback' or as emergency fallback
   * Reference: https://openrouter.ai/docs/guides/features/model-routing
   */
  fallbackModels?: string[]
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
 * Using cost-effective OpenRouter models as fallbacks
 * Updated: December 2025 with latest models
 */
const SAFE_FALLBACK_MODELS: Record<string, string> = {
  openrouter: 'minimax/minimax-m2', // MiniMax M2 as safe fallback (cost-effective, reliable)
  openai: 'gpt-5.1-chat', // GPT-5.1 Chat - fast, reliable
  anthropic: 'claude-haiku-4.5', // Claude Haiku 4.5 - fast, cost-effective
  google: 'gemini-2.5-flash', // Gemini 2.5 Flash - reliable
  groq: 'llama-3.1-8b-instant',
  cerebras: 'llama-3.3-70b',
}

/**
 * Fallback chains per provider for the 'models' parameter
 * Reference: https://openrouter.ai/docs/guides/features/model-routing
 * Using MiniMax M2 as reliable, cost-effective primary fallback
 * Updated: December 2025 with GPT-5.1, Claude 4.5, Gemini 3 models
 */
const FALLBACK_CHAINS: Record<string, Record<'light' | 'medium' | 'heavy', string[]>> = {
  openrouter: {
    light: [
      'minimax/minimax-m2', // Fast, cost-effective primary fallback
      'anthropic/claude-haiku-4.5', // Claude Haiku 4.5 - fast
      'openai/gpt-5.1-chat', // GPT-5.1 Chat - fast chat
    ],
    medium: [
      'minimax/minimax-m2',
      'anthropic/claude-sonnet-4.5', // Claude Sonnet 4.5 - 1M context
      'google/gemini-3-pro-preview', // Gemini 3 Pro - 1M context
    ],
    heavy: [
      'minimax/minimax-m2',
      'openai/gpt-5.1-codex', // GPT-5.1 Codex - coding optimized
      'anthropic/claude-opus-4.5', // Claude Opus 4.5 - frontier reasoning
      'google/gemini-3-pro-preview',
    ],
  },
}

/**
 * OpenRouter Auto Router model ID
 * Automatically selects the best model based on prompt content
 * Powered by NotDiamond: https://www.notdiamond.ai/
 */
const OPENROUTER_AUTO_MODEL = 'openrouter/auto'

/**
 * Pricing information for a model
 */
export interface ModelPricing {
  promptCostPer1M: number // Cost per 1M input tokens in USD
  completionCostPer1M: number // Cost per 1M output tokens in USD
  currency: 'USD'
}

export interface ModelRouteDecision {
  selectedModel: string
  tier: 'light' | 'medium' | 'heavy'
  reason: string
  estimatedTokens: number
  actualTokens?: number // Precise token count when available
  confidence: number // 0..1
  tokenizationMethod: 'precise' | 'fallback' // Indicates counting method used
  toolchainReserve?: number // Token riservati per toolchains
  /**
   * Strategy used for this routing decision
   */
  strategy: RoutingStrategy
  /**
   * Fallback models to try if primary fails
   * Can be passed to OpenRouter via 'models' parameter
   * Reference: https://openrouter.ai/docs/guides/features/model-routing
   */
  fallbackModels?: string[]
  /**
   * Whether this is using OpenRouter Auto Router
   */
  isAutoRouter?: boolean
  /**
   * Estimated cost for this request (in USD)
   * Based on estimatedTokens and model pricing
   */
  estimatedCost?: {
    inputCost: number
    estimatedOutputCost: number // Estimated assuming similar output length
    totalEstimatedCost: number
    pricing: ModelPricing
  }
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
    gateway: 3.8, // Mixed models
    openrouter: 3.7, // Mixed models
    groq: 3.5, // Llama-based models, similar to GPT
    cerebras: 4.0, // GLM and mixed models
    'openai-compatible': 3.7, // generic OpenAI-compatible endpoints
  }

  return ratios[provider] || 3.7 // Default fallback
}

/**
 * Get pricing for a model (per 1M tokens in USD)
 * Fetches from OpenRouter registry or uses fallback estimates
 * Reference: https://openrouter.ai/docs/guides/features/zero-completion-insurance
 */
async function getModelPricing(provider: string, model: string): Promise<ModelPricing> {
  // Try to get pricing from OpenRouter registry
  if (provider === 'openrouter') {
    try {
      const pricing = await openRouterRegistry.getModelPricing(model)
      if (pricing) {
        // OpenRouter pricing is per-token, convert to per-1M
        return {
          promptCostPer1M: pricing.prompt * 1000000 || 0,
          completionCostPer1M: pricing.completion * 1000000 || 0,
          currency: 'USD',
        }
      }
    } catch {
      // Fall through to defaults
    }
  }

  // Fallback pricing estimates (per 1M tokens in USD)
  const defaultPricing: Record<string, ModelPricing> = {
    // GPT-5.1 family
    'gpt-5.1': { promptCostPer1M: 1.25, completionCostPer1M: 10.0, currency: 'USD' },
    'gpt-5.1-chat': { promptCostPer1M: 0.5, completionCostPer1M: 2.0, currency: 'USD' },
    'gpt-5.1-codex': { promptCostPer1M: 1.25, completionCostPer1M: 10.0, currency: 'USD' },
    // Claude 4.5 family
    'claude-opus-4.5': { promptCostPer1M: 5.0, completionCostPer1M: 25.0, currency: 'USD' },
    'claude-sonnet-4.5': { promptCostPer1M: 3.0, completionCostPer1M: 15.0, currency: 'USD' },
    'claude-haiku-4.5': { promptCostPer1M: 1.0, completionCostPer1M: 5.0, currency: 'USD' },
    // Gemini 3 family
    'gemini-3-pro': { promptCostPer1M: 2.0, completionCostPer1M: 12.0, currency: 'USD' },
    'gemini-2.5-flash': { promptCostPer1M: 0.15, completionCostPer1M: 0.6, currency: 'USD' },
    // DeepSeek
    'deepseek-v3.2': { promptCostPer1M: 0.28, completionCostPer1M: 1.1, currency: 'USD' },
    // MiniMax M2 (cost-effective fallback)
    'minimax-m2': { promptCostPer1M: 0.15, completionCostPer1M: 0.6, currency: 'USD' },
  }

  // Extract model name from full path (e.g., 'openai/gpt-5.1' -> 'gpt-5.1')
  const modelName = model.includes('/') ? model.split('/').pop() || model : model

  return (
    defaultPricing[modelName] || {
      promptCostPer1M: 0.5, // Conservative default
      completionCostPer1M: 2.0,
      currency: 'USD',
    }
  )
}

/**
 * Calculate estimated cost for a request
 */
function calculateEstimatedCost(
  pricing: ModelPricing,
  inputTokens: number,
  estimatedOutputTokens?: number
): {
  inputCost: number
  estimatedOutputCost: number
  totalEstimatedCost: number
  pricing: ModelPricing
} {
  // If no output estimate provided, assume similar to input
  const outputTokens = estimatedOutputTokens || Math.min(inputTokens, 4000)

  const inputCost = (inputTokens / 1000000) * pricing.promptCostPer1M
  const estimatedOutputCost = (outputTokens / 1000000) * pricing.completionCostPer1M

  return {
    inputCost: Math.round(inputCost * 100000) / 100000, // Round to 5 decimal places
    estimatedOutputCost: Math.round(estimatedOutputCost * 100000) / 100000,
    totalEstimatedCost: Math.round((inputCost + estimatedOutputCost) * 100000) / 100000,
    pricing,
  }
}

function pickAnthropic(
  baseModel: string,
  tier: 'light' | 'medium' | 'heavy',
  _needsVision?: boolean,
  totalEstimatedTokens?: number
): string {
  // NO ROUTING: Always return the baseModel without any routing
  return baseModel
}

function classifyAnthropicModel(modelName: string, contextTokens?: number): 'light' | 'medium' | 'heavy' {
  const name = modelName.toLowerCase()

  // Direct Anthropic models only (not OpenRouter prefixed)
  if (name.startsWith('claude-')) {
    if (name.includes('haiku')) return 'light'
    if (name.includes('opus')) return 'heavy'
    if (name.includes('sonnet-4') || name.includes('claude-3-7')) return 'heavy'
  }

  if (contextTokens && contextTokens >= 200000) return 'heavy'

  return 'medium'
}

function pickOpenAI(
  baseModel: string,
  tier: 'light' | 'medium' | 'heavy',
  _needsVision?: boolean,
  totalEstimatedTokens?: number
): string {
  // NO ROUTING: Always return the baseModel without any routing
  return baseModel
}

function classifyOpenAIModel(modelName: string, contextTokens?: number): 'light' | 'medium' | 'heavy' {
  const name = modelName.toLowerCase()

  // Direct OpenAI models only (not OpenRouter prefixed like openai/gpt-5)
  if (name.startsWith('gpt-') || name.startsWith('o1-') || name.startsWith('o3-')) {
    if (name.includes('mini') || name.includes('nano')) return 'light'
    if (name.includes('o1') || name.includes('o3') || name.includes('gpt-5') || name.includes('gpt-4.1')) return 'heavy'
  }

  if (contextTokens && contextTokens >= 200000) return 'heavy'
  if (contextTokens && contextTokens < 100000) return 'light'

  return 'medium'
}

function pickGoogle(baseModel: string, tier: 'light' | 'medium' | 'heavy', totalEstimatedTokens?: number): string {
  // NO ROUTING: Always return the baseModel without any routing
  return baseModel
}

function classifyGoogleModel(modelName: string, contextTokens?: number): 'light' | 'medium' | 'heavy' {
  const name = modelName.toLowerCase()

  // Direct Google models only (not OpenRouter prefixed like google/gemini-2.5-pro)
  if (name.startsWith('gemini-')) {
    if (name.includes('lite') || name.includes('flash-lite')) return 'light'
    if (name.includes('pro')) return 'heavy'
  }

  if (contextTokens && contextTokens >= 2000000) return 'heavy'
  if (contextTokens && contextTokens < 500000) return 'light'

  return 'medium'
}

/**
 * Pick OpenRouter model using dynamic registry from API
 * Falls back to local config-based registry if API unavailable
 */
async function pickOpenRouterAsync(
  baseModel: string,
  tier: 'light' | 'medium' | 'heavy',
  needsVision?: boolean,
  totalEstimatedTokens?: number
): Promise<string> {
  // Extract provider prefix (e.g., 'google/gemini-2.5-flash' → 'google/')
  const providerMatch = baseModel.match(/^([^/]+\/)/)
  if (!providerMatch) return baseModel

  const providerPrefix = providerMatch[1]

  try {
    // Fetch all models from OpenRouter API
    const allModels = await openRouterRegistry.fetchAllModels()

    // Filter models by provider prefix
    const providerModels = allModels.filter((m) => m.id.startsWith(providerPrefix))
    if (providerModels.length === 0) return baseModel

    // Classify models by tier based on their actual capabilities
    const modelsByTier: { light: OpenRouterModel[]; medium: OpenRouterModel[]; heavy: OpenRouterModel[] } = {
      light: [],
      medium: [],
      heavy: [],
    }

    for (const model of providerModels) {
      const modelTier = classifyOpenRouterModelTier(model)
      modelsByTier[modelTier].push(model)
    }

    // Select candidates based on tier
    let candidates = modelsByTier[tier]

    // Fallback to other tiers
    if (candidates.length === 0) {
      if (tier === 'light') candidates = modelsByTier.medium.concat(modelsByTier.heavy)
      if (tier === 'medium') candidates = modelsByTier.heavy.concat(modelsByTier.light)
      if (tier === 'heavy') candidates = modelsByTier.medium.concat(modelsByTier.light)
    }

    if (candidates.length === 0) return baseModel

    // Filter by context size if specified
    if (totalEstimatedTokens && totalEstimatedTokens > 0) {
      const withEnoughContext = candidates.filter((m) => m.context_length >= totalEstimatedTokens * 1.2)
      if (withEnoughContext.length > 0) candidates = withEnoughContext
    }

    // Filter by vision capability if needed
    if (needsVision) {
      const visionCapable = candidates.filter(
        (m) => m.architecture?.modality?.includes('image') || m.id.includes('vision') || m.id.includes('image')
      )
      if (visionCapable.length > 0) candidates = visionCapable
    }

    // Sort by context length (larger first for heavy tier, smaller for light)
    candidates.sort((a, b) => {
      if (tier === 'light') return a.context_length - b.context_length
      return b.context_length - a.context_length
    })

    return candidates[0].id
  } catch {
    // Fallback to sync version if API fails
    return pickOpenRouter(baseModel, tier, needsVision, totalEstimatedTokens)
  }
}

/**
 * Classify OpenRouter model tier based on actual model data
 */
function classifyOpenRouterModelTier(model: OpenRouterModel): 'light' | 'medium' | 'heavy' {
  const name = model.id.toLowerCase()
  const contextLength = model.context_length

  // Pattern-based classification
  if (name.includes('lite') || name.includes('mini') || name.includes('flash-lite') || name.includes('nano')) {
    return 'light'
  }

  if (
    name.includes('pro') ||
    name.includes('opus') ||
    name.includes('codex') ||
    name.includes('deep-research') ||
    name.includes('405b') ||
    name.includes('thinking') ||
    name.includes('ultra')
  ) {
    return 'heavy'
  }

  // Context-based classification
  if (contextLength >= 200000) return 'heavy'
  if (contextLength < 32000) return 'light'

  return 'medium'
}

function pickOpenRouter(
  baseModel: string,
  tier: 'light' | 'medium' | 'heavy',
  needsVision?: boolean,
  totalEstimatedTokens?: number,
  modelRegistry?: OpenRouterModelRegistry
): string {
  // NO ROUTING: Always return the baseModel without any routing
  return baseModel
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

/**
 * OpenRouter model registry structure
 */
interface OpenRouterModelRegistry {
  [providerPrefix: string]: {
    light?: string[]
    medium?: string[]
    heavy?: string[]
  }
}

/**
 * Classifica il tier di un modello basato sul nome e context size
 */
function classifyModelTier(modelName: string, contextTokens?: number): 'light' | 'medium' | 'heavy' {
  const name = modelName.toLowerCase()

  // Pattern per light
  if (name.includes('lite') || name.includes('mini') || name.includes('flash-lite')) {
    return 'light'
  }

  // Pattern per heavy
  if (
    name.includes('pro') ||
    name.includes('codex') ||
    name.includes('opus') ||
    name.includes('deep-research') ||
    name.includes('405b') ||
    name.includes('thinking')
  ) {
    return 'heavy'
  }

  // Context size check (cap at 200k)
  if (contextTokens) {
    if (contextTokens >= 200000) return 'heavy'
    if (contextTokens < 100000) return 'light'
  }

  return 'medium'
}

/**
 * Costruisce registry dinamica dei modelli OpenRouter dal config
 */
function buildOpenRouterRegistry(): OpenRouterModelRegistry {
  try {
    const allModels = simpleConfigManager.getAllModels()

    const registry: OpenRouterModelRegistry = {}

    // Filtra solo modelli OpenRouter
    const openRouterModels = Object.entries(allModels).filter(
      ([_, config]: [string, any]) => config.provider === 'openrouter'
    )

    for (const [_modelName, config] of openRouterModels) {
      const modelConfig = config as any
      const providerMatch = modelConfig.model.match(/^([^/]+\/)/)
      if (!providerMatch) continue

      const providerPrefix = providerMatch[1]
      if (!registry[providerPrefix]) {
        registry[providerPrefix] = {}
      }

      // Classificazione tier basata su nome modello
      const tier = classifyModelTier(modelConfig.model, modelConfig.maxContextTokens)

      if (!registry[providerPrefix][tier]) {
        registry[providerPrefix][tier] = []
      }

      registry[providerPrefix][tier]!.push(modelConfig.model)
    }

    return registry
  } catch (error) {
    structuredLogger.warning('Failed to build OpenRouter registry', JSON.stringify({ error: String(error) }))
    return {}
  }
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
    const messageHash = crypto.createHash('sha256').update(JSON.stringify(messages)).digest('hex')
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
   * Supports multiple routing strategies:
   * - 'adaptive': NikCLI's intelligent tier-based routing (default)
   * - 'auto': Use OpenRouter's Auto Router (powered by NotDiamond)
   * - 'fallback': Use model fallback chain with OpenRouter's 'models' parameter
   * - 'fixed': Use the exact model specified
   *
   * Reference: https://openrouter.ai/docs/guides/features/model-routing
   */
  async choose(input: ModelRouteInput): Promise<ModelRouteDecision> {
    const strategy = input.strategy || 'adaptive'

    // Filter and ensure messages have required properties
    const validMessages = input.messages
      .filter((m) => m.role && m.content)
      .map((m) => ({
        role: m.role!,
        content: m.content!,
      }))

    // Get precise token count with memoization
    const { tokens, method } = await this.getTokenCountMemoized(validMessages, input.provider, input.baseModel)

    // Calcola spazio riservato per toolchains
    let toolchainReserve = 0
    if (input.sizeHints?.toolCount && input.sizeHints.toolCount > 0) {
      const avgToolDefSize = 150 // token medi per definizione tool
      const avgToolResultSize = 500 // token medi per risultato tool

      const toolDefinitionTokens = input.sizeHints.toolCount * avgToolDefSize
      const estimatedResultTokens = input.sizeHints.toolCount * avgToolResultSize * 0.5 // assume 50% tool usage
      const buffer = (toolDefinitionTokens + estimatedResultTokens) * 0.1 // 10% safety

      toolchainReserve = toolDefinitionTokens + estimatedResultTokens + buffer
    }

    const totalEstimatedTokens = tokens + toolchainReserve

    const lastUser = [...input.messages].reverse().find((m) => m.role === 'user')?.content || ''
    let tier = determineTier(tokens, input.scope, lastUser)

    // Ottieni limiti modello base
    const baseLimits = universalTokenizer.getModelLimits(input.baseModel, input.provider)
    const contextUsage = totalEstimatedTokens / baseLimits.context

    // Se toolchain rischia overflow (>80% context), upgrade tier
    if (toolchainReserve > 0 && contextUsage > 0.8) {
      const originalTier = tier
      if (tier === 'light') tier = 'medium'
      else if (tier === 'medium') tier = 'heavy'

      if (tier !== originalTier) {
        structuredLogger.info(
          `Toolchain detected, upgrading tier ${originalTier} → ${tier}`,
          JSON.stringify({
            toolchainReserve,
            contextUsage: Math.round(contextUsage * 100),
            baseModel: input.baseModel,
          })
        )
      }
    }

    let selected = input.baseModel
    let reason = 'base model'
    let fallbackModels: string[] | undefined
    let isAutoRouter = false

    // Handle different routing strategies
    if (strategy === 'auto' && input.provider === 'openrouter') {
      // Use OpenRouter Auto Router - automatically selects best model
      // Powered by NotDiamond: https://www.notdiamond.ai/
      selected = OPENROUTER_AUTO_MODEL
      reason = `openrouter auto-router (${method})`
      isAutoRouter = true

      structuredLogger.info(
        'Using OpenRouter Auto Router',
        JSON.stringify({
          estimatedTokens: totalEstimatedTokens,
          tier,
          method,
        })
      )
    } else if (strategy === 'fallback' && input.provider === 'openrouter') {
      // Use OpenRouter's 'models' parameter for automatic fallback
      // Reference: https://openrouter.ai/docs/guides/features/model-routing
      selected = input.baseModel
      fallbackModels = input.fallbackModels || FALLBACK_CHAINS.openrouter?.[tier] || []
      reason = `openrouter fallback-chain (${method}, ${fallbackModels.length} fallbacks)`

      structuredLogger.info(
        'Using OpenRouter fallback chain',
        JSON.stringify({
          primaryModel: selected,
          fallbacks: fallbackModels,
          tier,
        })
      )
    } else if (strategy === 'fixed') {
      // Use exact model specified, no routing
      selected = input.baseModel
      reason = `fixed model (${method})`
    } else {
      // Default: adaptive routing
      // Build registry per OpenRouter
      let registry: OpenRouterModelRegistry | undefined
      if (input.provider === 'openrouter') {
        registry = buildOpenRouterRegistry()
      }

      switch (input.provider) {
        case 'openai':
          selected = pickOpenAI(input.baseModel, tier, input.needsVision, totalEstimatedTokens)
          reason = `openai ${tier} (${method}${toolchainReserve > 0 ? `, toolchain: ${toolchainReserve} tok` : ''})`
          break
        case 'anthropic':
          selected = pickAnthropic(input.baseModel, tier, input.needsVision, totalEstimatedTokens)
          reason = `anthropic ${tier} (${method}${toolchainReserve > 0 ? `, toolchain: ${toolchainReserve} tok` : ''})`
          break
        case 'google':
          selected = pickGoogle(input.baseModel, tier, totalEstimatedTokens)
          reason = `google ${tier} (${method}${toolchainReserve > 0 ? `, toolchain: ${toolchainReserve} tok` : ''})`
          break
        case 'openrouter':
          // Use async version with dynamic API registry, fallback to sync
          try {
            selected = await pickOpenRouterAsync(input.baseModel, tier, input.needsVision, totalEstimatedTokens)
          } catch {
            selected = pickOpenRouter(input.baseModel, tier, input.needsVision, totalEstimatedTokens, registry)
          }
          // Always include fallback models for OpenRouter adaptive routing
          fallbackModels = FALLBACK_CHAINS.openrouter?.[tier]
          reason = `openrouter ${tier} (${method}${toolchainReserve > 0 ? `, toolchain: ${toolchainReserve} tok` : ''})`
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
    }

    // Verify final context limits
    const selectedLimits = universalTokenizer.getModelLimits(selected, input.provider)
    const selectedContextUsage = totalEstimatedTokens / selectedLimits.context

    if (selectedContextUsage > this.CONTEXT_WARNING_THRESHOLD) {
      structuredLogger.warning(
        `High context usage: ${Math.round(selectedContextUsage * 100)}%`,
        JSON.stringify({
          model: selected,
          estimatedTokens: totalEstimatedTokens,
          toolchainReserve,
          contextLimit: selectedLimits.context,
          tier,
        })
      )
    }

    // Warning if approaching context limit even after selection
    if (totalEstimatedTokens > selectedLimits.context * 0.9) {
      structuredLogger.warning(
        'Selected model approaching context limit',
        JSON.stringify({
          selectedModel: selected,
          estimatedTokens: totalEstimatedTokens,
          contextLimit: selectedLimits.context,
          usage: Math.round((totalEstimatedTokens / selectedLimits.context) * 100),
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

    // Calculate estimated cost for this request
    const pricing = await getModelPricing(input.provider, selected)
    const estimatedCost = calculateEstimatedCost(pricing, totalEstimatedTokens)

    return {
      selectedModel: selected,
      tier,
      reason,
      estimatedTokens: totalEstimatedTokens,
      actualTokens: method === 'precise' ? tokens : undefined,
      confidence: method === 'precise' ? 0.95 : 0.7,
      tokenizationMethod: method,
      toolchainReserve,
      strategy,
      fallbackModels,
      isAutoRouter,
      estimatedCost,
    }
  }

  /**
   * Synchronous version for backwards compatibility
   * @deprecated Use async choose() method instead for precise counting
   */
  chooseFast(input: ModelRouteInput): ModelRouteDecision {
    const strategy = input.strategy || 'adaptive'

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
    let fallbackModels: string[] | undefined
    let isAutoRouter = false

    // Handle special strategies for OpenRouter
    if (strategy === 'auto' && input.provider === 'openrouter') {
      selected = OPENROUTER_AUTO_MODEL
      reason = 'openrouter auto-router'
      isAutoRouter = true
    } else if (strategy === 'fallback' && input.provider === 'openrouter') {
      selected = input.baseModel
      fallbackModels = input.fallbackModels || FALLBACK_CHAINS.openrouter?.[tier] || []
      reason = `openrouter fallback-chain (${fallbackModels.length} fallbacks)`
    } else if (strategy === 'fixed') {
      selected = input.baseModel
      reason = 'fixed model'
    } else {
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
          fallbackModels = FALLBACK_CHAINS.openrouter?.[tier]
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
    }

    return {
      selectedModel: selected,
      tier,
      reason,
      estimatedTokens: tokens,
      confidence: 0.7,
      tokenizationMethod: 'fallback',
      strategy,
      fallbackModels,
      isAutoRouter,
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
