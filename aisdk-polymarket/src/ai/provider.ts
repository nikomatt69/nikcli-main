import { LanguageModelV1, experimental_createProviderRegistry } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

/**
 * Provider configuration
 */
export interface ProviderConfig {
  /**
   * OpenAI API key
   */
  openaiApiKey?: string;

  /**
   * Anthropic API key
   */
  anthropicApiKey?: string;

  /**
   * Google API key
   */
  googleApiKey?: string;

  /**
   * OpenRouter API key
   */
  openrouterApiKey?: string;

  /**
   * Default provider to use
   */
  defaultProvider?: 'openai' | 'anthropic' | 'google' | 'openrouter';

  /**
   * Custom model mappings
   */
  customMappings?: Record<string, () => LanguageModelV1>;
}

/**
 * Create a multi-provider registry with fallback support
 */
export function createModelProvider(config: ProviderConfig = {}) {
  const {
    openaiApiKey = process.env.OPENAI_API_KEY,
    anthropicApiKey = process.env.ANTHROPIC_API_KEY,
    googleApiKey = process.env.GOOGLE_API_KEY,
    openrouterApiKey = process.env.OPENROUTER_API_KEY,
    defaultProvider = 'openai',
    customMappings = {},
  } = config;

  // Initialize providers
  const providers: Record<string, any> = {};

  if (openaiApiKey) {
    providers.openai = createOpenAI({ apiKey: openaiApiKey });
  }

  if (anthropicApiKey) {
    providers.anthropic = createAnthropic({ apiKey: anthropicApiKey });
  }

  if (googleApiKey) {
    providers.google = createGoogleGenerativeAI({ apiKey: googleApiKey });
  }

  if (openrouterApiKey) {
    providers.openrouter = createOpenRouter({ apiKey: openrouterApiKey });
  }

  /**
   * Get a model by ID with automatic provider routing
   */
  function getModel(modelId: string): LanguageModelV1 {
    // Check custom mappings first
    if (customMappings[modelId]) {
      return customMappings[modelId]();
    }

    // Auto-detect provider from model ID
    if (modelId.startsWith('gpt-')) {
      if (!providers.openai) throw new Error('OpenAI provider not configured');
      return providers.openai(modelId);
    }

    if (modelId.startsWith('claude-')) {
      if (!providers.anthropic) throw new Error('Anthropic provider not configured');
      return providers.anthropic(modelId);
    }

    if (modelId.startsWith('gemini-') || modelId.startsWith('models/gemini-')) {
      if (!providers.google) throw new Error('Google provider not configured');
      return providers.google(modelId);
    }

    // Fallback to default provider
    const provider = providers[defaultProvider];
    if (!provider) {
      throw new Error(`Default provider ${defaultProvider} not configured`);
    }

    return provider(modelId);
  }

  /**
   * Create a fallback chain of models
   */
  function withFallback(primaryModelId: string, ...fallbackModelIds: string[]): LanguageModelV1 {
    const primary = getModel(primaryModelId);

    // AI SDK experimental_wrapLanguageModel can be used here for fallback logic
    // For now, we return the primary model
    // In a full implementation, you'd wrap this with retry/fallback logic

    return primary;
  }

  return {
    /**
     * Get a model by ID
     */
    getModel,

    /**
     * Create a fallback chain
     */
    withFallback,

    /**
     * Direct access to providers
     */
    providers,

    /**
     * Check if a provider is available
     */
    hasProvider(name: string): boolean {
      return name in providers;
    },

    /**
     * List available providers
     */
    listProviders(): string[] {
      return Object.keys(providers);
    },
  };
}

/**
 * Pre-configured model aliases
 */
export const ModelAliases = {
  // OpenAI
  GPT4: 'gpt-4-turbo-preview',
  GPT4_TURBO: 'gpt-4-turbo-preview',
  GPT35: 'gpt-3.5-turbo',
  GPT5: 'gpt-5', // When available

  // Anthropic
  CLAUDE_OPUS: 'claude-3-opus-20240229',
  CLAUDE_SONNET: 'claude-3-5-sonnet-20241022',
  CLAUDE_HAIKU: 'claude-3-haiku-20240307',

  // Google
  GEMINI_PRO: 'gemini-1.5-pro',
  GEMINI_FLASH: 'gemini-1.5-flash',
  GEMINI_ULTRA: 'gemini-ultra',
} as const;

/**
 * Utility to create a configured model provider
 */
export function setupProvider(config?: ProviderConfig) {
  return createModelProvider(config);
}

/**
 * Type helper
 */
export type ModelProvider = ReturnType<typeof createModelProvider>;
