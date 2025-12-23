/**
 * OpenRouter Model Registry
 * Dynamically fetches and caches model capabilities from OpenRouter API
 * Supports all OpenRouter models based on their actual parameters
 */

import { LRUCache } from 'lru-cache'

/**
 * OpenRouter model information from API
 */
export interface OpenRouterModel {
  id: string
  name: string
  description?: string
  context_length: number
  pricing: {
    prompt: string
    completion: string
    image?: string
    request?: string
  }
  top_provider?: {
    context_length?: number
    max_completion_tokens?: number
    is_moderated?: boolean
  }
  per_request_limits?: {
    prompt_tokens?: number
    completion_tokens?: number
  }
  architecture?: {
    modality: string
    tokenizer: string
    instruct_type?: string
  }
  // Dynamic parameters supported by this model
  supported_parameters?: string[]
}

/**
 * Parsed model capabilities based on supported_parameters
 */
export interface ModelCapabilities {
  // Core capabilities
  supportsTools: boolean
  supportsStreaming: boolean
  supportsReasoning: boolean
  supportsStructuredOutput: boolean
  supportsImages: boolean
  supportsAudio: boolean
  supportsVideo: boolean

  // Parameter support
  supportsTemperature: boolean
  supportsTopP: boolean
  supportsTopK: boolean
  supportsMaxTokens: boolean
  supportsStop: boolean
  supportsFrequencyPenalty: boolean
  supportsPresencePenalty: boolean
  supportsRepetitionPenalty: boolean
  supportsSeed: boolean
  supportsLogprobs: boolean
  supportsLogitBias: boolean

  // Reasoning-specific
  supportsIncludeReasoning: boolean
  supportsReasoningEffort: boolean

  // Response format
  supportsResponseFormat: boolean
  supportsJsonMode: boolean

  // Raw supported parameters list
  supportedParameters: string[]

  // Model metadata
  contextLength: number
  maxCompletionTokens?: number
  modality: string
}

/**
 * Default capabilities for unknown models
 */
const DEFAULT_CAPABILITIES: ModelCapabilities = {
  supportsTools: true,
  supportsStreaming: true,
  supportsReasoning: false,
  supportsStructuredOutput: false,
  supportsImages: false,
  supportsAudio: false,
  supportsVideo: false,
  supportsTemperature: true,
  supportsTopP: true,
  supportsTopK: false,
  supportsMaxTokens: true,
  supportsStop: true,
  supportsFrequencyPenalty: true,
  supportsPresencePenalty: true,
  supportsRepetitionPenalty: false,
  supportsSeed: false,
  supportsLogprobs: false,
  supportsLogitBias: false,
  supportsIncludeReasoning: false,
  supportsReasoningEffort: false,
  supportsResponseFormat: false,
  supportsJsonMode: false,
  supportedParameters: [],
  contextLength: 4096,
  modality: 'text',
}

/**
 * OpenRouter Model Registry
 * Fetches and caches model information from OpenRouter API
 */
export class OpenRouterModelRegistry {
  private static instance: OpenRouterModelRegistry
  private modelCache: LRUCache<string, OpenRouterModel>
  private capabilitiesCache: LRUCache<string, ModelCapabilities>
  private allModelsCache: OpenRouterModel[] | null = null
  private lastFetchTime: number = 0
  private readonly CACHE_TTL = 1000 * 60 * 60 // 1 hour
  private readonly API_BASE = 'https://openrouter.ai/api/v1'
  private fetchPromise: Promise<OpenRouterModel[]> | null = null

  private constructor() {
    this.modelCache = new LRUCache<string, OpenRouterModel>({
      max: 500,
      ttl: this.CACHE_TTL,
    })
    this.capabilitiesCache = new LRUCache<string, ModelCapabilities>({
      max: 500,
      ttl: this.CACHE_TTL,
    })
  }

  static getInstance(): OpenRouterModelRegistry {
    if (!OpenRouterModelRegistry.instance) {
      OpenRouterModelRegistry.instance = new OpenRouterModelRegistry()
    }
    return OpenRouterModelRegistry.instance
  }

  /**
   * Fetch all models from OpenRouter API
   */
  async fetchAllModels(forceRefresh = false): Promise<OpenRouterModel[]> {
    const now = Date.now()

    // Return cached data if still valid
    if (!forceRefresh && this.allModelsCache && now - this.lastFetchTime < this.CACHE_TTL) {
      return this.allModelsCache
    }

    // Prevent concurrent fetches
    if (this.fetchPromise) {
      return this.fetchPromise
    }

    this.fetchPromise = this.doFetchAllModels()

    try {
      const result = await this.fetchPromise
      return result
    } finally {
      this.fetchPromise = null
    }
  }

