import { createAnthropic } from '@ai-sdk/anthropic'
import { createGateway } from '@ai-sdk/gateway'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createVercel } from '@ai-sdk/vercel'
import { generateObject, generateText, streamText } from 'ai'
import { createOllama } from 'ollama-ai-provider'
import { z } from 'zod'
import { configManager, type ModelConfig } from '../core/config-manager'
import { adaptiveModelRouter, type ModelScope } from './adaptive-model-router'

// ====================== 🧠 ZOD VALIDATION SCHEMAS ======================

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
})

// Export Zod inferred types
export type ChatMessage = z.infer<typeof ChatMessageSchema>
export type GenerateOptions = z.infer<typeof GenerateOptionsSchema>
export type ModelResponse = z.infer<typeof ModelResponseSchema>

// Legacy interfaces (deprecated - use Zod schemas above)

export class ModelProvider {
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
        const gatewayProvider = createGateway({ apiKey })
        return gatewayProvider(config.model)
      }
      case 'openrouter': {
        const apiKey = configManager.getApiKey(currentModelName)
        if (!apiKey) {
          throw new Error(`API key not found for model: ${currentModelName} (OpenRouter). Use /set-key to configure.`)
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

    // Choose adaptive model variant based on complexity and scope (if routing enabled)
    const routingCfg = configManager.get('modelRouting')
    let effectiveModelId = currentModelConfig.model
    if (routingCfg?.enabled) {
      const decision = adaptiveModelRouter.choose({
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
      } catch {}
    }
    const effectiveConfig: ModelConfig = { ...currentModelConfig, model: effectiveModelId } as ModelConfig
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
    const { text } = await generateText(baseOptions)

    // (logs handled above if verbose)

    return text
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

    const routingCfg2 = configManager.get('modelRouting')
    let effectiveModelId2 = currentModelConfig.model
    if (routingCfg2?.enabled) {
      const decision = adaptiveModelRouter.choose({
        provider: currentModelConfig.provider as any,
        baseModel: currentModelConfig.model,
        messages: validatedOptions.messages,
        scope: (validatedOptions as any).scope as ModelScope | undefined,
        needsVision: (validatedOptions as any).needsVision,
        sizeHints: (validatedOptions as any).sizeHints,
      })
      effectiveModelId2 = decision.selectedModel
      if (routingCfg2.verbose) {
        try {
          const nik = (global as any).__nikCLI
          const msg = `[Router] ${currentModelName} → ${decision.selectedModel} (${decision.tier}, ~${decision.estimatedTokens} tok)`
          if (nik?.advancedUI) nik.advancedUI.logInfo('Model Router', msg)
          else console.log(require('chalk').dim(msg))
        } catch {}
      }
    }
    const effectiveConfig2: ModelConfig = { ...currentModelConfig, model: effectiveModelId2 } as ModelConfig
    const model = this.getModel(effectiveConfig2)

    const streamOptions: any = {
      model: model as any,
      messages: validatedOptions.messages.map((msg) => ({ role: msg.role, content: msg.content })),
    }
    if (currentModelConfig.provider !== 'openai') {
      streamOptions.maxTokens = validatedOptions.maxTokens ?? 1000
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
      const decision = adaptiveModelRouter.choose({
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
        } catch {}
      }
    }
    const model = this.getModel({ ...currentModelConfig, model: effId3 } as ModelConfig)

    const { object } = await generateObject({
      model: model as any,
      messages: options.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      schema: options.schema,
      schemaName: options.schemaName,
      schemaDescription: options.schemaDescription,
      temperature: options.temperature ?? configManager.get('temperature'),
    })

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
}

export const modelProvider = new ModelProvider()
