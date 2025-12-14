/**
 * Dynamic Reasoning Detection System for NikCLI AI Providers
 * Uses AI SDK middleware for automatic reasoning extraction across all models
 * Dynamically fetches model capabilities from OpenRouter API
 */

import { experimental_wrapLanguageModel, type LanguageModelV1 } from 'ai'
import { type ModelCapabilities, openRouterRegistry } from './openrouter-model-registry'

/**
 * Reasoning capabilities interface - now dynamic, not model-specific
 */
export interface ReasoningCapabilities {
  supportsReasoning: boolean
  reasoningType: 'internal' | 'exposed' | 'thinking' | 'none'
  defaultEnabled: boolean
  requiresExplicitRequest: boolean
}

/**
 * Extracted reasoning result from middleware
 */
export interface ExtractedReasoning {
  reasoning?: string
  reasoningText?: string
  reasoningDetails?: Array<{ type: string; text: string }>
}

/**
 * Configuration for reasoning extraction middleware
 */
export interface ReasoningMiddlewareConfig {
  /** Tag name to look for (e.g., 'thinking', 'reasoning') */
  tagName?: string
  /** Separator for multiple reasoning blocks */
  separator?: string
  /** Whether to include reasoning in the final text output */
  includeInText?: boolean
  /** Custom start/end tags for reasoning blocks */
  startTag?: string
  endTag?: string
}

/**
 * AI SDK v4 Provider-specific reasoning configuration types
 * Based on official documentation from ai-sdk.dev
 */

/** Anthropic thinking configuration (AI SDK v4) */
export interface AnthropicThinkingConfig {
  type: 'enabled' | 'disabled'
  budgetTokens?: number // camelCase per AI SDK v4
}

/** Google Gemini thinking configuration (AI SDK v4) */
export interface GoogleThinkingConfig {
  thinkingBudget?: number // Gemini 2.5: token budget (0=off, -1=dynamic)
  thinkingLevel?: 'low' | 'high' // Gemini 3: thinking intensity
  includeThoughts?: boolean // Include thoughts in response
}

/** OpenAI reasoning configuration (AI SDK v4) */
export interface OpenAIReasoningConfig {
  reasoningEffort?: 'low' | 'medium' | 'high' | 'none' | 'xhigh'
  reasoningSummary?: 'auto' | 'detailed'
  serviceTier?: 'auto' | 'flex' | 'priority' | 'default'
}

/** OpenRouter reasoning configuration */
export interface OpenRouterReasoningConfig {
  include_reasoning?: boolean
  reasoning?: {
    effort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
    max_tokens?: number // min 1024, max 32000
    enabled?: boolean // for DeepSeek
    exclude?: boolean
  }
}

/** xAI (Grok) reasoning configuration */
export interface XAIReasoningConfig {
  reasoningEffort?: 'low' | 'medium' | 'high'
}

/** Reasoning effort levels */
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

/** Options for building provider metadata */
export interface ReasoningMetadataOptions {
  enabled?: boolean
  effort?: ReasoningEffort
  budgetTokens?: number
  includeThoughts?: boolean
  reasoningSummary?: 'auto' | 'detailed'
}

/**
 * Provider-specific reasoning configuration
 * Defines how each provider handles reasoning fields in responses
 */
