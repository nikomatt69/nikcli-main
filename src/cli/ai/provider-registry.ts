import { createAnthropic } from '@ai-sdk/anthropic'
import { createCerebras } from '@ai-sdk/cerebras'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createGroq } from '@ai-sdk/groq'
import { createMistral } from '@ai-sdk/mistral'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createVercel } from '@ai-sdk/vercel'
import { createXai } from '@ai-sdk/xai'
import {
  experimental_createProviderRegistry as createProviderRegistry,
  experimental_customProvider as customProvider,
} from 'ai'

/**
 * OpenRouter provider with custom configuration
 * Supports all OpenRouter models dynamically
 */
const openrouterBase = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  headers: {
    'HTTP-Referer': 'https://nikcli.mintlify.app',
    'X-Title': 'NikCLI',
  },
})

/**
 * OpenRouter custom provider with model aliases and Auto Router support
 * Reference: https://openrouter.ai/docs/guides/features/model-routing
 * Updated: December 2025 with latest models from OpenRouter
 */
export const openrouterProvider = customProvider({
  languageModels: {
    // Auto Router - automatically selects best model based on prompt
    // Powered by NotDiamond: https://www.notdiamond.ai/
    auto: openrouterBase('openrouter/auto') as any,

    // === OpenAI GPT-5.1 Models (Latest - 400K context) ===
    'gpt-5.1': openrouterBase('openai/gpt-5.1') as any, // 400K context, $1.25/M input, $10/M output
    'gpt-5.1-chat': openrouterBase('openai/gpt-5.1-chat') as any, // 128K context, fast
    'gpt-5.1-codex': openrouterBase('openai/gpt-5.1-codex') as any, // 400K context, coding optimized
    'gpt-5.1-codex-mini': openrouterBase('openai/gpt-5.1-codex-mini') as any, // 400K context, $0.25/M input

    // === Anthropic Claude 4.5 Models (Latest - 200K-1M context) ===
    'claude-opus-4.5': openrouterBase('anthropic/claude-opus-4.5') as any, // 200K context, $5/M input, $25/M output
    'claude-sonnet-4.5': openrouterBase('anthropic/claude-sonnet-4.5') as any, // 1M context, $3/M input, $15/M output
    'claude-haiku-4.5': openrouterBase('anthropic/claude-haiku-4.5') as any, // 200K context, $1/M input, $5/M output

    // === Anthropic Claude 4 Models (Fallback tier) ===
    'claude-sonnet-4': openrouterBase('anthropic/claude-sonnet-4-20250514') as any,
    'claude-opus-4': openrouterBase('anthropic/claude-opus-4-20250514') as any,
    'claude-3.7-sonnet': openrouterBase('anthropic/claude-3.7-sonnet') as any,
    'claude-3.5-sonnet': openrouterBase('anthropic/claude-3-5-sonnet-20241022') as any,
    'claude-3.5-haiku': openrouterBase('anthropic/claude-3-5-haiku-20241022') as any,

    // === Google Gemini 3 Models (Latest - 1M context) ===
    'gemini-3-pro': openrouterBase('google/gemini-3-pro-preview') as any, // 1.05M context, $2/M input, $12/M output

    // === Google Gemini 2.5 Models (Fallback tier) ===
    'gemini-2.5-pro': openrouterBase('google/gemini-2.5-pro') as any,

    // === DeepSeek V3.2 Models (Latest - 131K context) ===
    'deepseek-v3.2-speciale': openrouterBase('deepseek/deepseek-v3.2-speciale') as any, // High-compute, max reasoning
    'deepseek-v3.2': openrouterBase('deepseek/deepseek-v3.2') as any, // 131K context, $0.28/M input

    // === MoonshotAI Kimi K2 Models (Latest - 262K context) ===
    'kimi-k2-thinking': openrouterBase('moonshotai/kimi-k2-thinking') as any, // 262K context, long-horizon reasoning
    'kimi-k2-0905': openrouterBase('moonshotai/kimi-k2-0905') as any, // 1T params, 32B active

    // === xAI Grok Models (131K context) ===
    'grok-4-fast': openrouterBase('xai/grok-4-fast') as any, // 131K context, frontier reasoning
    'grok-4.1-fast:free': openrouterBase('xai/grok-4.1-fast:free') as any, // Free tier

    // === Mistral AI Models ===

    // === Model Aliases for common use cases ===
    // Fast tier - use Claude Haiku 4.5 (best price/performance)
    fast: openrouterBase('anthropic/claude-haiku-4.5') as any,
    // Balanced tier - use Claude Sonnet 4.5
    balanced: openrouterBase('anthropic/claude-sonnet-4.5') as any,
    // Powerful tier - use GPT-5.1 or Claude Opus 4.5
    powerful: openrouterBase('openai/gpt-5.1') as any,
    // Reasoning tier - use Claude Sonnet 4.5 (1M context)
    reasoning: openrouterBase('anthropic/claude-sonnet-4.5') as any,
    // Coding tier - use GPT-5.1-Codex (optimized for coding)
    coding: openrouterBase('openai/gpt-5.1-codex') as any,

    // === Cost-effective fallbacks (MiniMax M2) ===
    'minimax-m2': openrouterBase('minimax/minimax-m2') as any,
    fallback: openrouterBase('minimax/minimax-m2') as any,
    cheap: openrouterBase('minimax/minimax-m2') as any,
  },
  // Fallback to base provider for any model not in aliases
  fallbackProvider: openrouterBase as any,
})

