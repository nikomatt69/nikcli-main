/**
 * Reasoning Detection System for NikCLI AI Providers
 * Detects and manages reasoning capabilities across different AI models
 */

export interface ReasoningCapabilities {
  supportsReasoning: boolean
  reasoningType: 'internal' | 'exposed' | 'thinking' | 'none'
  defaultEnabled: boolean
  requiresExplicitRequest: boolean
}

export interface ModelReasoningMap {
  [modelId: string]: ReasoningCapabilities
}

/**
 * Model-specific reasoning capabilities mapping
 * Updated based on AI SDK 3.4.x documentation and provider capabilities
 */
export const MODEL_REASONING_CAPABILITIES: ModelReasoningMap = {
  // Anthropic Claude models with reasoning support
  'claude-3-7-sonnet-latest': {
    supportsReasoning: true,
    reasoningType: 'exposed',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'claude-3-7-sonnet-20241206': {
    supportsReasoning: true,
    reasoningType: 'exposed',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'claude-3-5-sonnet-latest': {
    supportsReasoning: false,
    reasoningType: 'none',
    defaultEnabled: false,
    requiresExplicitRequest: false,
  },
  'claude-3-5-sonnet-20241022': {
    supportsReasoning: false,
    reasoningType: 'none',
    defaultEnabled: false,
    requiresExplicitRequest: false,
  },

  // OpenAI reasoning models
  'o1-mini': {
    supportsReasoning: true,
    reasoningType: 'internal',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'o1-preview': {
    supportsReasoning: true,
    reasoningType: 'internal',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  o1: {
    supportsReasoning: true,
    reasoningType: 'internal',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'gpt-4o': {
    supportsReasoning: false,
    reasoningType: 'none',
    defaultEnabled: false,
    requiresExplicitRequest: false,
  },
  'gpt-4o-mini': {
    supportsReasoning: false,
    reasoningType: 'none',
    defaultEnabled: false,
    requiresExplicitRequest: false,
  },

  // Google Gemini models with thinking process
  'gemini-2.5-pro': {
    supportsReasoning: true,
    reasoningType: 'thinking',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'gemini-2.5-flash': {
    supportsReasoning: true,
    reasoningType: 'thinking',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'gemini-1.5-pro': {
    supportsReasoning: false,
    reasoningType: 'none',
    defaultEnabled: false,
    requiresExplicitRequest: false,
  },
  'gemini-1.5-flash': {
    supportsReasoning: false,
    reasoningType: 'none',
    defaultEnabled: false,
    requiresExplicitRequest: false,
  },

  // Default fallback for unknown models
  default: {
    supportsReasoning: false,
    reasoningType: 'none',
    defaultEnabled: false,
    requiresExplicitRequest: false,
  },
}

/**
 * Provider-specific reasoning configuration
 */
export const PROVIDER_REASONING_CONFIG = {
  anthropic: {
    reasoningField: 'reasoning',
    reasoningTextField: 'reasoningText',
    supportsMiddleware: true,
  },
  openai: {
    reasoningField: 'reasoning',
    reasoningTextField: 'reasoningText',
    supportsMiddleware: false,
  },
  google: {
    reasoningField: 'thinking',
    reasoningTextField: 'thinkingSummary',
    supportsMiddleware: true,
  },
  vercel: {
    reasoningField: 'reasoning',
    reasoningTextField: 'reasoningText',
    supportsMiddleware: true,
  },
  gateway: {
    reasoningField: 'reasoning',
    reasoningTextField: 'reasoningText',
    supportsMiddleware: true,
  },
  openrouter: {
    reasoningField: 'reasoning',
    reasoningTextField: 'reasoningText',
    supportsMiddleware: true,
  },
  ollama: {
    reasoningField: 'reasoning',
    reasoningTextField: 'reasoningText',
    supportsMiddleware: false,
  },
} as const

export class ReasoningDetector {
  /**
   * Detect if a model supports reasoning capabilities
   */
  static detectReasoningSupport(provider: string, modelId: string): ReasoningCapabilities {
    // Try exact model match first
    const exactMatch = MODEL_REASONING_CAPABILITIES[modelId]
    if (exactMatch) {
      return exactMatch
    }

    // Try pattern matching for similar models
    const patterns = [
      { pattern: /claude-3-7/, capabilities: MODEL_REASONING_CAPABILITIES['claude-3-7-sonnet-latest'] },
      { pattern: /o1(-mini|-preview)?$/, capabilities: MODEL_REASONING_CAPABILITIES['o1-mini'] },
      { pattern: /gemini-2\.5/, capabilities: MODEL_REASONING_CAPABILITIES['gemini-2.5-pro'] },
    ]

    for (const { pattern, capabilities } of patterns) {
      if (pattern.test(modelId)) {
        return capabilities
      }
    }

    // Return default if no match found
    return MODEL_REASONING_CAPABILITIES['default']
  }

  /**
   * Check if reasoning should be enabled for a specific model
   */
  static shouldEnableReasoning(provider: string, modelId: string, userPreference?: boolean): boolean {
    const capabilities = this.detectReasoningSupport(provider, modelId)

    // Respect explicit user preference if provided
    if (userPreference !== undefined) {
      return userPreference && capabilities.supportsReasoning
    }

    // Use model's default setting
    return capabilities.supportsReasoning && capabilities.defaultEnabled
  }

  /**
   * Get provider-specific reasoning configuration
   */
  static getProviderReasoningConfig(provider: string) {
    return (
      PROVIDER_REASONING_CONFIG[provider as keyof typeof PROVIDER_REASONING_CONFIG] ||
      PROVIDER_REASONING_CONFIG.anthropic
    )
  }

  /**
   * Extract reasoning content from model response
   */
  static extractReasoning(response: any, provider: string): { reasoning?: any; reasoningText?: string } {
    const config = this.getProviderReasoningConfig(provider)

    const reasoning = response[config.reasoningField]
    const reasoningText = response[config.reasoningTextField]

    return {
      reasoning: reasoning || undefined,
      reasoningText: reasoningText || undefined,
    }
  }

  /**
   * Check if a provider supports reasoning middleware
   */
  static supportsReasoningMiddleware(provider: string): boolean {
    const config = this.getProviderReasoningConfig(provider)
    return config.supportsMiddleware
  }

  /**
   * Get all models that support reasoning
   */
  static getReasoningEnabledModels(): string[] {
    return Object.entries(MODEL_REASONING_CAPABILITIES)
      .filter(([_, capabilities]) => capabilities.supportsReasoning)
      .map(([modelId]) => modelId)
      .filter((modelId) => modelId !== 'default')
  }

  /**
   * Get reasoning capabilities summary for a model
   */
  static getModelReasoningSummary(provider: string, modelId: string): string {
    const capabilities = this.detectReasoningSupport(provider, modelId)

    if (!capabilities.supportsReasoning) {
      return 'No reasoning support'
    }

    const type = capabilities.reasoningType
    const enabled = capabilities.defaultEnabled ? 'enabled by default' : 'available on request'

    return `Reasoning support: ${type} (${enabled})`
  }
}