export const PROVIDER_REASONING_CONFIG = {
  anthropic: {
    reasoningField: 'reasoning',
    reasoningTextField: 'reasoningText',
    supportsMiddleware: true,
    defaultTagName: 'thinking',
    providerMetadataKey: 'anthropic',
    // AI SDK v4 parameters
    supportsNativeReasoning: true,
    thinkingParam: 'thinking',
    budgetParam: 'budgetTokens', // camelCase per AI SDK v4!
    typeValues: ['enabled', 'disabled'] as const,
    defaultBudgetTokens: 10000,
  },
  openai: {
    reasoningField: 'reasoning',
    reasoningTextField: 'reasoningText',
    supportsMiddleware: true,
    defaultTagName: 'thinking',
    providerMetadataKey: 'openai',
    // AI SDK v4 parameters
    supportsNativeReasoning: true,
    reasoningEffortParam: 'reasoningEffort',
    reasoningEffortValues: ['low', 'medium', 'high', 'none', 'xhigh'] as const,
    reasoningSummaryParam: 'reasoningSummary',
    reasoningSummaryValues: ['auto', 'detailed'] as const,
    serviceTierParam: 'serviceTier',
    serviceTierValues: ['auto', 'flex', 'priority', 'default'] as const,
    // Model-specific restrictions
    noneOnlyModels: ['gpt-5.1'], // 'none' effort only for GPT-5.1
    xhighOnlyModels: ['gpt-5.1-codex-max'], // 'xhigh' only for Codex-Max
    reasoningModels: ['o1', 'o1-mini', 'o3', 'o3-mini', 'o4-mini'], // models that support reasoning
  },
  google: {
    reasoningField: 'thinking',
    reasoningTextField: 'thinkingSummary',
    supportsMiddleware: true,
    defaultTagName: 'thinking',
    providerMetadataKey: 'google',
    // AI SDK v4 parameters
    supportsNativeReasoning: true,
    thinkingConfigParam: 'thinkingConfig',
    // Gemini 2.5 parameters
    gemini25BudgetParam: 'thinkingBudget', // number: 0=off, -1=dynamic
    // Gemini 3 parameters (NEW)
    gemini3LevelParam: 'thinkingLevel', // 'low' | 'high'
    gemini3LevelValues: ['low', 'high'] as const,
    includeThoughtsParam: 'includeThoughts',
    defaultThinkingBudget: 8192,
  },
  xai: {
    reasoningField: 'reasoning',
    reasoningTextField: 'reasoningText',
    supportsMiddleware: true,
    defaultTagName: 'thinking',
    providerMetadataKey: 'xai',
    // AI SDK v4 parameters
    supportsNativeReasoning: true,
    reasoningEffortParam: 'reasoningEffort',
    reasoningEffortValues: ['low', 'medium', 'high'] as const,
  },
  vercel: {
    reasoningField: 'reasoning',
    reasoningTextField: 'reasoningText',
    supportsMiddleware: true,
    defaultTagName: 'thinking',
    providerMetadataKey: 'vercel',
    supportsNativeReasoning: false,
  },
  gateway: {
    reasoningField: 'reasoning',
    reasoningTextField: 'reasoningText',
    supportsMiddleware: true,
    defaultTagName: 'thinking',
    providerMetadataKey: 'gateway',
    supportsNativeReasoning: false,
  },
  openrouter: {
    reasoningField: 'reasoning',
    reasoningTextField: 'reasoningText',
    supportsMiddleware: true,
    defaultTagName: 'thinking',
    providerMetadataKey: 'openrouter',
    // AI SDK v4 / OpenRouter parameters
    supportsNativeReasoning: true,
    usesReasoningParameter: true,
    includeReasoningParam: 'include_reasoning',
    reasoningObjectParam: 'reasoning',
    effortValues: ['minimal', 'low', 'medium', 'high', 'xhigh'] as const,
    effortRatios: { minimal: 0.1, low: 0.2, medium: 0.5, high: 0.8, xhigh: 0.95 } as const,
    maxTokensMin: 1024,
    maxTokensMax: 32000,
  },
  ollama: {
    reasoningField: 'reasoning',
    reasoningTextField: 'reasoningText',
    supportsMiddleware: true,
    defaultTagName: 'thinking',
    providerMetadataKey: 'ollama',
    supportsNativeReasoning: false, // Solo tag extraction
  },
  cerebras: {
    reasoningField: 'reasoning',
    reasoningTextField: 'reasoningText',
    supportsMiddleware: true,
    defaultTagName: 'thinking',
    providerMetadataKey: 'cerebras',
    supportsNativeReasoning: false,
  },
  groq: {
    reasoningField: 'reasoning',
    reasoningTextField: 'reasoningText',
    supportsMiddleware: true,
    defaultTagName: 'thinking',
    providerMetadataKey: 'groq',
    supportsNativeReasoning: false,
  },
  llamacpp: {
    reasoningField: 'reasoning',
    reasoningTextField: 'reasoningText',
    supportsMiddleware: true,
    defaultTagName: 'thinking',
    providerMetadataKey: 'llamacpp',
    supportsNativeReasoning: false,
  },
  lmstudio: {
    reasoningField: 'reasoning',
    reasoningTextField: 'reasoningText',
    supportsMiddleware: true,
    defaultTagName: 'thinking',
    providerMetadataKey: 'lmstudio',
    supportsNativeReasoning: false,
  },
  'openai-compatible': {
    reasoningField: 'reasoning',
    reasoningTextField: 'reasoningText',
    supportsMiddleware: true,
    defaultTagName: 'thinking',
    providerMetadataKey: 'openai-compatible',
    supportsNativeReasoning: false,
  },
} as const

