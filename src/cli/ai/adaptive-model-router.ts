import crypto from 'node:crypto'
import type { CoreMessage } from 'ai'
import { universalTokenizer } from '../core/universal-tokenizer-service'
import { structuredLogger } from '../utils/structured-logger'
import type { ChatMessage } from './model-provider'

export type ModelScope = 'chat_default' | 'planning' | 'code_gen' | 'tool_light' | 'tool_heavy' | 'vision'

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
  toolchainReserve?: number // Token riservati per toolchains
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

  return ratios[provider] || 4.0 // Default fallback
}

function pickAnthropic(
  baseModel: string,
  tier: 'light' | 'medium' | 'heavy',
  _needsVision?: boolean,
  totalEstimatedTokens?: number
): string {
  try {
    const { ConfigManager } = require('../core/config-manager')
    const configManager = ConfigManager.getInstance()
    const allModels = configManager.getAllModels()

    // Filter Anthropic models
    const anthropicModels = Object.entries(allModels)
      .filter(([_, config]: [string, any]) => config.provider === 'anthropic')
      .map(([_, config]: [string, any]) => config)

    if (anthropicModels.length === 0) return baseModel

    // Classify models by tier
    const modelsByTier: { light: any[]; medium: any[]; heavy: any[] } = { light: [], medium: [], heavy: [] }

    for (const model of anthropicModels) {
      const modelTier = classifyAnthropicModel(model.model, model.maxContextTokens)
      modelsByTier[modelTier].push(model)
    }

    // Select candidates based on tier
    let candidates = modelsByTier[tier] || []

    // Fallback to other tiers
    if (candidates.length === 0) {
      if (tier === 'light') candidates = modelsByTier.medium.concat(modelsByTier.heavy)
      if (tier === 'medium') candidates = modelsByTier.heavy.concat(modelsByTier.light)
      if (tier === 'heavy') candidates = modelsByTier.medium.concat(modelsByTier.light)
    }

    if (candidates.length === 0) return baseModel

    // Filter by context size if toolchain tokens specified
    if (totalEstimatedTokens && totalEstimatedTokens > 0) {
      const withEnoughContext = candidates.filter(
        (m) => (m.maxContextTokens || 200000) >= totalEstimatedTokens * 1.2
      )
      if (withEnoughContext.length > 0) candidates = withEnoughContext
    }

    return candidates[0].model
  } catch (error) {
    return baseModel
  }
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
  try {
    const { ConfigManager } = require('../core/config-manager')
    const configManager = ConfigManager.getInstance()
    const allModels = configManager.getAllModels()

    // Filter OpenAI models
    const openaiModels = Object.entries(allModels)
      .filter(([_, config]: [string, any]) => config.provider === 'openai')
      .map(([_, config]: [string, any]) => config)

    if (openaiModels.length === 0) return baseModel

    // Classify models by tier
    const modelsByTier: { light: any[]; medium: any[]; heavy: any[] } = { light: [], medium: [], heavy: [] }

    for (const model of openaiModels) {
      const modelTier = classifyOpenAIModel(model.model, model.maxContextTokens)
      modelsByTier[modelTier].push(model)
    }

    // Select candidates based on tier
    let candidates = modelsByTier[tier] || []

    // Fallback to other tiers
    if (candidates.length === 0) {
      if (tier === 'light') candidates = modelsByTier.medium.concat(modelsByTier.heavy)
      if (tier === 'medium') candidates = modelsByTier.heavy.concat(modelsByTier.light)
      if (tier === 'heavy') candidates = modelsByTier.medium.concat(modelsByTier.light)
    }

    if (candidates.length === 0) return baseModel

    // Filter by context size if toolchain tokens specified
    if (totalEstimatedTokens && totalEstimatedTokens > 0) {
      const withEnoughContext = candidates.filter(
        (m) => (m.maxContextTokens || 128000) >= totalEstimatedTokens * 1.2
      )
      if (withEnoughContext.length > 0) candidates = withEnoughContext
    }

    return candidates[0].model
  } catch (error) {
    return baseModel
  }
}

function classifyOpenAIModel(modelName: string, contextTokens?: number): 'light' | 'medium' | 'heavy' {
  const name = modelName.toLowerCase()

  // Direct OpenAI models only (not OpenRouter prefixed like openai/gpt-5)
  if (name.startsWith('gpt-') || name.startsWith('o1-') || name.startsWith('o3-')) {
    if (name.includes('mini') || name.includes('nano')) return 'light'
    if (name.includes('o1') || name.includes('o3') || name.includes('gpt-5') || name.includes('gpt-4.1'))
      return 'heavy'
  }

  if (contextTokens && contextTokens >= 200000) return 'heavy'
  if (contextTokens && contextTokens < 100000) return 'light'

  return 'medium'
}

