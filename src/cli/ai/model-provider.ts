import { createAnthropic } from '@ai-sdk/anthropic'
import { createCerebras } from '@ai-sdk/cerebras'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createGroq } from '@ai-sdk/groq'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createVercel } from '@ai-sdk/vercel'
import { generateObject, generateText, streamText } from 'ai'

import { createOllama } from 'ollama-ai-provider'
import { z } from 'zod'

import { configManager, type ModelConfig } from '../core/config-manager'
import { streamttyService } from '../services/streamtty-service'
import { adaptiveModelRouter, type ModelScope } from './adaptive-model-router'
import { openRouterRegistry } from './openrouter-model-registry'
import { ReasoningDetector } from './reasoning-detector'

// ====================== ⚡︎ ZOD VALIDATION SCHEMAS ======================

// Chat Message Schema
export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1),
  timestamp: z.date().optional(),
})

// Generate Options Schema
export const GenerateOptionsSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(80000).optional(),
  stream: z.boolean().optional(),
  // Routing hints (optional)
  scope: z.enum(['chat_default', 'planning', 'code_gen', 'tool_light', 'tool_heavy', 'vision']).optional(),
  needsVision: z.boolean().optional(),
  sizeHints: z.object({ fileCount: z.number().optional(), totalBytes: z.number().optional() }).optional(),
  // Reasoning options
  enableReasoning: z.boolean().optional(),
  showReasoningProcess: z.boolean().optional(),
  // OpenRouter reasoning configuration
  reasoning: z
    .object({
      effort: z.enum(['high', 'medium', 'low']).optional(),
      max_tokens: z.number().int().min(1024).max(32000).optional(),
      exclude: z.boolean().optional(),
      enabled: z.boolean().optional(),
    })
    .optional(),
  // OpenRouter Web Search - enables :online suffix for real-time web data
  enableWebSearch: z.boolean().optional(),
  // Control parallel tool execution (default: true)
  parallelToolCalls: z.boolean().optional(),
  // OpenRouter transforms (e.g., ["middle-out"] for context compression)
  transforms: z.array(z.string()).optional(),
})

// Model Response Schema
export const ModelResponseSchema = z.object({
  text: z.string(),
  usage: z
    .object({
      promptTokens: z.number().int().min(0),
      completionTokens: z.number().int().min(0),
      totalTokens: z.number().int().min(0),
    })
    .optional(),
  finishReason: z.enum(['stop', 'length', 'content-filter', 'tool-calls']).optional(),
  warnings: z.array(z.string()).optional(),
  // Reasoning fields
  reasoning: z.any().optional(),
  reasoningText: z.string().optional(),
})

// Export Zod inferred types
export type ChatMessage = z.infer<typeof ChatMessageSchema>
export type GenerateOptions = z.infer<typeof GenerateOptionsSchema>
export type ModelResponse = z.infer<typeof ModelResponseSchema>

// Legacy interfaces (deprecated - use Zod schemas above)

/**
 * OpenRouter Zero Completion Insurance configuration
 * Reference: https://openrouter.ai/docs/guides/features/zero-completion-insurance
 */
const ZERO_COMPLETION_CONFIG = {
  maxRetries: 3,
  retryDelayMs: 1000,
  enableLogging: true,
}

/**
 * Check if response qualifies for Zero Completion Insurance (no charge)
 */
function isZeroCompletionResponse(result: any): boolean {
  const usage = result?.usage || result?.experimental_providerMetadata?.usage
  const finishReason = result?.finishReason || result?.finish_reason

  if (usage?.completionTokens === 0 || usage?.completion_tokens === 0) {
    if (!finishReason || finishReason === '' || finishReason === 'error') {
      return true
    }
  }

  if ((!result?.text || result.text.trim() === '') && (!result?.toolCalls || result.toolCalls.length === 0)) {
    if (!finishReason || finishReason === 'error') {
      return true
    }
  }

  return false
}

