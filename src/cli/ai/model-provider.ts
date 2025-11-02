import { createAnthropic } from '@ai-sdk/anthropic'
import { createGateway } from '@ai-sdk/gateway'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createVercel } from '@ai-sdk/vercel'
import { generateObject, generateText, streamText } from 'ai'
import { createOllama } from 'ollama-ai-provider'
import { z } from 'zod'

import { configManager, type ModelConfig } from '../core/config-manager'
import { streamttyService } from '../services/streamtty-service'
import { adaptiveModelRouter, type ModelScope } from './adaptive-model-router'
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
  maxTokens: z.number().int().min(1).max(100000).optional(),
  stream: z.boolean().optional(),
  // Routing hints (optional)
  scope: z.enum(['chat_default', 'planning', 'code_gen', 'tool_light', 'tool_heavy', 'vision']).optional(),
  needsVision: z.boolean().optional(),
  sizeHints: z.object({ fileCount: z.number().optional(), totalBytes: z.number().optional() }).optional(),
  // Reasoning options
  enableReasoning: z.boolean().optional(),
  showReasoningProcess: z.boolean().optional(),
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

  private getModel(config: ModelConfig) {
    const currentModelName = configManager.get('currentModel')

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
        const openrouterProvider = createOpenAI({
          apiKey,
          baseURL: 'https://openrouter.ai/api/v1',
          headers: {
            'HTTP-Referer': 'https://nikcli.ai', // Optional: for attribution
            'X-Title': 'NikCLI',
          },
        })
        return openrouterProvider(config.model) // Assumes model like 'openai/gpt-4o'
      }
      case 'ollama': {
        // Ollama does not require API keys; assumes local daemon at default endpoint
        const ollamaProvider = createOllama({})
        return ollamaProvider(config.model)
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
        sizeHints: (validatedOptions as any).sizeHints,
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
    } else if (currentModelConfig.provider !== 'openai') {
      baseOptions.maxTokens = 6000 // provider-specific default when not supplied
    }
    const resolvedTemp = validatedOptions.temperature ?? configManager.get('temperature')
    if (resolvedTemp != null) {
      baseOptions.temperature = resolvedTemp
    }
    const result = await generateText(baseOptions)

    // Record usage for OpenRouter
    try {
      if (effectiveConfig.provider === 'openrouter') {
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
    if (currentModelConfig.provider !== 'openai') {
      streamOptions.maxTokens = validatedOptions.maxTokens ?? 1500
      streamOptions.temperature = validatedOptions.temperature ?? configManager.get('temperature')
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

    const generateObjectParams: any = {
      model: model as any,
      messages: options.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      schema: options.schema,
      schemaName: options.schemaName,
      schemaDescription: options.schemaDescription,
      temperature: options.temperature ?? configManager.get('temperature'),

    }

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
