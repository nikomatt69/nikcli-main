import { experimental_createProviderRegistry as createProviderRegistry } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'

/**
 * Centralized provider registry for all AI providers
 * Uses AI SDK experimental provider management pattern
 *
 * NOTE: This is an experimental feature and may have type compatibility issues
 * with some provider implementations. Enable with USE_PROVIDER_REGISTRY=true
 */
export const providerRegistry = createProviderRegistry({
  anthropic: createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  }) as any,

  openai: createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    compatibility: 'strict',
  }) as any,

  google: createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  }) as any,

  openrouter: createOpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
    headers: {
      'HTTP-Referer': 'https://nikcli.mintlify.app',
      'X-Title': 'NikCLI',
    },
  }) as any,

  cerebras: createOpenAI({
    apiKey: process.env.CEREBRAS_API_KEY || '',
    baseURL: 'https://api.cerebras.ai/v1',
  }) as any,

  groq: createOpenAI({
    apiKey: process.env.GROQ_API_KEY || '',
    baseURL: 'https://api.groq.com/openai/v1',
  }) as any,
} as any)

/**
 * Get a language model from the registry
 * @param provider - Provider name (e.g., 'openai', 'anthropic')
 * @param modelId - Model identifier (e.g., 'gpt-4', 'claude-sonnet-4')
 * @returns Language model instance
 *
 * @example
 * const model = getLanguageModel('openai', 'gpt-4')
 * const model2 = getLanguageModel('anthropic', 'claude-sonnet-4')
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