/**
 * Anthropic custom provider with model aliases
 * Updated: December 2025 with Claude 4.5 models
 */
const anthropicBase = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export const anthropicProvider = customProvider({
  languageModels: {
    // === Claude 4.5 Models (Latest) ===
    'opus-4.5': anthropicBase('claude-opus-4.5') as any, // 200K context, frontier reasoning
    'sonnet-4.5': anthropicBase('claude-sonnet-4.5') as any, // 1M context, best for agents/coding
    'haiku-4.5': anthropicBase('claude-haiku-4.5') as any, // 200K context, fastest

    // === Claude 4 Models (Fallback tier) ===
    'sonnet-4': anthropicBase('claude-sonnet-4-20250514') as any,
    'opus-4': anthropicBase('claude-opus-4-20250514') as any,

    // === Claude 3.7 Models ===
    'sonnet-3.7': anthropicBase('claude-3-7-sonnet-20250219') as any,

    // === Claude 3.5 Models (Legacy) ===
    'sonnet-3.5': anthropicBase('claude-3-5-sonnet-20241022') as any,
    'haiku-3.5': anthropicBase('claude-3-5-haiku-20241022') as any,

    // === Aliases ===
    fast: anthropicBase('claude-haiku-4.5') as any,
    balanced: anthropicBase('claude-sonnet-4.5') as any,
    powerful: anthropicBase('claude-opus-4.5') as any,
    opus: anthropicBase('claude-opus-4.5') as any,
    reasoning: anthropicBase('claude-sonnet-4.5') as any,
  },
  fallbackProvider: anthropicBase as any,
})

/**
 * OpenAI custom provider with model aliases
 * Updated: December 2025 with GPT-5.1 models
 */
const openaiBase = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  compatibility: 'strict',
})

export const openaiProvider = customProvider({
  languageModels: {
    // === GPT-5.1 Models (Latest) ===
    'gpt-5.1': openaiBase('gpt-5.1') as any, // 400K context, frontier
    'gpt-5.1-chat': openaiBase('gpt-5.1-chat') as any, // 128K context, fast chat
    'gpt-5.1-codex': openaiBase('gpt-5.1-codex') as any, // 400K context, coding
    'gpt-5.1-codex-mini': openaiBase('gpt-5.1-codex-mini') as any, // 400K context, fast coding

    // === GPT-5 Models (Fallback tier) ===
    'gpt-5': openaiBase('gpt-5') as any,
    'gpt-4.1': openaiBase('gpt-4.1') as any,
    'gpt-4.1-mini': openaiBase('gpt-4.1-mini') as any,
    'gpt-4.1-nano': openaiBase('gpt-4.1-nano') as any,
    'gpt-4o': openaiBase('gpt-4o') as any,
    'gpt-4o-mini': openaiBase('gpt-4o-mini') as any,

    // === Reasoning Models ===
    o3: openaiBase('o3') as any,
    'o4-mini': openaiBase('o4-mini') as any,
    o1: openaiBase('o1') as any,
    'o1-mini': openaiBase('o1-mini') as any,

    // === Aliases ===
    fast: openaiBase('gpt-5.1-chat') as any,
    balanced: openaiBase('gpt-5.1') as any,
    powerful: openaiBase('gpt-5.1') as any,
    coding: openaiBase('gpt-5.1-codex') as any,
    'coding-mini': openaiBase('gpt-5.1-codex-mini') as any,
    reasoning: openaiBase('o3') as any,
    'reasoning-mini': openaiBase('o4-mini') as any,
  },
  fallbackProvider: openaiBase as any,
})

/**
 * Google custom provider with model aliases
 * Updated: December 2025 with Gemini 3 models
 */
const googleBase = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
})

export const googleProvider = customProvider({
  languageModels: {
    // === Gemini 3 Models (Latest) ===
    '3-pro': googleBase('gemini-3-pro-preview') as any, // 1.05M context, multimodal reasoning

    // === Gemini 2.5 Models (Fallback tier) ===
    '2.5-pro': googleBase('gemini-2.5-pro-preview-06-05') as any,
    '2.5-flash': googleBase('gemini-2.5-flash-preview-05-20') as any,
    '2.5-flash-lite': googleBase('gemini-2.5-flash-lite-preview-06-17') as any,

    // === Gemini 2.0 Models (Legacy) ===
    '2.0-flash': googleBase('gemini-2.0-flash') as any,
    '2.0-flash-lite': googleBase('gemini-2.0-flash-lite') as any,

    // === Aliases ===
    fast: googleBase('gemini-2.5-flash-preview-05-20') as any,
    pro: googleBase('gemini-3-pro-preview') as any,
    lite: googleBase('gemini-2.5-flash-lite-preview-06-17') as any,
    thinking: googleBase('gemini-3-pro-preview') as any,
  },
  fallbackProvider: googleBase as any,
})

