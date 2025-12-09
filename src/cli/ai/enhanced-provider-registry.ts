import { createAnthropic } from '@ai-sdk/anthropic'
import { createCerebras } from '@ai-sdk/cerebras'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createGroq } from '@ai-sdk/groq'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createVercel } from '@ai-sdk/vercel'
import type { CoreMessage } from 'ai'
import {
  experimental_createProviderRegistry as createProviderRegistry,
  experimental_customProvider as customProvider,
} from 'ai'
import { createOllama } from 'ollama-ai-provider'

// Environment type
interface Environment {
  ANTHROPIC_API_KEY?: string
  OPENAI_API_KEY?: string
  GOOGLE_GENERATIVE_AI_API_KEY?: string
  OPENROUTER_API_KEY?: string
  V0_API_KEY?: string
  CEREBRAS_API_KEY?: string
  GROQ_API_KEY?: string
  LLAMACPP_BASE_URL?: string
  LMSTUDIO_BASE_URL?: string
}

// Enhanced OpenRouter provider with latest features
const createOpenRouterProvider = () => {
  const base = createOpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
    headers: {
      'HTTP-Referer': 'https://nikcli.mintlify.app',
      'X-Title': 'NikCLI',
      'User-Agent': 'NikCLI/1.5.0',
    },
    // Enhanced compatibility settings
    compatibility: 'strict',
  })

  return customProvider({
    languageModels: {
      // Auto Router - powered by NotDiamond
      auto: base('openrouter/auto') as any,

      // Latest GPT-5.1 Models
      'gpt-5.1': base('openai/gpt-5.1') as any,
      'gpt-5.1-chat': base('openai/gpt-5.1-chat') as any,
      'gpt-5.1-codex': base('openai/gpt-5.1-codex') as any,

      // Latest Claude 4.5 Models
      'claude-opus-4.5': base('anthropic/claude-opus-4.5') as any,
      'claude-sonnet-4.5': base('anthropic/claude-sonnet-4.5') as any,
      'claude-haiku-4.5': base('anthropic/claude-haiku-4.5') as any,

      // Latest Gemini 3 Models
      'gemini-3-pro': base('google/gemini-3-pro-preview') as any,

      // DeepSeek V3.2 (cost-effective, high quality)
      'deepseek-v3.2': base('deepseek/deepseek-v3.2') as any,
      'deepseek-v3.2-speciale': base('deepseek/deepseek-v3.2-speciale') as any,

      // MoonshotAI Kimi K2 (long-context reasoning)
      'kimi-k2-thinking': base('moonshotai/kimi-k2-thinking') as any,

      // xAI Grok Models
      'grok-4': base('xai/grok-4') as any,
      'grok-4.1-fast': base('xai/grok-4.1-fast') as any,

      // Cost-effective fallbacks
      fallback: base('minimax/minimax-m2') as any,
      cheap: base('minimax/minimax-m2') as any,

      // Semantic aliases
      fast: base('anthropic/claude-haiku-4.5') as any,
      balanced: base('anthropic/claude-sonnet-4.5') as any,
      powerful: base('openai/gpt-5.1') as any,
      reasoning: base('anthropic/claude-sonnet-4.5') as any,
      coding: base('openai/gpt-5.1-codex') as any,
    },
    fallbackProvider: base as any,
  })
}

// Anthropic provider with enhanced reasoning support
const createAnthropicProvider = () => {
  const base = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    // Enable enhanced features
    headers: {
      'anthropic-version': '2023-06-01',
    },
  })

  return customProvider({
    languageModels: {
      // Claude 4.5 Models (Latest)
      'opus-4.5': base('claude-opus-4.5') as any,
      'sonnet-4.5': base('claude-sonnet-4.5') as any,
      'haiku-4.5': base('claude-haiku-4.5') as any,

      // Claude 4 Models
      'opus-4': base('claude-opus-4-20250514') as any,
      'sonnet-4': base('claude-sonnet-4-20250514') as any,

      // Semantic aliases
      opus: base('claude-opus-4.5') as any,
      sonnet: base('claude-sonnet-4.5') as any,
      haiku: base('claude-haiku-4.5') as any,
      fast: base('claude-haiku-4.5') as any,
      balanced: base('claude-sonnet-4.5') as any,
      powerful: base('claude-opus-4.5') as any,
    },
    fallbackProvider: base as any,
  })
}