function pickGoogle(
  baseModel: string,
  tier: 'light' | 'medium' | 'heavy',
  totalEstimatedTokens?: number
): string {
  try {
    const { ConfigManager } = require('../core/config-manager')
    const configManager = ConfigManager.getInstance()
    const allModels = configManager.getAllModels()

    // Filter Google models
    const googleModels = Object.entries(allModels)
      .filter(([_, config]: [string, any]) => config.provider === 'google')
      .map(([_, config]: [string, any]) => config)

    if (googleModels.length === 0) return baseModel

    // Classify models by tier
    const modelsByTier: { light: any[]; medium: any[]; heavy: any[] } = { light: [], medium: [], heavy: [] }

    for (const model of googleModels) {
      const modelTier = classifyGoogleModel(model.model, model.maxContextTokens)
      modelsByTier[modelTier].push(model)
    }

    // Select candidates based on tier
    let candidates = modelsByTier[tier] || []

    // Fallback to other tiers
    if (candidates.length === 0) {
      if (tier === 'light') candidates = modelsByTier.medium.concat(modelsByTier.heavy)
      if (tier === 'medium') candidates = modelsByTier.heavy.concat(modelsByTier.light)
      if (tier === 'heavy') candidates = modelsByTier.medium.concat(modelsByTier.light)
    }

    if (candidates.length === 0) return baseModel

    // Filter by context size if toolchain tokens specified
    if (totalEstimatedTokens && totalEstimatedTokens > 0) {
      const withEnoughContext = candidates.filter((m) => (m.maxContextTokens || 1000000) >= totalEstimatedTokens * 1.2)
      if (withEnoughContext.length > 0) candidates = withEnoughContext
    }

    return candidates[0].model
  } catch (error) {
    return baseModel
  }
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

function pickOpenRouter(
  baseModel: string,
  tier: 'light' | 'medium' | 'heavy',
  needsVision?: boolean,
  totalEstimatedTokens?: number,
  modelRegistry?: OpenRouterModelRegistry
): string {
  // Estrae provider prefix (es. 'google/gemini-2.5-flash' → 'google/')
  const providerMatch = baseModel.match(/^([^/]+\/)/)
  if (!providerMatch) return baseModel

  const providerPrefix = providerMatch[1]

  // Se non c'è registry, usa baseModel configurato
  if (!modelRegistry || !modelRegistry[providerPrefix]) {
    return baseModel
  }

  const providerModels = modelRegistry[providerPrefix]

  // Selezione tier-based con fallback
  let candidates = providerModels[tier] || []

  // Se tier richiesto non ha modelli, prova tier superiore/inferiore
  if (candidates.length === 0) {
    if (tier === 'light') candidates = providerModels.medium || providerModels.heavy || []
    if (tier === 'medium') candidates = providerModels.heavy || providerModels.light || []
    if (tier === 'heavy') candidates = providerModels.medium || providerModels.light || []
  }

  // Fallback finale al baseModel se non ci sono candidati
  if (candidates.length === 0) return baseModel

  // Se totalEstimatedTokens specificato, filtra per context size
  if (totalEstimatedTokens && totalEstimatedTokens > 0) {
    const modelsWithEnoughContext = candidates.filter((model) => {
      const limits = universalTokenizer.getModelLimits(model, 'openrouter')
      return limits.context >= totalEstimatedTokens * 1.2 // 20% buffer
    })
    if (modelsWithEnoughContext.length > 0) {
      candidates = modelsWithEnoughContext
    }
  }

  // Filtra per vision se necessario
  if (needsVision) {
    const visionCapable = candidates.filter(
      (m) => m.includes('vision') || m.includes('image') || m.includes('@preset/nikcli')
    )
    if (visionCapable.length > 0) candidates = visionCapable
  }

  // Restituisce primo candidato (preferenza per ordine dichiarato in registry)
  return candidates[0]
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
    const { ConfigManager } = require('../core/config-manager')
    const configManager = ConfigManager.getInstance()
    const allModels = configManager.getAllModels()

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
        selected = pickOpenRouter(input.baseModel, tier, input.needsVision, totalEstimatedTokens, registry)
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

    return {
      selectedModel: selected,
      tier,
      reason,
      estimatedTokens: totalEstimatedTokens,
      actualTokens: method === 'precise' ? tokens : undefined,
      confidence: method === 'precise' ? 0.95 : 0.7,
      tokenizationMethod: method,
      toolchainReserve,
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
