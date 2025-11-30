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
  'claude-sonnet-4.5': {
    supportsReasoning: true,
    reasoningType: 'exposed',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'claude-haiku-4.5': {
    supportsReasoning: true,
    reasoningType: 'exposed',
    defaultEnabled: true,
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
  'o3-mini': {
    supportsReasoning: true,
    reasoningType: 'internal',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'gpt-5': {
    supportsReasoning: true,
    reasoningType: 'exposed',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'gpt-5-mini': {
    supportsReasoning: true,
    reasoningType: 'exposed',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },

  // OpenRouter-specific model paths (with provider prefix)
  // Google models via OpenRouter
  'google/gemini-3-pro-preview': {
    supportsReasoning: true,
    reasoningType: 'thinking',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'google/gemini-3-pro': {
    supportsReasoning: true,
    reasoningType: 'thinking',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'google/gemini-3-flash': {
    supportsReasoning: true,
    reasoningType: 'thinking',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'google/gemini-2.5-pro': {
    supportsReasoning: true,
    reasoningType: 'thinking',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'google/gemini-2.5-flash': {
    supportsReasoning: true,
    reasoningType: 'thinking',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },

  // OpenAI models via OpenRouter
  'openai/o1': {
    supportsReasoning: true,
    reasoningType: 'internal',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'openai/o1-mini': {
    supportsReasoning: true,
    reasoningType: 'internal',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'openai/o1-preview': {
    supportsReasoning: true,
    reasoningType: 'internal',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'openai/o3-mini': {
    supportsReasoning: true,
    reasoningType: 'internal',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'openai/gpt-5': {
    supportsReasoning: true,
    reasoningType: 'exposed',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'openai/gpt-5-mini': {
    supportsReasoning: true,
    reasoningType: 'exposed',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'openai/gpt-5.1': {
    supportsReasoning: true,
    reasoningType: 'exposed',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'anthropic/claude-3-7-sonnet-20250219': {
    supportsReasoning: true,
    reasoningType: 'exposed',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'anthropic/claude-sonnet-4-20250514': {
    supportsReasoning: true,
    reasoningType: 'exposed',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'anthropic/claude-4-opus-20250514': {
    supportsReasoning: true,
    reasoningType: 'exposed',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'xai/grok-beta': {
    supportsReasoning: true,
    reasoningType: 'exposed',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'xai/grok-2': {
    supportsReasoning: true,
    reasoningType: 'exposed',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'google/gemini-2.5-pro-thinking': {
    supportsReasoning: true,
    reasoningType: 'thinking',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'google/gemini-2.5-flash-thinking': {
    supportsReasoning: true,
    reasoningType: 'thinking',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'qwen/qwen-plus-thinking': {
    supportsReasoning: true,
    reasoningType: 'thinking',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'qwen/qwen-turbo-thinking': {
    supportsReasoning: true,
    reasoningType: 'thinking',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  // Additional OpenRouter models from defaultModels with reasoning support
  'anthropic/claude-sonnet-4.5': {
    supportsReasoning: true,
    reasoningType: 'exposed',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'anthropic/claude-haiku-4.5': {
    supportsReasoning: true,
    reasoningType: 'exposed',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'anthropic/claude-sonnet-4': {
    supportsReasoning: true,
    reasoningType: 'exposed',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'anthropic/claude-3.7-sonnet:thinking': {
    supportsReasoning: true,
    reasoningType: 'thinking',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'anthropic/claude-3.7-sonnet': {
    supportsReasoning: true,
    reasoningType: 'exposed',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'anthropic/claude-opus-4.1': {
    supportsReasoning: true,
    reasoningType: 'exposed',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'openai/gpt-5-pro': {
    supportsReasoning: true,
    reasoningType: 'exposed',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'openai/gpt-5-codex': {
    supportsReasoning: true,
    reasoningType: 'exposed',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'openai/gpt-5-image': {
    supportsReasoning: true,
    reasoningType: 'exposed',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'openai/gpt-5-image-mini': {
    supportsReasoning: true,
    reasoningType: 'exposed',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'openai/o3-deep-research': {
    supportsReasoning: true,
    reasoningType: 'internal',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'openai/o4-mini-deep-research': {
    supportsReasoning: true,
    reasoningType: 'internal',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'x-ai/grok-2': {
    supportsReasoning: true,
    reasoningType: 'exposed',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'x-ai/grok-3': {
    supportsReasoning: true,
    reasoningType: 'exposed',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'x-ai/grok-3-mini': {
    supportsReasoning: true,
    reasoningType: 'exposed',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'x-ai/grok-4': {
    supportsReasoning: true,
    reasoningType: 'exposed',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'x-ai/grok-4-fast:free': {
    supportsReasoning: true,
    reasoningType: 'exposed',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'x-ai/grok-code-fast-1': {
    supportsReasoning: true,
    reasoningType: 'exposed',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'qwen/qwen3-next-80b-a3b-thinking': {
    supportsReasoning: true,
    reasoningType: 'thinking',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'moonshotai/kimi-k2-0905': {
    supportsReasoning: true,
    reasoningType: 'exposed',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'moonshotai/kimi-k2-0905:exacto': {
    supportsReasoning: true,
    reasoningType: 'exposed',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'minimax/minimax-m2:free': {
    supportsReasoning: true,
    reasoningType: 'exposed',
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

  // Gemini 3 models with reasoning
  'gemini-3-pro-preview': {
    supportsReasoning: true,
    reasoningType: 'thinking',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },

  'gemini-3-pro': {
    supportsReasoning: true,
    reasoningType: 'thinking',
    defaultEnabled: true,
    requiresExplicitRequest: false,
  },
  'gemini-3-flash': {
    supportsReasoning: true,
    reasoningType: 'thinking',
    defaultEnabled: true,
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
    reasoningField: 'reasoning_details',
    reasoningTextField: 'reasoningText',
    supportsMiddleware: true,
    usesReasoningParameter: true,
    reasoningFormat: 'details_array',
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
  static detectReasoningSupport(_provider: string, modelId: string): ReasoningCapabilities {
    // Try exact model match first
    const exactMatch = MODEL_REASONING_CAPABILITIES[modelId]
    if (exactMatch) {
      return exactMatch
    }

    // Try pattern matching for similar models
    const patterns = [
      // Anthropic Claude patterns
      { pattern: /claude-sonnet-4\.5/, capabilities: MODEL_REASONING_CAPABILITIES['claude-sonnet-4.5'] },
      { pattern: /claude-haiku-4\.5/, capabilities: MODEL_REASONING_CAPABILITIES['claude-haiku-4.5'] },
      { pattern: /claude-3-7/, capabilities: MODEL_REASONING_CAPABILITIES['claude-3-7-sonnet-latest'] },
      {
        pattern: /anthropic\/claude-sonnet-4\.5/,
        capabilities: MODEL_REASONING_CAPABILITIES['anthropic/claude-sonnet-4.5'],
      },
      {
        pattern: /anthropic\/claude-haiku-4\.5/,
        capabilities: MODEL_REASONING_CAPABILITIES['anthropic/claude-haiku-4.5'],
      },
      {
        pattern: /anthropic\/claude-3\.7-sonnet/,
        capabilities: MODEL_REASONING_CAPABILITIES['anthropic/claude-3.7-sonnet'],
      },
      {
        pattern: /anthropic\/claude-sonnet-4/,
        capabilities: MODEL_REASONING_CAPABILITIES['anthropic/claude-sonnet-4'],
      },
      {
        pattern: /anthropic\/claude-4-opus/,
        capabilities: MODEL_REASONING_CAPABILITIES['anthropic/claude-4-opus-20250514'],
      },
      { pattern: /anthropic\/claude-opus-4/, capabilities: MODEL_REASONING_CAPABILITIES['anthropic/claude-opus-4.1'] },

      // OpenAI reasoning patterns
      { pattern: /^o1(-mini|-preview)?$/, capabilities: MODEL_REASONING_CAPABILITIES['o1-mini'] },
      { pattern: /^o3-mini/, capabilities: MODEL_REASONING_CAPABILITIES['o3-mini'] },
      { pattern: /openai\/o1/, capabilities: MODEL_REASONING_CAPABILITIES['openai/o1'] },
      { pattern: /openai\/o3/, capabilities: MODEL_REASONING_CAPABILITIES['openai/o3-mini'] },
      { pattern: /openai\/gpt-5/, capabilities: MODEL_REASONING_CAPABILITIES['openai/gpt-5'] },
      { pattern: /gpt-5/, capabilities: MODEL_REASONING_CAPABILITIES['gpt-5'] },

      // Grok patterns
      { pattern: /grok-(2|3|4)/, capabilities: MODEL_REASONING_CAPABILITIES['xai/grok-beta'] },
      { pattern: /x-ai\/grok/, capabilities: MODEL_REASONING_CAPABILITIES['x-ai/grok-2'] },

      // Gemini thinking patterns (direct and via OpenRouter)
      {
        pattern: /gemini-2\.5.*thinking/,
        capabilities: MODEL_REASONING_CAPABILITIES['google/gemini-2.5-pro-thinking'],
      },
      { pattern: /gemini-2\.5/, capabilities: MODEL_REASONING_CAPABILITIES['gemini-2.5-pro'] },
      { pattern: /gemini-3.*preview/, capabilities: MODEL_REASONING_CAPABILITIES['gemini-3-pro-preview'] },
      { pattern: /gemini-3/, capabilities: MODEL_REASONING_CAPABILITIES['gemini-3-pro'] },
      {
        pattern: /google\/gemini-3.*preview/,
        capabilities: MODEL_REASONING_CAPABILITIES['google/gemini-3-pro-preview'],
      },
      { pattern: /google\/gemini-3/, capabilities: MODEL_REASONING_CAPABILITIES['google/gemini-3-pro'] },
      { pattern: /google\/gemini-2\.5/, capabilities: MODEL_REASONING_CAPABILITIES['google/gemini-2.5-pro'] },

      // Qwen thinking patterns
      { pattern: /qwen.*thinking/, capabilities: MODEL_REASONING_CAPABILITIES['qwen/qwen-plus-thinking'] },

      // Kimi K2 patterns
      { pattern: /kimi-k2/, capabilities: MODEL_REASONING_CAPABILITIES['moonshotai/kimi-k2-0905'] },

      // MiniMax patterns
      { pattern: /minimax-m2/, capabilities: MODEL_REASONING_CAPABILITIES['minimax/minimax-m2:free'] },
    ]

    for (const { pattern, capabilities } of patterns) {
      if (pattern.test(modelId)) {
        return capabilities
      }
    }

    // Return default if no match found
    return MODEL_REASONING_CAPABILITIES.default || { supportsReasoning: false, reasoningTokenCost: 1.0 }
  }

  /**
   * Check if reasoning should be enabled for a specific model
   */
  static shouldEnableReasoning(provider: string, modelId: string, userPreference?: boolean): boolean {
    const capabilities = ReasoningDetector.detectReasoningSupport(provider, modelId)

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
    const config = ReasoningDetector.getProviderReasoningConfig(provider)

    // OpenRouter uses reasoning_details array format
    if (provider === 'openrouter' && response.reasoning_details) {
      const reasoningDetails = response.reasoning_details

      // Extract text from reasoning_details array
      const textParts: string[] = []
      for (const detail of reasoningDetails) {
        if (detail.type === 'reasoning.summary' && detail.text) {
          textParts.push(`Summary: ${detail.text}`)
        } else if (detail.type === 'reasoning.text' && detail.text) {
          textParts.push(detail.text)
        }
      }

      return {
        reasoning: reasoningDetails,
        reasoningText: textParts.length > 0 ? textParts.join('\n\n') : undefined,
      }
    }

    // Standard reasoning field extraction for other providers
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
    const config = ReasoningDetector.getProviderReasoningConfig(provider)
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
    const capabilities = ReasoningDetector.detectReasoningSupport(provider, modelId)

    if (!capabilities.supportsReasoning) {
      return 'No reasoning support'
    }

    const type = capabilities.reasoningType
    const enabled = capabilities.defaultEnabled ? 'enabled by default' : 'available on request'

    return `Reasoning support: ${type} (${enabled})`
  }
}