// OpenAI provider with latest models
const createOpenAIProvider = () => {
  const base = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    compatibility: 'strict',
  })

  return customProvider({
    languageModels: {
      // GPT-5.1 Models
      'gpt-5.1': base('gpt-5.1') as any,
      'gpt-5.1-chat': base('gpt-5.1-chat') as any,
      'gpt-5.1-codex': base('gpt-5.1-codex') as any,

      // Reasoning Models
      o3: base('o3') as any,
      'o4-mini': base('o4-mini') as any,

      // Semantic aliases
      fast: base('gpt-5.1-chat') as any,
      balanced: base('gpt-5.1') as any,
      powerful: base('gpt-5.1') as any,
      coding: base('gpt-5.1-codex') as any,
      reasoning: base('o3') as any,
    },
    fallbackProvider: base as any,
  })
}

// Google provider with Gemini 3
const createGoogleProvider = () => {
  const base = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  })

  return customProvider({
    languageModels: {
      // Gemini 3 Models
      '3-pro': base('gemini-3-pro-preview') as any,

      // Gemini 2.5 Models
      '2.5-pro': base('gemini-2.5-pro-preview-06-05') as any,
      '2.5-flash': base('gemini-2.5-flash-preview-05-20') as any,
      '2.5-flash-lite': base('gemini-2.5-flash-lite-preview-06-17') as any,

      // Semantic aliases
      fast: base('gemini-2.5-flash-preview-05-20') as any,
      pro: base('gemini-3-pro-preview') as any,
      lite: base('gemini-2.5-flash-lite-preview-06-17') as any,
      thinking: base('gemini-3-pro-preview') as any,
    },
    fallbackProvider: base as any,
  })
}

// Unified provider registry with enhanced features
export const enhancedProviderRegistry = createProviderRegistry({
  // Enhanced custom providers
  openrouter: createOpenRouterProvider() as any,
  anthropic: createAnthropicProvider() as any,
  openai: createOpenAIProvider() as any,
  google: createGoogleProvider() as any,

  // Direct providers
  cerebras: createCerebras({
    apiKey: process.env.CEREBRAS_API_KEY,
  }) as any,

  groq: createGroq({
    apiKey: process.env.GROQ_API_KEY,
  }) as any,

  vercel: createVercel({
    apiKey: process.env.V0_API_KEY,
  }) as any,

  ollama: createOllama({}) as any,

  // OpenAI-compatible local providers
  llamacpp: createOpenAICompatible({
    name: 'llamacpp',
    apiKey: 'llamacpp',
    baseURL: process.env.LLAMACPP_BASE_URL || 'http://localhost:8080/v1',
  }) as any,

  lmstudio: createOpenAICompatible({
    name: 'lmstudio',
    apiKey: 'lm-studio',
    baseURL: process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234/v1',
  }) as any,
} as any)

// Enhanced model selection utilities
export class EnhancedModelSelector {
  private static reasoningEnabledModels = new Set([
    'openrouter:claude-sonnet-4.5',
    'openrouter:claude-opus-4.5',
    'openrouter:gpt-5.1',
    'anthropic:sonnet-4.5',
    'anthropic:opus-4.5',
    'openai:gpt-5.1',
  ])

  private static visionCapableModels = new Set([
    'openrouter:gpt-5.1',
    'openrouter:claude-opus-4.5',
    'openrouter:gemini-3-pro',
    'openrouter:gpt-4o',
    'google:3-pro',
    'anthropic:opus-4.5',
  ])

  private static fastModels = new Set([
    'openrouter:claude-haiku-4.5',
    'openrouter:grok-4.1-fast',
    'anthropic:haiku-4.5',
    'openai:gpt-5.1-chat',
    'google:2.5-flash',
  ])

  private static powerfulModels = new Set([
    'openrouter:gpt-5.1',
    'openrouter:claude-opus-4.5',
    'openrouter:deepseek-v3.2-speciale',
    'anthropic:opus-4.5',
    'google:3-pro',
  ])

  /**
   * Get optimal model based on requirements
   */
  static selectOptimalModel(
    requirements: {
      reasoning?: boolean
      vision?: boolean
      speed?: 'fast' | 'balanced' | 'powerful'
      context?: 'small' | 'medium' | 'large'
      budget?: 'low' | 'medium' | 'high'
    } = {}
  ): string {
    const {
      reasoning = false,
      vision = false,
      speed = 'balanced',
      context = 'medium',
      budget = 'medium',
    } = requirements

    // Start with speed preference
    let candidates: Set<string>

    switch (speed) {
      case 'fast':
        candidates = EnhancedModelSelector.fastModels
        break
      case 'powerful':
        candidates = EnhancedModelSelector.powerfulModels
        break
      default:
        candidates = new Set([...EnhancedModelSelector.fastModels, ...EnhancedModelSelector.powerfulModels])
    }

    // Filter by capabilities
    if (reasoning) {
      candidates = new Set([...candidates].filter((id) => EnhancedModelSelector.reasoningEnabledModels.has(id)))
    }

    if (vision) {
      candidates = new Set([...candidates].filter((id) => EnhancedModelSelector.visionCapableModels.has(id)))
    }

    // Select first available candidate
    const selected = [...candidates][0]

    if (!selected) {
      // Fallback to safe default
      return 'openrouter:balanced'
    }

    return selected
  }