export class ModelProvider {
  /**
   * Determine if reasoning should be enabled for the current request
   */
  private shouldEnableReasoning(options: GenerateOptions, config: ModelConfig): boolean {
    const globalReasoningConfig = configManager.get('reasoning')

    // If reasoning is globally disabled, don't enable
    if (!globalReasoningConfig.enabled) {
      return false
    }

    // If explicit option provided, use it
    if (options.enableReasoning !== undefined) {
      return options.enableReasoning
    }

    // If model has explicit reasoning config, use it
    if (config.enableReasoning !== undefined) {
      return config.enableReasoning
    }

    // If auto-detect is enabled, check model capabilities
    if (globalReasoningConfig.autoDetect) {
      return ReasoningDetector.shouldEnableReasoning(config.provider, config.model)
    }

    return false
  }

  /**
   * Log reasoning information if enabled
   */
  private logReasoning(provider: string, modelId: string, reasoningEnabled: boolean): void {
    const globalReasoningConfig = configManager.get('reasoning')

    if (globalReasoningConfig.logReasoning) {
      const _capabilities = ReasoningDetector.detectReasoningSupport(provider, modelId)
      const summary = ReasoningDetector.getModelReasoningSummary(provider, modelId)

      try {
        const nik = (global as any).__nikCLI
        const msg = `[Reasoning] ${modelId}: ${summary} - ${reasoningEnabled ? 'ENABLED' : 'DISABLED'}`
        if (nik?.advancedUI) {
          nik.advancedUI.logInfo('Reasoning System', msg)
        } else {
          console.log(require('chalk').dim(msg))
        }
      } catch {
        // Fallback logging
        console.log(`[Reasoning] ${modelId}: ${reasoningEnabled ? 'ENABLED' : 'DISABLED'}`)
      }
    }
  }

  /**
   * Execute with Zero Completion Insurance retry logic
   * Auto-retries on zero completion responses (OpenRouter doesn't charge for these)
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: string,
    maxRetries = ZERO_COMPLETION_CONFIG.maxRetries
  ): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation()

        if (isZeroCompletionResponse(result) && attempt < maxRetries) {
          if (ZERO_COMPLETION_CONFIG.enableLogging) {
            console.log(
              require('chalk').dim(
                `[ZeroCompletion] ${context}: Empty response (attempt ${attempt}/${maxRetries}), retrying...`
              )
            )
          }
          await new Promise((r) => setTimeout(r, ZERO_COMPLETION_CONFIG.retryDelayMs * attempt))
          continue
        }

        return result
      } catch (error: any) {
        lastError = error

        if (attempt < maxRetries && this.isRetryableError(error)) {
          if (ZERO_COMPLETION_CONFIG.enableLogging) {
            console.log(require('chalk').dim(`[Retry] ${context}: ${error.message} (attempt ${attempt}/${maxRetries})`))
          }
          await new Promise((r) => setTimeout(r, ZERO_COMPLETION_CONFIG.retryDelayMs * attempt))
          continue
        }

        throw error
      }
    }

    throw lastError || new Error(`${context}: Max retries exceeded`)
  }

  /**
   * Check if error is retryable (rate limits, transient failures)
   */
  private isRetryableError(error: any): boolean {
    const message = error?.message?.toLowerCase() || ''
    const status = error?.status || error?.statusCode

    if (status === 429 || message.includes('rate limit') || message.includes('too many requests')) {
      return true
    }

    if (status >= 500 && status < 600) {
      return true
    }

    if (message.includes('network') || message.includes('timeout') || message.includes('econnreset')) {
      return true
    }

    return false
  }