  private async doFetchAllModels(): Promise<OpenRouterModel[]> {
    try {
      const response = await fetch(`${this.API_BASE}/models`, {
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      const models: OpenRouterModel[] = data.data || []

      // Cache all models
      this.allModelsCache = models
      this.lastFetchTime = Date.now()

      // Also cache individual models
      for (const model of models) {
        this.modelCache.set(model.id, model)
      }

      return models
    } catch (error: any) {
      console.warn(`[OpenRouterRegistry] Failed to fetch models: ${error.message}`)
      // Return cached data if available, even if expired
      return this.allModelsCache || []
    }
  }

  /**
   * Get a specific model by ID
   */
  async getModel(modelId: string): Promise<OpenRouterModel | null> {
    // Check cache first
    const cached = this.modelCache.get(modelId)
    if (cached) {
      return cached
    }

    // Fetch all models and find the one we need
    const models = await this.fetchAllModels()
    const model = models.find((m) => m.id === modelId)

    if (model) {
      this.modelCache.set(modelId, model)
    }

    return model || null
  }

  /**
   * Parse model capabilities from supported_parameters
   */
  parseCapabilities(model: OpenRouterModel): ModelCapabilities {
    const params = model.supported_parameters || []
    const modality = model.architecture?.modality || 'text'

    const capabilities: ModelCapabilities = {
      // Core capabilities
      supportsTools: params.includes('tools') || params.includes('tool_choice'),
      supportsStreaming: true, // All models support streaming
      supportsReasoning: params.includes('reasoning') || params.includes('include_reasoning'),
      supportsStructuredOutput: params.includes('structured_outputs') || params.includes('response_format'),
      supportsImages: modality.includes('image') || params.includes('images'),
      supportsAudio: modality.includes('audio'),
      supportsVideo: modality.includes('video'),

      // Parameter support
      supportsTemperature: params.includes('temperature'),
      supportsTopP: params.includes('top_p'),
      supportsTopK: params.includes('top_k'),
      supportsMaxTokens: params.includes('max_tokens') || params.includes('max_completion_tokens'),
      supportsStop: params.includes('stop'),
      supportsFrequencyPenalty: params.includes('frequency_penalty'),
      supportsPresencePenalty: params.includes('presence_penalty'),
      supportsRepetitionPenalty: params.includes('repetition_penalty'),
      supportsSeed: params.includes('seed'),
      supportsLogprobs: params.includes('logprobs') || params.includes('top_logprobs'),
      supportsLogitBias: params.includes('logit_bias'),

      // Reasoning-specific
      supportsIncludeReasoning: params.includes('include_reasoning'),
      supportsReasoningEffort: params.includes('reasoning') || params.includes('reasoning_effort'),

      // Response format
      supportsResponseFormat: params.includes('response_format'),
      supportsJsonMode: params.includes('response_format') || params.includes('json_mode'),

      // Raw parameters
      supportedParameters: params,

      // Model metadata
      contextLength: model.context_length || model.top_provider?.context_length || 4096,
      maxCompletionTokens: model.top_provider?.max_completion_tokens,
      modality,
    }

    return capabilities
  }

  /**
   * Get capabilities for a model
   */
  async getCapabilities(modelId: string): Promise<ModelCapabilities> {
    // Check cache first
    const cached = this.capabilitiesCache.get(modelId)
    if (cached) {
      return cached
    }

    // Get model info
    const model = await this.getModel(modelId)
    if (!model) {
      return DEFAULT_CAPABILITIES
    }

    // Parse capabilities
    const capabilities = this.parseCapabilities(model)
    this.capabilitiesCache.set(modelId, capabilities)

    return capabilities
  }

  /**
   * Build provider metadata for a model based on its capabilities
   */
  async buildProviderMetadata(
    modelId: string,
    options: {
      enableReasoning?: boolean
      reasoningEffort?: 'low' | 'medium' | 'high'
      transforms?: string[]
      includeReasoning?: boolean
    } = {}
  ): Promise<Record<string, any>> {
    const capabilities = await this.getCapabilities(modelId)
    const metadata: Record<string, any> = {}

    // Only add parameters that the model supports
    if (options.enableReasoning !== false) {
      // Reasoning support
      if (capabilities.supportsIncludeReasoning && options.includeReasoning !== false) {
        metadata.include_reasoning = true
      }

      if (capabilities.supportsReasoningEffort && options.reasoningEffort) {
        metadata.reasoningText = {
          effort: options.reasoningEffort,
        }
      }
    }

    // Transforms (context compression, etc.)
    if (options.transforms && options.transforms.length > 0) {
      metadata.transforms = options.transforms
    }

    return { openrouter: metadata }
  }

  /**
   * Build generation options based on model capabilities
   */
  async buildGenerationOptions(
    modelId: string,
    baseOptions: {
      temperature?: number
      maxOutputTokens?: number
      topP?: number
      topK?: number
      stop?: string[]
      frequencyPenalty?: number
      presencePenalty?: number
      seed?: number
    } = {}
  ): Promise<Record<string, any>> {
    const capabilities = await this.getCapabilities(modelId)
    const options: Record<string, any> = {}

    // Only include parameters that the model supports
    if (baseOptions.temperature !== undefined && capabilities.supportsTemperature) {
      options.temperature = baseOptions.temperature
    }

    if (baseOptions.maxOutputTokens !== undefined && capabilities.supportsMaxTokens) {
      options.maxOutputTokens = Math.min(baseOptions.maxOutputTokens, capabilities.maxCompletionTokens || baseOptions.maxOutputTokens)
    }

    if (baseOptions.topP !== undefined && capabilities.supportsTopP) {
      options.topP = baseOptions.topP
    }

    if (baseOptions.topK !== undefined && capabilities.supportsTopK) {
      options.topK = baseOptions.topK
    }

    if (baseOptions.stop !== undefined && capabilities.supportsStop) {
      options.stop = baseOptions.stop
    }

    if (baseOptions.frequencyPenalty !== undefined && capabilities.supportsFrequencyPenalty) {
      options.frequencyPenalty = baseOptions.frequencyPenalty
    }

    if (baseOptions.presencePenalty !== undefined && capabilities.supportsPresencePenalty) {
      options.presencePenalty = baseOptions.presencePenalty
    }

    if (baseOptions.seed !== undefined && capabilities.supportsSeed) {
      options.seed = baseOptions.seed
    }

    return options
  }

  /**
   * Check if a model supports a specific parameter
   */
  async supportsParameter(modelId: string, parameter: string): Promise<boolean> {
    const capabilities = await this.getCapabilities(modelId)
    return capabilities.supportedParameters.includes(parameter)
  }

  /**
   * Get all models that support a specific capability
   */
  async getModelsWithCapability(
    capability: keyof Omit<
      ModelCapabilities,
      'supportedParameters' | 'contextLength' | 'maxCompletionTokens' | 'modality'
    >
  ): Promise<OpenRouterModel[]> {
    const models = await this.fetchAllModels()
    const result: OpenRouterModel[] = []

    for (const model of models) {
      const caps = this.parseCapabilities(model)
      if (caps[capability]) {
        result.push(model)
      }
    }

    return result
  }

  /**
   * Get all models that support reasoning
   */
  async getReasoningModels(): Promise<OpenRouterModel[]> {
    return this.getModelsWithCapability('supportsReasoning')
  }

  /**
   * Get all models that support tools/function calling
   */
  async getToolsModels(): Promise<OpenRouterModel[]> {
    return this.getModelsWithCapability('supportsTools')
  }

  /**
   * Search models by name or ID
   */
  async searchModels(query: string): Promise<OpenRouterModel[]> {
    const models = await this.fetchAllModels()
    const lowerQuery = query.toLowerCase()

    return models.filter(
      (m) =>
        m.id.toLowerCase().includes(lowerQuery) ||
        m.name.toLowerCase().includes(lowerQuery) ||
        m.description?.toLowerCase().includes(lowerQuery)
    )
  }

  /**
   * Get model pricing information
   */
  async getModelPricing(modelId: string): Promise<{ prompt: number; completion: number } | null> {
    const model = await this.getModel(modelId)
    if (!model) return null

    return {
      prompt: parseFloat(model.pricing.prompt) || 0,
      completion: parseFloat(model.pricing.completion) || 0,
    }
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.modelCache.clear()
    this.capabilitiesCache.clear()
    this.allModelsCache = null
    this.lastFetchTime = 0
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { modelCacheSize: number; capabilitiesCacheSize: number; lastFetch: Date | null } {
    return {
      modelCacheSize: this.modelCache.size,
      capabilitiesCacheSize: this.capabilitiesCache.size,
      lastFetch: this.lastFetchTime ? new Date(this.lastFetchTime) : null,
    }
  }
}

// Export singleton instance
export const openRouterRegistry = OpenRouterModelRegistry.getInstance()

/**
 * Convenience function to get model capabilities
 */
export async function getOpenRouterModelCapabilities(modelId: string): Promise<ModelCapabilities> {
  return openRouterRegistry.getCapabilities(modelId)
}

/**
 * Convenience function to check if a model supports reasoning
 */
export async function modelSupportsReasoning(modelId: string): Promise<boolean> {
  const caps = await openRouterRegistry.getCapabilities(modelId)
  return caps.supportsReasoning || caps.supportsIncludeReasoning
}

/**
 * Convenience function to check if a model supports tools
 */
export async function modelSupportsTools(modelId: string): Promise<boolean> {
  const caps = await openRouterRegistry.getCapabilities(modelId)
  return caps.supportsTools
}