  /**
   * Get model capabilities
   */
  static getModelCapabilities(modelId: string): {
    supportsReasoning: boolean
    supportsVision: boolean
    contextLength: number
    estimatedCost: 'low' | 'medium' | 'high'
    speed: 'fast' | 'medium' | 'slow'
  } {
    const [provider, model] = modelId.split(':')

    const capabilities: {
      supportsReasoning: boolean
      supportsVision: boolean
      contextLength: number
      estimatedCost: 'low' | 'medium' | 'high'
      speed: 'fast' | 'medium' | 'slow'
    } = {
      supportsReasoning: EnhancedModelSelector.reasoningEnabledModels.has(modelId),
      supportsVision: EnhancedModelSelector.visionCapableModels.has(modelId),
      contextLength: 128000, // Default context length
      estimatedCost: 'medium',
      speed: 'medium',
    }

    // Provider-specific capabilities
    switch (provider) {
      case 'openrouter':
        if (model.includes('claude-haiku')) {
          capabilities.contextLength = 200000
          capabilities.speed = 'fast'
          capabilities.estimatedCost = 'low'
        } else if (model.includes('claude-opus')) {
          capabilities.contextLength = 200000
          capabilities.speed = 'slow'
          capabilities.estimatedCost = 'high'
          capabilities.supportsReasoning = true
        } else if (model.includes('gpt-5.1')) {
          capabilities.contextLength = 400000
          capabilities.speed = 'medium'
          capabilities.supportsReasoning = true
          capabilities.supportsVision = true
        }
        break
      case 'anthropic':
        if (model.includes('haiku')) {
          capabilities.contextLength = 200000
          capabilities.speed = 'fast'
          capabilities.estimatedCost = 'low'
        } else if (model.includes('opus')) {
          capabilities.contextLength = 200000
          capabilities.speed = 'slow'
          capabilities.estimatedCost = 'high'
          capabilities.supportsReasoning = true
        }
        break
      case 'google':
        capabilities.contextLength = 1050000 // Gemini 3 Pro
        if (model.includes('flash')) {
          capabilities.speed = 'fast'
          capabilities.estimatedCost = 'low'
        }
        break
    }

    return capabilities
  }
}

/**
 * Enhanced provider utilities
 */
export const providerUtils = {
  /**
   * Get language model with automatic fallback
   */
  getLanguageModel: (provider: string, model: string) => {
    try {
      return enhancedProviderRegistry.languageModel(`${provider}:${model}`)
    } catch (error) {
      // Fallback to balanced model
      return enhancedProviderRegistry.languageModel('openrouter:balanced')
    }
  },

  /**
   * Get text embedding model
   */
  getTextEmbeddingModel: (provider: string, model: string) => {
    return enhancedProviderRegistry.textEmbeddingModel(`${provider}:${model}`)
  },

  /**
   * Check if provider is available
   */
  isProviderAvailable: (provider: string): boolean => {
    const envVars: Record<string, string | undefined> = {
      anthropic: process.env.ANTHROPIC_API_KEY,
      openai: process.env.OPENAI_API_KEY,
      google: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      openrouter: process.env.OPENROUTER_API_KEY,
      groq: process.env.GROQ_API_KEY,
      cerebras: process.env.CEREBRAS_API_KEY,
      vercel: process.env.V0_API_KEY,
    }

    return !!envVars[provider]
  },

  /**
   * Get available providers
   */
  getAvailableProviders: (): string[] => {
    const allProviders = [
      'openrouter',
      'anthropic',
      'openai',
      'google',
      'cerebras',
      'groq',
      'vercel',
      'ollama',
      'llamacpp',
      'lmstudio',
    ]
    return allProviders.filter((provider) => providerUtils.isProviderAvailable(provider))
  },
}

/**
 * Legacy compatibility exports
 */
export const providerRegistry = enhancedProviderRegistry
export const getLanguageModel = providerUtils.getLanguageModel
export const getTextEmbeddingModel = providerUtils.getTextEmbeddingModel