  private getModel(config: ModelConfig) {
    const currentModelName = configManager.get('currentModel')

    // Try provider registry first (optional, experimental)
    if (process.env.USE_PROVIDER_REGISTRY === 'true') {
      try {
        const { getLanguageModel } = require('./provider-registry')
        return getLanguageModel(config.provider, config.model)
      } catch (error) {
        // Fall through to legacy implementation
      }
    }

    switch (config.provider) {
      case 'openai': {
        const apiKey = configManager.getApiKey(currentModelName)
        if (!apiKey) {
          throw new Error(`API key not found for model: ${currentModelName} (OpenAI). Use /set-key to configure.`)
        }
        const openaiProvider = createOpenAI({ apiKey, compatibility: 'strict' })
        return openaiProvider(config.model)
      }
      case 'anthropic': {
        const apiKey = configManager.getApiKey(currentModelName)
        if (!apiKey) {
          throw new Error(`API key not found for model: ${currentModelName} (Anthropic). Use /set-key to configure.`)
        }
        const anthropicProvider = createAnthropic({ apiKey })
        return anthropicProvider(config.model)
      }
      case 'vercel': {
        const apiKey = configManager.getApiKey(currentModelName)
        if (!apiKey) {
          throw new Error(
            `API key not found for model: ${currentModelName} (Vercel v0). Use /set-key to configure V0_API_KEY.`
          )
        }
        const vercelProvider = createVercel({ apiKey })
        return vercelProvider(config.model)
      }
      case 'google': {
        const apiKey = configManager.getApiKey(currentModelName)
        if (!apiKey) {
          throw new Error(`API key not found for model: ${currentModelName} (Google). Use /set-key to configure.`)
        }
        const googleProvider = createGoogleGenerativeAI({ apiKey })
        return googleProvider(config.model)
      }
      case 'gateway': {
        const apiKey = configManager.getApiKey(currentModelName)
        if (!apiKey) {
          throw new Error(`API key not found for model: ${currentModelName} (Gateway). Use /set-key to configure.`)
        }
        const gatewayProvider = createOpenAICompatible({
          name: 'ai-gateway',
          apiKey,
          baseURL: 'https://ai-gateway.vercel.sh/v1',
        })
        return gatewayProvider(config.model)
      }
      case 'openrouter': {
        let apiKey = configManager.getApiKey(currentModelName)
        // Fallback to shared alias or env (NikCLI-issued key)
        if (!apiKey) {
          apiKey = configManager.getApiKey('openrouter') || process.env.OPENROUTER_API_KEY
        }
        if (!apiKey) {
          throw new Error(
            `API key not found for model: ${currentModelName} (OpenRouter). Use /set-key openrouter <key> to configure.`
          )
        }

        // Detect model type and use appropriate provider
        const modelName = config.model as string
        let provider: any

        if (modelName.startsWith('google/')) {
          // Google models via OpenRouter - use OpenAI-compatible but with Google routing
          provider = createOpenAI({
            apiKey,
            baseURL: 'https://openrouter.ai/api/v1',
            headers: {
              'HTTP-Referer': 'https://nikcli.mintlify.app',
              'X-Title': 'NikCLI',
            },
          })
        } else if (modelName.startsWith('openai/')) {
          // OpenAI models via OpenRouter - use standard OpenAI-compatible
          // Note: Some models may not exist on OpenRouter (like gpt-5.1-codex-mini)
          // In that case, OpenRouter will handle the error or use an available equivalent
          provider = createOpenAI({
            apiKey,
            baseURL: 'https://openrouter.ai/api/v1',
            headers: {
              'HTTP-Referer': 'https://nikcli.mintlify.app',
              'X-Title': 'NikCLI',
            },
          })
        } else {
          // Other providers via OpenRouter (anthropic, etc)
          provider = createOpenAI({
            apiKey,
            baseURL: 'https://openrouter.ai/api/v1',
            headers: {
              'HTTP-Referer': 'https://nikcli.mintlify.app',
              'X-Title': 'NikCLI',
            },
          })
        }

        // OpenRouter Web Search: append :online suffix for real-time web data
        // Reference: https://openrouter.ai/docs/guides/features/web-search
        let modelId = config.model
        if ((config as any).enableWebSearch && !modelId.endsWith(':online')) {
          modelId = `${modelId}:online`
        }
        return provider(modelId)
      }
      case 'ollama': {
        // Ollama does not require API keys; assumes local daemon at default endpoint
        const ollamaProvider = createOllama({})
        return ollamaProvider(config.model)
      }
      case 'cerebras': {
        const apiKey = configManager.getApiKey(currentModelName)
        if (!apiKey) {
          throw new Error(`API key not found for model: ${currentModelName} (Cerebras). Use /set-key to configure.`)
        }
        const cerebrasProvider = createCerebras({ apiKey })
        return cerebrasProvider(config.model)
      }
      case 'groq': {
        const apiKey = configManager.getApiKey(currentModelName)
        if (!apiKey) {
          throw new Error(`API key not found for model: ${currentModelName} (Groq). Use /set-key to configure.`)
        }
        const groqProvider = createGroq({ apiKey })
        return groqProvider(config.model)
      }
      case 'llamacpp': {
        // LlamaCpp uses OpenAI-compatible API; assumes local server at default endpoint
        const llamacppProvider = createOpenAICompatible({
          name: 'llamacpp',
          apiKey: 'llamacpp', // LlamaCpp doesn't require a real API key for local server
          baseURL: process.env.LLAMACPP_BASE_URL || 'http://localhost:8080/v1',
        })
        return llamacppProvider(config.model)
      }
      case 'lmstudio': {
        // LMStudio uses OpenAI-compatible API; assumes local server at default endpoint
        const lmstudioProvider = createOpenAICompatible({
          name: 'lmstudio',
          apiKey: 'lm-studio', // LMStudio doesn't require a real API key
          baseURL: process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234/v1',
        })
        return lmstudioProvider(config.model)
      }
      case 'openai-compatible': {
        const apiKey = configManager.getApiKey(currentModelName)
        if (!apiKey) {
          throw new Error(
            `API key not found for model: ${currentModelName} (OpenAI-compatible). Use /set-key to configure.`
          )
        }
        const baseURL = (config as any).baseURL || process.env.OPENAI_COMPATIBLE_BASE_URL
        if (!baseURL) {
          throw new Error(
            `Base URL not configured for OpenAI-compatible provider (${currentModelName}). Set baseURL in config or OPENAI_COMPATIBLE_BASE_URL.`
          )
        }
        const compatProvider = createOpenAICompatible({
          name: (config as any).name || 'openai-compatible',
          apiKey,
          baseURL,
          headers: (config as any).headers,
        })
        return compatProvider(config.model)
      }
      default:
        throw new Error(`Unsupported provider: ${config.provider}`)
    }
  }

