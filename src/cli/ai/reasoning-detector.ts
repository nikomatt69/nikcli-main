/**
 * Dynamic Reasoning Detection System for NikCLI AI Providers
 * Uses AI SDK middleware for automatic reasoning extraction across all models
 * Dynamically fetches model capabilities from OpenRouter API
 */

import { type LanguageModelV1, experimental_wrapLanguageModel } from 'ai'
import { openRouterRegistry, type ModelCapabilities } from './openrouter-model-registry'

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
  },
  openai: {
    reasoningField: 'reasoning',
    reasoningTextField: 'reasoningText',
    supportsMiddleware: true,
    defaultTagName: 'thinking',
    providerMetadataKey: 'openai',
  },
  google: {
    reasoningField: 'thinking',
    reasoningTextField: 'thinkingSummary',
    supportsMiddleware: true,
    defaultTagName: 'thinking',
    providerMetadataKey: 'google',
  },
  vercel: {
    reasoningField: 'reasoning',
    reasoningTextField: 'reasoningText',
    supportsMiddleware: true,
    defaultTagName: 'thinking',
    providerMetadataKey: 'vercel',
  },
  gateway: {
    reasoningField: 'reasoning',
    reasoningTextField: 'reasoningText',
    supportsMiddleware: true,
    defaultTagName: 'thinking',
    providerMetadataKey: 'gateway',
  },
  openrouter: {
    reasoningField: 'reasoning',
    reasoningTextField: 'reasoningText',
    supportsMiddleware: true,
    defaultTagName: 'thinking',
    providerMetadataKey: 'openrouter',
    usesReasoningParameter: true,
    reasoningParameterName: 'include_reasoning',
  },
  ollama: {
    reasoningField: 'reasoning',
    reasoningTextField: 'reasoningText',
    supportsMiddleware: true,
    defaultTagName: 'thinking',
    providerMetadataKey: 'ollama',
  },
  cerebras: {
    reasoningField: 'reasoning',
    reasoningTextField: 'reasoningText',
    supportsMiddleware: true,
    defaultTagName: 'thinking',
    providerMetadataKey: 'cerebras',
  },
  groq: {
    reasoningField: 'reasoning',
    reasoningTextField: 'reasoningText',
    supportsMiddleware: true,
    defaultTagName: 'thinking',
    providerMetadataKey: 'groq',
  },
  llamacpp: {
    reasoningField: 'reasoning',
    reasoningTextField: 'reasoningText',
    supportsMiddleware: true,
    defaultTagName: 'thinking',
    providerMetadataKey: 'llamacpp',
  },
  lmstudio: {
    reasoningField: 'reasoning',
    reasoningTextField: 'reasoningText',
    supportsMiddleware: true,
    defaultTagName: 'thinking',
    providerMetadataKey: 'lmstudio',
  },
  'openai-compatible': {
    reasoningField: 'reasoning',
    reasoningTextField: 'reasoningText',
    supportsMiddleware: true,
    defaultTagName: 'thinking',
    providerMetadataKey: 'openai-compatible',
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
  static getMiddleware(provider: string, config?: ReasoningMiddlewareConfig): ReturnType<typeof createReasoningMiddleware> {
    const providerConfig = PROVIDER_REASONING_CONFIG[provider as SupportedProvider]
    const tagName = config?.tagName || providerConfig?.defaultTagName || 'thinking'
    const cacheKey = `${provider}:${tagName}`

    if (!this.middlewareCache.has(cacheKey)) {
      this.middlewareCache.set(cacheKey, createReasoningMiddleware({ tagName, ...config }))
    }

    return this.middlewareCache.get(cacheKey)!
  }

  /**
   * Detect if a model supports reasoning capabilities
   * For OpenRouter models, fetches capabilities dynamically from API
   */
  static detectReasoningSupport(provider: string, modelId: string): ReasoningCapabilities {
    // Check cache first
    const cacheKey = `${provider}:${modelId}`
    const cached = this.capabilitiesCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
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
    const cached = this.capabilitiesCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.capabilities
    }

    // For OpenRouter, fetch from registry
    if (provider === 'openrouter') {
      try {
        const modelCapabilities = await openRouterRegistry.getCapabilities(modelId)
        const capabilities = this.convertToReasoningCapabilities(modelCapabilities)
        this.capabilitiesCache.set(cacheKey, { capabilities, timestamp: Date.now() })
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
  static async shouldEnableReasoningAsync(provider: string, modelId: string, userPreference?: boolean): Promise<boolean> {
    if (userPreference !== undefined) {
      return userPreference
    }

    if (provider === 'openrouter') {
      const caps = await this.detectReasoningSupportAsync(provider, modelId)
      return caps.supportsReasoning
    }

    return true
  }

  /**
   * Get provider-specific reasoning configuration
   */
  static getProviderReasoningConfig(provider: string) {
    return (
      PROVIDER_REASONING_CONFIG[provider as SupportedProvider] ||
      PROVIDER_REASONING_CONFIG.openrouter
    )
  }

  /**
   * Extract reasoning content from model response
   */
  static extractReasoning(response: any, provider: string): ExtractedReasoning {
    const config = this.getProviderReasoningConfig(provider)
    const middleware = this.getMiddleware(provider)

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
    const config = this.getProviderReasoningConfig(provider)
    return config.supportsMiddleware
  }

  /**
   * Get provider metadata for enabling reasoning in API requests
   * For OpenRouter, dynamically builds metadata based on model capabilities
   */
  static getReasoningProviderMetadata(provider: string, enabled = true): Record<string, any> {
    const config = this.getProviderReasoningConfig(provider)

    if (provider === 'openrouter') {
      return {
        openrouter: {
          include_reasoning: enabled,
          transforms: enabled ? ['middle-out'] : undefined,
        },
      }
    }

    if (provider === 'anthropic') {
      return {
        anthropic: {
          thinking: enabled ? { type: 'enabled', budget_tokens: 10000 } : undefined,
        },
      }
    }

    if (provider === 'google') {
      return {
        google: {
          thinkingConfig: enabled ? { thinkingBudget: 10000 } : undefined,
        },
      }
    }

    return {
      [config.providerMetadataKey]: {
        reasoning: enabled,
      },
    }
  }

  /**
   * Async version - builds metadata based on actual model capabilities
   */
  static async getReasoningProviderMetadataAsync(
    provider: string,
    modelId: string,
    options: {
      enabled?: boolean
      effort?: 'low' | 'medium' | 'high'
    } = {}
  ): Promise<Record<string, any>> {
    const { enabled = true, effort = 'medium' } = options

    if (provider === 'openrouter') {
      // Use registry to build metadata based on actual model capabilities
      return openRouterRegistry.buildProviderMetadata(modelId, {
        enableReasoning: enabled,
        reasoningEffort: effort,
        includeReasoning: enabled,
      })
    }

    return this.getReasoningProviderMetadata(provider, enabled)
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
    const providerConfig = this.getProviderReasoningConfig(provider)
    return wrapWithReasoningMiddleware(model, {
      tagName: providerConfig.defaultTagName,
      ...config,
    })
  }

  /**
   * Process streaming chunks to extract reasoning in real-time
   */
  static processStreamChunk(chunk: any, provider: string): { text?: string; reasoning?: string; type: string } {
    const middleware = this.getMiddleware(provider)

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
      return models.map(m => m.id)
    } catch {
      return []
    }
  }
}

// Export convenience functions
export const extractReasoning = ReasoningDetector.extractReasoning.bind(ReasoningDetector)
export const getReasoningProviderMetadata = ReasoningDetector.getReasoningProviderMetadata.bind(ReasoningDetector)
export const wrapModelWithReasoning = ReasoningDetector.wrapModel.bind(ReasoningDetector)