/**
 * Centralized provider registry for all AI providers
 * Uses AI SDK experimental provider management pattern
 * Reference: https://v4.ai-sdk.dev/docs/ai-sdk-core/provider-management
 */
export const providerRegistry = createProviderRegistry({
  // Custom providers with aliases
  anthropic: anthropicProvider as any,
  openai: openaiProvider as any,
  google: googleProvider as any,
  openrouter: openrouterProvider as any,

  // Direct providers (no aliases needed)
  cerebras: createCerebras({
    apiKey: process.env.CEREBRAS_API_KEY,
  }) as any,

  groq: createGroq({
    apiKey: process.env.GROQ_API_KEY,
  }) as any,

  vercel: createVercel({
    apiKey: process.env.V0_API_KEY,
  }) as any,

  // xAI (Grok) provider
  xai: createXai({
    apiKey: process.env.XAI_API_KEY,
  }) as any,

  // Mistral AI provider
  mistral: createMistral({
    apiKey: process.env.MISTRAL_API_KEY,
  }) as any,

  // OpenAI-compatible providers
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

/**
 * Get a language model from the registry
 * Supports both direct model IDs and aliases
 *
 * @param provider - Provider name (e.g., 'openai', 'anthropic', 'openrouter')
 * @param modelId - Model identifier or alias (e.g., 'gpt-5.1', 'fast', 'auto')
 * @returns Language model instance
 *
 * @example
 * // Direct model
 * const model = getLanguageModel('openai', 'gpt-5.1')
 *
 * // Using alias
 * const fastModel = getLanguageModel('anthropic', 'fast')
 *
 * // OpenRouter Auto Router
 * const autoModel = getLanguageModel('openrouter', 'auto')
 */
export function getLanguageModel(provider: string, modelId: string) {
  return providerRegistry.languageModel(`${provider}:${modelId}`)
}

/**
 * Get a text embedding model from the registry
 * @param provider - Provider name
 * @param modelId - Model identifier
 * @returns Text embedding model instance
 *
 * @example
 * const embedder = getTextEmbeddingModel('openai', 'text-embedding-3-small')
 */
export function getTextEmbeddingModel(provider: string, modelId: string) {
  return providerRegistry.textEmbeddingModel(`${provider}:${modelId}`)
}

/**
 * Model aliases for quick access
 * Maps semantic names to provider:model pairs
 * Updated: December 2025 with latest models
 */
export const MODEL_ALIASES: Record<string, { provider: string; model: string }> = {
  // === Speed-optimized ===
  fast: { provider: 'openrouter', model: 'anthropic/claude-haiku-4.5' },
  'ultra-fast': { provider: 'groq', model: 'llama-3.1-8b-instant' },

  // === Balanced ===
  balanced: { provider: 'openrouter', model: 'anthropic/claude-sonnet-4.5' },
  default: { provider: 'openrouter', model: 'anthropic/claude-sonnet-4.5' },

  // === Powerful ===
  powerful: { provider: 'openrouter', model: 'openai/gpt-5.1' },
  opus: { provider: 'openrouter', model: 'anthropic/claude-opus-4.5' },
  frontier: { provider: 'openrouter', model: 'openai/gpt-5.1' },

  // === Reasoning ===
  reasoning: { provider: 'openrouter', model: 'anthropic/claude-sonnet-4.5' },
  'deep-thinking': { provider: 'openrouter', model: 'google/gemini-3-pro-preview' },

  // === Coding ===
  coding: { provider: 'openrouter', model: 'openai/gpt-5.1-codex' },
  'code-fast': { provider: 'openrouter', model: 'openai/gpt-5.1-codex-mini' },

  // === DeepSeek V3.2 (cost-effective, high quality) ===
  deepseek: { provider: 'openrouter', model: 'deepseek/deepseek-v3.2' },
  'deepseek-speciale': { provider: 'openrouter', model: 'deepseek/deepseek-v3.2-speciale' },

  // === MoonshotAI Kimi K2 (long-context reasoning) ===
  kimi: { provider: 'openrouter', model: 'moonshotai/kimi-k2-0905' },
  'kimi-thinking': { provider: 'openrouter', model: 'moonshotai/kimi-k2-thinking' },

  // === xAI Grok (fast reasoning) ===
  grok: { provider: 'openrouter', model: 'xai/grok-4-fast' },
  'grok-free': { provider: 'openrouter', model: 'xai/grok-4.1-fast:free' },

  // === Auto (OpenRouter Auto Router) ===
  auto: { provider: 'openrouter', model: 'openrouter/auto' },

  // === Cost-effective fallbacks (MiniMax M2) ===
  fallback: { provider: 'openrouter', model: 'minimax/minimax-m2' },
  'minimax-m2': { provider: 'openrouter', model: 'minimax/minimax-m2' },
  cheap: { provider: 'openrouter', model: 'minimax/minimax-m2' },
}

/**
 * Resolve a model alias to provider and model
 */
export function resolveModelAlias(alias: string): { provider: string; model: string } | null {
  return MODEL_ALIASES[alias] || null
}