  async generateResponse(options: GenerateOptions): Promise<string> {
    // 🔍 Validate input options with Zod schema
    const validatedOptions = GenerateOptionsSchema.parse(options)

    const currentModelName = configManager.getCurrentModel()
    const models = configManager.get('models')
    const currentModelConfig = models[currentModelName]

    if (!currentModelConfig) {
      throw new Error(`Model configuration not found for: ${currentModelName}`)
    }

    // Check if reasoning should be enabled for this request
    const reasoningEnabled = this.shouldEnableReasoning(validatedOptions, currentModelConfig)
    this.logReasoning(currentModelConfig.provider, currentModelConfig.model, reasoningEnabled)

    // Choose adaptive model variant based on complexity and scope (if routing enabled)
    const routingCfg = configManager.get('modelRouting')
    let effectiveModelId = currentModelConfig.model
    if (routingCfg?.enabled) {
      const decision = await adaptiveModelRouter.choose({
        provider: currentModelConfig.provider as any,
        baseModel: currentModelConfig.model,
        messages: validatedOptions.messages,
        scope: (validatedOptions as any).scope as ModelScope | undefined,
        needsVision: (validatedOptions as any).needsVision,
        sizeHints: {
          ...(validatedOptions as any).sizeHints,
          toolCount: (validatedOptions as any).tools?.length || 0,
        },
      })
      effectiveModelId = decision.selectedModel
      // Light log if verbose
      try {
        if (routingCfg.verbose) {
          const nik = (global as any).__nikCLI
          const msg = `[Router] ${currentModelName} → ${decision.selectedModel} (${decision.tier}, ~${decision.estimatedTokens} tok)`
          if (nik?.advancedUI) nik.advancedUI.logInfo('Model Router', msg)
          else console.log(require('chalk').dim(msg))
        }
      } catch { }
    }
    const effectiveConfig: ModelConfig = { ...currentModelConfig, model: effectiveModelId } as ModelConfig
    // Enforce light quota check for OpenRouter usage if authenticated
    try {
      if (effectiveConfig.provider === 'openrouter') {
        const { authProvider } = await import('../providers/supabase/auth-provider')
        if (authProvider.isAuthenticated()) {
          const apiQuota = authProvider.checkQuota('apiCalls')
          if (!apiQuota.allowed) {
            throw new Error(`API quota exceeded (${apiQuota.used}/${apiQuota.limit}). Try again later.`)
          }
        }
      }
    } catch (_) { }

    const model = this.getModel(effectiveConfig)

    const baseOptions: Parameters<typeof generateText>[0] = {
      model: model as any,
      messages: validatedOptions.messages.map((msg) => ({ role: msg.role, content: msg.content })),
    }
    // Always honor explicit user settings for all providers
    if (validatedOptions.maxTokens != null) {
      baseOptions.maxTokens = validatedOptions.maxTokens
    } else if (currentModelConfig.provider === 'openrouter') {
      // OpenRouter needs maxTokens set for all models
      baseOptions.maxTokens = 6000
    } else if (currentModelConfig.provider !== 'openai') {
      baseOptions.maxTokens = 6000 // provider-specific default when not supplied
    }
    const resolvedTemp = validatedOptions.temperature ?? configManager.get('temperature')
    if (resolvedTemp != null) {
      baseOptions.temperature = resolvedTemp
    } else if (currentModelConfig.provider === 'openrouter') {
      // OpenRouter requires temperature = 1 for all models
      baseOptions.temperature = 1.0
    }

    // OpenRouter-specific parameters support - dynamic based on model capabilities
    if (effectiveConfig.provider === 'openrouter') {
      if (!baseOptions.experimental_providerMetadata) {
        baseOptions.experimental_providerMetadata = {}
      }
      if (!baseOptions.experimental_providerMetadata.openrouter) {
        baseOptions.experimental_providerMetadata.openrouter = {}
      }

      // Fetch model capabilities and build parameters dynamically
      try {
        const modelCaps = await openRouterRegistry.getCapabilities(effectiveConfig.model)

        // Only add reasoning parameters if model supports them
        if (reasoningEnabled && (modelCaps.supportsReasoning || modelCaps.supportsIncludeReasoning)) {
          if (modelCaps.supportsIncludeReasoning) {
            baseOptions.experimental_providerMetadata.openrouter.include_reasoning = true
          }
          if (modelCaps.supportsReasoningEffort) {
            const reasoningConfig = validatedOptions.reasoning || {
              effort: 'medium',
              exclude: false,
              enabled: true,
            }
            baseOptions.experimental_providerMetadata.openrouter.reasoning = reasoningConfig
          }
        }

        // Transforms parameter support (e.g., middle-out for context compression)
        const transforms = (effectiveConfig as any).transforms || configManager.get('openrouterTransforms')
        if (transforms && Array.isArray(transforms) && transforms.length > 0) {
          baseOptions.experimental_providerMetadata.openrouter.transforms = transforms
        } else {
          baseOptions.experimental_providerMetadata.openrouter.transforms = ['middle-out']
        }
      } catch {
        // Fallback to default if registry fails
        if (reasoningEnabled) {
          const reasoningConfig = validatedOptions.reasoning || {
            effort: 'medium',
            exclude: false,
            enabled: true,
          }
            ; (reasoningConfig as any).include_reasoning = (reasoningConfig as any).include_reasoning ?? true
          baseOptions.experimental_providerMetadata.openrouter.reasoning = reasoningConfig
        }
        const transforms = (effectiveConfig as any).transforms || configManager.get('openrouterTransforms')
        if (transforms && Array.isArray(transforms) && transforms.length > 0) {
          baseOptions.experimental_providerMetadata.openrouter.transforms = transforms
        } else {
          baseOptions.experimental_providerMetadata.openrouter.transforms = ['middle-out']
        }
      }

      // Prompt caching (OpenRouter-only) - applied only if enabled in config
      const cacheCfg = configManager.get('openrouterPromptCache')
      if (cacheCfg?.enabled) {
        const cache: any = {}
        if (cacheCfg.mode) cache.mode = cacheCfg.mode
        if (cacheCfg.ttl) cache.ttl = cacheCfg.ttl
        baseOptions.experimental_providerMetadata.openrouter.cache = cache
      }
    }
    // Execute with Zero Completion Insurance retry logic
    const result = await this.executeWithRetry(() => generateText(baseOptions), 'generateResponse')

    // Check for zero completion response after all retries
    if (isZeroCompletionResponse(result)) {
      console.log(require('chalk').yellow('[ZeroCompletion] Protected response - no charges applied'))
    }

    // Record usage for OpenRouter (only if successful completion)
    try {
      if (effectiveConfig.provider === 'openrouter' && !isZeroCompletionResponse(result)) {
        const { authProvider } = await import('../providers/supabase/auth-provider')
        if (authProvider.isAuthenticated()) {
          await authProvider.recordUsage('apiCalls', 1)
        }
      }
    } catch (_) { }

    // Extract reasoning if available and display if requested
    if (reasoningEnabled) {
      const reasoningData = ReasoningDetector.extractReasoning(result, currentModelConfig.provider)
      const globalReasoningConfig = configManager.get('reasoning')

      if (
        reasoningData.reasoningText &&
        (globalReasoningConfig.showReasoningProcess || validatedOptions.showReasoningProcess)
      ) {
        try {
          const nik = (global as any).__nikCLI
          if (nik?.advancedUI) {
            nik.advancedUI.logInfo('Model Reasoning', reasoningData.reasoningText)
          } else {
            console.log(require('chalk').cyan('\n⚡︎ Model Reasoning:'))
            console.log(require('chalk').gray(reasoningData.reasoningText))
            console.log('')
          }
        } catch {
          // Fallback display
          console.log('\n⚡︎ Model Reasoning:', reasoningData.reasoningText, '\n')
        }
      }
    }

    return result.text
  }