export type SupportedProvider = keyof typeof PROVIDER_REASONING_CONFIG

/**
 * Default reasoning capabilities for dynamic detection
 */
const DEFAULT_REASONING_CAPABILITIES: ReasoningCapabilities = {
  supportsReasoning: true,
  reasoningType: 'exposed',
  defaultEnabled: true,
  requiresExplicitRequest: false,
}

/**
 * Create reasoning extraction middleware for AI SDK
 */
export function createReasoningMiddleware(config: ReasoningMiddlewareConfig = {}) {
  const {
    tagName = 'thinking',
    separator = '\n\n',
    startTag = config.startTag || `<${tagName}>`,
    endTag = config.endTag || `</${tagName}>`,
  } = config

  const tagPattern = new RegExp(`${escapeRegex(startTag)}([\\s\\S]*?)${escapeRegex(endTag)}`, 'gi')

  return {
    extractFromText(text: string): { reasoning: string; cleanedText: string } {
      const reasoningParts: string[] = []
      let cleanedText = text

      let match: RegExpExecArray | null
      while ((match = tagPattern.exec(text)) !== null) {
        if (match[1]) {
          reasoningParts.push(match[1].trim())
        }
      }

      cleanedText = text.replace(tagPattern, '').trim()

      return {
        reasoning: reasoningParts.join(separator),
        cleanedText,
      }
    },

    hasReasoningTags(text: string): boolean {
      return tagPattern.test(text)
    },
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Wrap a language model with reasoning extraction middleware
 */
export function wrapWithReasoningMiddleware(
  model: LanguageModelV1,
  config: ReasoningMiddlewareConfig = {}
): LanguageModelV1 {
  const middleware = createReasoningMiddleware(config)

  return experimental_wrapLanguageModel({
    model,
    middleware: {
      wrapGenerate: async ({ doGenerate }) => {
        const result = await doGenerate()

        if (!result.text) {
          return result
        }

        const { reasoning, cleanedText } = middleware.extractFromText(result.text)

        if (reasoning) {
          const existingMetadata = (result as any).experimental_providerMetadata || {}
          return {
            ...result,
            text: cleanedText,
            reasoning,
            providerMetadata: {
              ...existingMetadata,
              reasoning: {
                content: reasoning,
                extracted: true,
              },
            },
          } as typeof result
        }

        return result
      },
    },
  })
}

/**
 * Main ReasoningDetector class - dynamic and middleware-based
 * Now integrates with OpenRouter model registry for dynamic capability detection
 */
export class ReasoningDetector {
  private static middlewareCache = new Map<string, ReturnType<typeof createReasoningMiddleware>>()
  private static capabilitiesCache = new Map<string, { capabilities: ReasoningCapabilities; timestamp: number }>()
  private static readonly CACHE_TTL = 1000 * 60 * 30 // 30 minutes

  /**
   * Get or create a reasoning middleware instance for a provider
   */
  static getMiddleware(
    provider: string,
    config?: ReasoningMiddlewareConfig
  ): ReturnType<typeof createReasoningMiddleware> {
    const providerConfig = PROVIDER_REASONING_CONFIG[provider as SupportedProvider]
    const tagName = config?.tagName || providerConfig?.defaultTagName || 'thinking'
    const cacheKey = `${provider}:${tagName}`

    if (!ReasoningDetector.middlewareCache.has(cacheKey)) {
      ReasoningDetector.middlewareCache.set(cacheKey, createReasoningMiddleware({ tagName, ...config }))
    }

    return ReasoningDetector.middlewareCache.get(cacheKey)!
  }

  /**
   * Detect if a model supports reasoning capabilities
   * For OpenRouter models, fetches capabilities dynamically from API
   */
  static detectReasoningSupport(provider: string, modelId: string): ReasoningCapabilities {
    // Check cache first
    const cacheKey = `${provider}:${modelId}`
    const cached = ReasoningDetector.capabilitiesCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < ReasoningDetector.CACHE_TTL) {
      return cached.capabilities
    }

    // For OpenRouter, we'll use async detection - return default for sync calls
    // The async version should be preferred
    return DEFAULT_REASONING_CAPABILITIES
  }

  /**
   * Async version of detectReasoningSupport - preferred for OpenRouter models
   * Fetches actual model capabilities from OpenRouter API
   */
  static async detectReasoningSupportAsync(provider: string, modelId: string): Promise<ReasoningCapabilities> {
    const cacheKey = `${provider}:${modelId}`
    const cached = ReasoningDetector.capabilitiesCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < ReasoningDetector.CACHE_TTL) {
      return cached.capabilities
    }

    // For OpenRouter, fetch from registry
    if (provider === 'openrouter') {
      try {
        const modelCapabilities = await openRouterRegistry.getCapabilities(modelId)
        const capabilities = ReasoningDetector.convertToReasoningCapabilities(modelCapabilities)
        ReasoningDetector.capabilitiesCache.set(cacheKey, { capabilities, timestamp: Date.now() })
        return capabilities
      } catch {
        // Fallback to default on error
      }
    }

    return DEFAULT_REASONING_CAPABILITIES
  }

  /**
   * Convert OpenRouter model capabilities to ReasoningCapabilities
   */
  private static convertToReasoningCapabilities(caps: ModelCapabilities): ReasoningCapabilities {
    return {
      supportsReasoning: caps.supportsReasoning || caps.supportsIncludeReasoning,
      reasoningType: caps.supportsIncludeReasoning ? 'exposed' : caps.supportsReasoning ? 'thinking' : 'none',
      defaultEnabled: caps.supportsReasoning || caps.supportsIncludeReasoning,
      requiresExplicitRequest: false,
    }
  }

  /**
   * Check if reasoning should be enabled for a specific model
   */
  static shouldEnableReasoning(provider: string, modelId: string, userPreference?: boolean): boolean {
    if (userPreference !== undefined) {
      return userPreference
    }
    return true // Default to enabled - middleware will handle extraction dynamically
  }

  /**
   * Async version - checks actual model capabilities for OpenRouter
   */
  static async shouldEnableReasoningAsync(
    provider: string,
    modelId: string,
    userPreference?: boolean
  ): Promise<boolean> {
    if (userPreference !== undefined) {
      return userPreference
    }

    if (provider === 'openrouter') {
      const caps = await ReasoningDetector.detectReasoningSupportAsync(provider, modelId)
      return caps.supportsReasoning
    }

    return true
  }

  /**
   * Get provider-specific reasoning configuration
   */
  static getProviderReasoningConfig(provider: string) {
    return PROVIDER_REASONING_CONFIG[provider as SupportedProvider] || PROVIDER_REASONING_CONFIG.openrouter
  }

  /**
   * Extract reasoning content from model response
   */
  static extractReasoning(response: any, provider: string): ExtractedReasoning {
    const config = ReasoningDetector.getProviderReasoningConfig(provider)
    const middleware = ReasoningDetector.getMiddleware(provider)

    // 1. Check for reasoning already extracted by middleware
    if (response.reasoning && typeof response.reasoning === 'string') {
      return {
        reasoning: response.reasoning,
        reasoningText: response.reasoning,
      }
    }

    // 2. Check experimental_providerMetadata for reasoning
    if (response.experimental_providerMetadata?.reasoning?.content) {
      return {
        reasoning: response.experimental_providerMetadata.reasoning.content,
        reasoningText: response.experimental_providerMetadata.reasoning.content,
      }
    }

    // 3. Check for OpenRouter reasoning_details array format
    if (response.reasoning_details && Array.isArray(response.reasoning_details)) {
      const textParts: string[] = []
      for (const detail of response.reasoning_details) {
        if (detail.type === 'reasoning.summary' && detail.text) {
          textParts.push(`Summary: ${detail.text}`)
        } else if (detail.type === 'reasoning.text' && detail.text) {
          textParts.push(detail.text)
        } else if (detail.text) {
          textParts.push(detail.text)
        }
      }

      if (textParts.length > 0) {
        return {
          reasoning: response.reasoning_details,
          reasoningText: textParts.join('\n\n'),
          reasoningDetails: response.reasoning_details,
        }
      }
    }

    // 4. Check provider-specific reasoning fields
    const reasoningField = response[config.reasoningField]
    const reasoningTextField = response[config.reasoningTextField]

    if (reasoningField || reasoningTextField) {
      return {
        reasoning: reasoningField || undefined,
        reasoningText: reasoningTextField || (typeof reasoningField === 'string' ? reasoningField : undefined),
      }
    }

    // 5. Try to extract from text content using middleware
    if (response.text && typeof response.text === 'string') {
      const { reasoning } = middleware.extractFromText(response.text)
      if (reasoning) {
        return {
          reasoning,
          reasoningText: reasoning,
        }
      }
    }

    return {}
  }

  /**
   * Check if a provider supports reasoning middleware
   */
  static supportsReasoningMiddleware(provider: string): boolean {
    const config = ReasoningDetector.getProviderReasoningConfig(provider)
    return config.supportsMiddleware
  }

  /**
   * Get provider metadata for enabling reasoning in API requests
   * AI SDK v4 compatible - uses correct parameter names for each provider
   * @param provider - Provider name
   * @param modelId - Model identifier (needed for Gemini 2.5 vs 3 detection)
   * @param options - Reasoning options
   */
  static getReasoningProviderMetadata(
    provider: string,
    modelId = '',
    options: ReasoningMetadataOptions = {}
  ): Record<string, any> {
    const {
      enabled = true,
      effort = 'medium',
      budgetTokens = 10000,
      includeThoughts = true,
      reasoningSummary = 'auto',
    } = options

    switch (provider) {
      case 'anthropic':
        // AI SDK v4: uses budgetTokens (camelCase), NOT budget_tokens
        return {
          anthropic: {
            thinking: enabled
              ? { type: 'enabled' as const, budgetTokens }
              : { type: 'disabled' as const },
          },
        }

      case 'openai':
        // AI SDK v4: reasoningEffort for o1/o3/o4 models
        return {
          openai: {
            reasoningEffort: enabled ? effort : undefined,
            reasoningSummary: enabled ? reasoningSummary : undefined,
          },
        }

      case 'google': {
        // AI SDK v4: Different config for Gemini 2.5 vs Gemini 3
        const isGemini3 = modelId.includes('gemini-3')
        if (isGemini3) {
          // Gemini 3: uses thinkingLevel ('low' | 'high')
          return {
            google: {
              thinkingConfig: {
                thinkingLevel: effort === 'low' ? 'low' : 'high',
                includeThoughts,
              },
            },
          }
        }
        // Gemini 2.5: uses thinkingBudget (number)
        return {
          google: {
            thinkingConfig: {
              thinkingBudget: enabled ? budgetTokens : 0,
              includeThoughts,
            },
          },
        }
      }

      case 'xai':
        // AI SDK v4: reasoningEffort for Grok models
        return {
          xai: {
            reasoningEffort: enabled ? effort : undefined,
          },
        }

      case 'openrouter':
        // OpenRouter: include_reasoning + reasoning object
        return {
          openrouter: {
            include_reasoning: enabled,
            reasoning: enabled
              ? {
                  effort: effort as 'minimal' | 'low' | 'medium' | 'high' | 'xhigh',
                  enabled: true,
                }
              : undefined,
          },
        }

      default:
        // Generic fallback for providers without native reasoning
        return {}
    }
  }

  /**
   * Async version - builds metadata based on actual model capabilities
   * Fetches OpenRouter model capabilities dynamically from API
   */
  static async getReasoningProviderMetadataAsync(
    provider: string,
    modelId: string,
    options: ReasoningMetadataOptions = {}
  ): Promise<Record<string, any>> {
    const { enabled = true, effort = 'medium' } = options

    if (provider === 'openrouter') {
      // For OpenRouter, fetch actual model capabilities from API
      try {
        const caps = await openRouterRegistry.getCapabilities(modelId)

        // Build metadata based on what the model actually supports
        const metadata: Record<string, any> = {
          openrouter: {},
        }

        if (enabled && (caps.supportsReasoning || caps.supportsIncludeReasoning)) {
          if (caps.supportsIncludeReasoning) {
            metadata.openrouter.include_reasoning = true
          }
          if (caps.supportsReasoningEffort) {
            metadata.openrouter.reasoning = {
              effort: effort as 'minimal' | 'low' | 'medium' | 'high' | 'xhigh',
              enabled: true,
            }
          }
        }

        return metadata
      } catch {
        // Fallback to default OpenRouter config on error
        return ReasoningDetector.getReasoningProviderMetadata(provider, modelId, options)
      }
    }

    // For all other providers, use the sync method with model detection
    return ReasoningDetector.getReasoningProviderMetadata(provider, modelId, options)
  }

  /**
   * Get reasoning capabilities summary for a model
   */
  static getModelReasoningSummary(provider: string, modelId: string): string {
    return 'Reasoning support: dynamic (enabled by default)'
  }

  /**
   * Async version - returns actual capabilities from OpenRouter API
   */
  static async getModelReasoningSummaryAsync(provider: string, modelId: string): Promise<string> {
    if (provider === 'openrouter') {
      try {
        const caps = await openRouterRegistry.getCapabilities(modelId)
        if (caps.supportsReasoning || caps.supportsIncludeReasoning) {
          return `Reasoning support: ${caps.supportsIncludeReasoning ? 'include_reasoning' : 'thinking'} (enabled)`
        }
        return 'Reasoning support: not available for this model'
      } catch {
        return 'Reasoning support: dynamic (enabled by default)'
      }
    }
    return 'Reasoning support: dynamic (enabled by default)'
  }

  /**
   * Wrap a model with reasoning extraction middleware
   */
  static wrapModel(model: LanguageModelV1, provider: string, config?: ReasoningMiddlewareConfig): LanguageModelV1 {
    const providerConfig = ReasoningDetector.getProviderReasoningConfig(provider)
    return wrapWithReasoningMiddleware(model, {
      tagName: providerConfig.defaultTagName,
      ...config,
    })
  }

  /**
   * Process streaming chunks to extract reasoning in real-time
   */
  static processStreamChunk(chunk: any, provider: string): { text?: string; reasoning?: string; type: string } {
    const middleware = ReasoningDetector.getMiddleware(provider)

    if (chunk.type === 'thinking' || chunk.type === 'reasoning') {
      return {
        reasoning: chunk.thinking || chunk.reasoning || chunk.content,
        type: 'reasoning',
      }
    }

    if (chunk.type === 'text-delta' && chunk.textDelta) {
      if (middleware.hasReasoningTags(chunk.textDelta)) {
        const { reasoning, cleanedText } = middleware.extractFromText(chunk.textDelta)
        return {
          text: cleanedText || undefined,
          reasoning: reasoning || undefined,
          type: reasoning ? 'mixed' : 'text',
        }
      }
      return {
        text: chunk.textDelta,
        type: 'text',
      }
    }

    return { type: chunk.type || 'unknown' }
  }

  /**
   * Get list of all supported providers
   */
  static getSupportedProviders(): string[] {
    return Object.keys(PROVIDER_REASONING_CONFIG)
  }

  /**
   * Check if a provider is supported
   */
  static isProviderSupported(provider: string): boolean {
    return provider in PROVIDER_REASONING_CONFIG
  }

  /**
   * Get all reasoning-enabled models (for backwards compatibility)
   * Now returns empty array - use async methods for dynamic detection
   */
  static getReasoningEnabledModels(): string[] {
    return [] // Dynamic detection - no hardcoded list
  }

  /**
   * Async version - fetches reasoning models from OpenRouter
   */
  static async getReasoningEnabledModelsAsync(): Promise<string[]> {
    try {
      const models = await openRouterRegistry.getReasoningModels()
      return models.map((m) => m.id)
    } catch {
      return []
    }
  }
}

// Export convenience functions
export const extractReasoning = ReasoningDetector.extractReasoning.bind(ReasoningDetector)
export const getReasoningProviderMetadata = ReasoningDetector.getReasoningProviderMetadata.bind(ReasoningDetector)
export const wrapModelWithReasoning = ReasoningDetector.wrapModel.bind(ReasoningDetector)