  async *streamResponse(options: GenerateOptions): AsyncGenerator<string, void, unknown> {
    // 🔍 Validate input options with Zod schema
    const validatedOptions = GenerateOptionsSchema.parse(options)

    const currentModelName = configManager.getCurrentModel()
    const models = configManager.get('models')
    const currentModelConfig = models[currentModelName]

    if (!currentModelConfig) {
      throw new Error(`Model configuration not found for: ${currentModelName}`)
    }

    // Check if reasoning should be enabled for this request
    const reasoningEnabled = this.shouldEnableReasoning(validatedOptions, currentModelConfig)
    this.logReasoning(currentModelConfig.provider, currentModelConfig.model, reasoningEnabled)

    // 🚀 OPTIMIZATION: Start model routing decision in parallel while outputting reasoning
    // This eliminates blocking: routing happens during reasoning output instead of after
    const routingCfg2 = configManager.get('modelRouting')
    let routingPromise: Promise<any> | null = null
    let effectiveModelId2 = currentModelConfig.model

    if (routingCfg2?.enabled) {
      // Start routing decision asynchronously
      routingPromise = adaptiveModelRouter.choose({
        provider: currentModelConfig.provider as any,
        baseModel: currentModelConfig.model,
        messages: validatedOptions.messages,
        scope: (validatedOptions as any).scope as ModelScope | undefined,
        needsVision: (validatedOptions as any).needsVision,
        sizeHints: (validatedOptions as any).sizeHints,
      })
    }

    // Show reasoning summary before streaming if enabled - format as markdown blockquote
    // This happens in parallel with routing decision
    if (reasoningEnabled) {
      const summary = ReasoningDetector.getModelReasoningSummary(currentModelConfig.provider, currentModelConfig.model)

      try {
        // Format as markdown blockquote for streamtty
        const reasoningMarkdown = `> ⚡︎ *${summary}*\n\n`
        await streamttyService.streamChunk(reasoningMarkdown, 'thinking')
      } catch {
        // Fallback to direct console
        console.log(`⚡︎ ${summary}`)
        console.log('')
      }
    }

    // Wait for routing decision to complete (may already be done)
    if (routingPromise) {
      const decision = await routingPromise
      effectiveModelId2 = decision.selectedModel
      if (routingCfg2?.verbose) {
        try {
          const nik = (global as any).__nikCLI
          const msg = `[Router] ${currentModelName} → ${decision.selectedModel} (${decision.tier}, ~${decision.estimatedTokens} tok)`
          if (nik?.advancedUI) nik.advancedUI.logInfo('Model Router', msg)
          else console.log(require('chalk').dim(msg))
        } catch { }
      }
    }

    const effectiveConfig2: ModelConfig = { ...currentModelConfig, model: effectiveModelId2 } as ModelConfig
    const model = this.getModel(effectiveConfig2)

    const streamOptions: any = {
      model: model as any,
      messages: validatedOptions.messages.map((msg) => ({ role: msg.role, content: msg.content })),
    }

    // Set temperature and maxTokens for all providers
    const resolvedTemp = validatedOptions.temperature ?? configManager.get('temperature')
    if (resolvedTemp != null) {
      streamOptions.temperature = resolvedTemp
    } else if (currentModelConfig.provider === 'openrouter') {
      // OpenRouter requires temperature = 1 for all models
      streamOptions.temperature = 1.0
    }

    streamOptions.maxTokens = validatedOptions.maxTokens ?? 6000
    if (currentModelConfig.provider === 'openrouter') {
      // OpenRouter needs maxTokens set for all models
      streamOptions.maxTokens = validatedOptions.maxTokens ?? 6000
    }

    // OpenRouter-specific parameters support for streaming - dynamic based on model capabilities
    if (effectiveConfig2.provider === 'openrouter') {
      if (!streamOptions.experimental_providerMetadata) {
        streamOptions.experimental_providerMetadata = {}
      }
      if (!streamOptions.experimental_providerMetadata.openrouter) {
        streamOptions.experimental_providerMetadata.openrouter = {}
      }

      // Fetch model capabilities and build parameters dynamically
      try {
        const modelCaps = await openRouterRegistry.getCapabilities(effectiveConfig2.model)

        // Only add reasoning parameters if model supports them
        if (reasoningEnabled && (modelCaps.supportsReasoning || modelCaps.supportsIncludeReasoning)) {
          if (modelCaps.supportsIncludeReasoning) {
            streamOptions.experimental_providerMetadata.openrouter.include_reasoning = true
          }
          if (modelCaps.supportsReasoningEffort) {
            const reasoningConfig = validatedOptions.reasoning || {
              effort: 'medium',
              exclude: false,
              enabled: true,
            }
            streamOptions.experimental_providerMetadata.openrouter.reasoning = reasoningConfig
          }
        }

        // Transforms parameter support (e.g., middle-out for context compression)
        const transforms = (effectiveConfig2 as any).transforms || configManager.get('openrouterTransforms')
        if (transforms && Array.isArray(transforms) && transforms.length > 0) {
          streamOptions.experimental_providerMetadata.openrouter.transforms = transforms
        } else {
          streamOptions.experimental_providerMetadata.openrouter.transforms = ['middle-out']
        }
      } catch {
        // Fallback to default if registry fails
        if (reasoningEnabled) {
          const reasoningConfig = validatedOptions.reasoning || {
            effort: 'medium',
            exclude: false,
            enabled: true,
          }
            ; (reasoningConfig as any).include_reasoning = (reasoningConfig as any).include_reasoning ?? true
          streamOptions.experimental_providerMetadata.openrouter.reasoning = reasoningConfig
        }
        const transforms = (effectiveConfig2 as any).transforms || configManager.get('openrouterTransforms')
        if (transforms && Array.isArray(transforms) && transforms.length > 0) {
          streamOptions.experimental_providerMetadata.openrouter.transforms = transforms
        } else {
          streamOptions.experimental_providerMetadata.openrouter.transforms = ['middle-out']
        }
      }

      // Prompt caching (OpenRouter-only) - applied only if enabled in config
      const cacheCfg = configManager.get('openrouterPromptCache')
      if (cacheCfg?.enabled) {
        const cache: any = {}
        if (cacheCfg.mode) cache.mode = cacheCfg.mode
        if (cacheCfg.ttl) cache.ttl = cacheCfg.ttl
        streamOptions.experimental_providerMetadata.openrouter.cache = cache
      }
    }

    const result = await streamText(streamOptions)

    for await (const delta of result.textStream) {
      yield delta
    }
  }

  async generateStructured<T>(
    options: GenerateOptions & {
      schema: any
      schemaName?: string
      schemaDescription?: string
      steps?: Array<{
        stepId: string
        description: string
        schema: any
      }>
      finalStep?: {
        description: string
        schema: any
      }
    }
  ): Promise<T> {
    const currentModelName = configManager.getCurrentModel()
    const models = configManager.get('models')
    const currentModelConfig = models[currentModelName]

    if (!currentModelConfig) {
      throw new Error(`Model configuration not found for: ${currentModelName}`)
    }

    const routingCfg3 = configManager.get('modelRouting')
    let effId3 = currentModelConfig.model
    if (routingCfg3?.enabled) {
      const decision = await adaptiveModelRouter.choose({
        provider: currentModelConfig.provider as any,
        baseModel: currentModelConfig.model,
        messages: options.messages as any,
        scope: (options as any).scope as ModelScope | undefined,
        needsVision: (options as any).needsVision,
        sizeHints: (options as any).sizeHints,
      })
      effId3 = decision.selectedModel
      if (routingCfg3.verbose) {
        try {
          const nik = (global as any).__nikCLI
          const msg = `[Router] ${configManager.getCurrentModel()} → ${decision.selectedModel} (${decision.tier}, ~${decision.estimatedTokens} tok)`
          if (nik?.advancedUI) nik.advancedUI.logInfo('Model Router', msg)
          else console.log(require('chalk').dim(msg))
        } catch { }
      }
    }
    const model = this.getModel({ ...currentModelConfig, model: effId3 } as ModelConfig)

    const resolvedTemp = options.temperature ?? configManager.get('temperature')
    const generateObjectParams: any = {
      model: model as any,
      messages: options.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      schema: options.schema,
      schemaName: options.schemaName,
      schemaDescription: options.schemaDescription,
    }

    // Set temperature for all providers
    if (resolvedTemp != null) {
      generateObjectParams.temperature = resolvedTemp
    } else if (currentModelConfig.provider === 'openrouter') {
      // OpenRouter requires temperature = 1 for all models
      generateObjectParams.temperature = 1.0
    }

    // Set maxTokens for all providers
    generateObjectParams.maxTokens = options.maxTokens ?? 6000

    // Add AI SDK steps and finalStep support
    if (options.steps) {
      generateObjectParams.steps = options.steps
    }
    if (options.finalStep) {
      generateObjectParams.finalStep = options.finalStep
    }

    const { object } = await generateObject(generateObjectParams)

    return object as T
  }

  validateApiKey(): boolean {
    return configManager.validateConfig()
  }

  getCurrentModelInfo(): { name: string; config: ModelConfig } {
    const name = configManager.get('currentModel')
    const models = configManager.get('models')
    const cfg = models[name]

    if (!cfg) {
      throw new Error(`Model configuration not found for: ${name}`)
    }

    return {
      name,
      config: cfg,
    }
  }

  /**
   * Get reasoning capabilities for the current model
   */
  getReasoningCapabilities(): {
    supportsReasoning: boolean
    reasoningType: string
    summary: string
    enabled: boolean
  } {
    const { name, config } = this.getCurrentModelInfo()
    const capabilities = ReasoningDetector.detectReasoningSupport(config.provider, config.model)
    const summary = ReasoningDetector.getModelReasoningSummary(config.provider, config.model)
    const enabled = this.shouldEnableReasoning({ messages: [] }, config)

    return {
      supportsReasoning: capabilities.supportsReasoning,
      reasoningType: capabilities.reasoningType,
      summary,
      enabled,
    }
  }

  /**
   * Get all models that support reasoning
   */
  getReasoningEnabledModels(): string[] {
    return ReasoningDetector.getReasoningEnabledModels()
  }
}

export const modelProvider = new ModelProvider()
