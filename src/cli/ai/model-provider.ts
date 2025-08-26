import { generateText, generateObject, streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOllama } from 'ollama-ai-provider';
import { createVercel } from '@ai-sdk/vercel';
import { ModelConfig, configManager } from '../core/config-manager';
import { gateway } from '@ai-sdk/gateway';
import { createGateway } from '@ai-sdk/gateway';
import { z } from 'zod';

// ====================== 🧠 ZOD VALIDATION SCHEMAS ======================

// Chat Message Schema
export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1),
  timestamp: z.date().optional()
});

// Generate Options Schema
export const GenerateOptionsSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(100000).optional(),
  stream: z.boolean().optional()
});

// Model Response Schema
export const ModelResponseSchema = z.object({
  text: z.string(),
  usage: z.object({
    promptTokens: z.number().int().min(0),
    completionTokens: z.number().int().min(0),
    totalTokens: z.number().int().min(0)
  }).optional(),
  finishReason: z.enum(['stop', 'length', 'content-filter', 'tool-calls']).optional(),
  warnings: z.array(z.string()).optional()
});

// Export Zod inferred types
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type GenerateOptions = z.infer<typeof GenerateOptionsSchema>;
export type ModelResponse = z.infer<typeof ModelResponseSchema>;

// Legacy interfaces (deprecated - use Zod schemas above)


export class ModelProvider {
  private getModel(config: ModelConfig) {
    const currentModelName = configManager.get('currentModel');

    switch (config.provider) {
      case 'openai': {
        const apiKey = configManager.getApiKey(currentModelName);
        if (!apiKey) {
          throw new Error(`API key not found for model: ${currentModelName} (OpenAI). Use /set-key to configure.`);
        }
        const openaiProvider = createOpenAI({ apiKey, compatibility: 'strict' });
        return openaiProvider(config.model);
      }
      case 'anthropic': {
        const apiKey = configManager.getApiKey(currentModelName);
        if (!apiKey) {
          throw new Error(`API key not found for model: ${currentModelName} (Anthropic). Use /set-key to configure.`);
        }
        const anthropicProvider = createAnthropic({ apiKey });
        return anthropicProvider(config.model);
      }
      case 'vercel': {
        const apiKey = configManager.getApiKey(currentModelName);
        if (!apiKey) {
          throw new Error(`API key not found for model: ${currentModelName} (Vercel v0). Use /set-key to configure V0_API_KEY.`);
        }
        const vercelProvider = createVercel({ apiKey });
        return vercelProvider(config.model);
      }
      case 'google': {
        const apiKey = configManager.getApiKey(currentModelName);
        if (!apiKey) {
          throw new Error(`API key not found for model: ${currentModelName} (Google). Use /set-key to configure.`);
        }
        const googleProvider = createGoogleGenerativeAI({ apiKey });
        return googleProvider(config.model);
      }
      case 'gateway': {
        const apiKey = configManager.getApiKey(currentModelName);
        if (!apiKey) {
          throw new Error(`API key not found for model: ${currentModelName} (Gateway). Use /set-key to configure.`);
        }
        const gatewayProvider = createGateway({ apiKey });
        return gatewayProvider(config.model);
      }
      case 'ollama': {
        // Ollama does not require API keys; assumes local daemon at default endpoint
        const ollamaProvider = createOllama({});
        return ollamaProvider(config.model);
      }
      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }
  }

  async generateResponse(options: GenerateOptions): Promise<string> {
    // 🔍 Validate input options with Zod schema
    const validatedOptions = GenerateOptionsSchema.parse(options);

    const currentModelName = configManager.getCurrentModel();
    const models = configManager.get('models');
    const currentModelConfig = models[currentModelName];

    if (!currentModelConfig) {
      throw new Error(`Model configuration not found for: ${currentModelName}`);
    }

    const model = this.getModel(currentModelConfig);

    const baseOptions: Parameters<typeof generateText>[0] = {
      model: model as any,
      messages: validatedOptions.messages.map((msg) => ({ role: msg.role, content: msg.content })),
    };
    // Always honor explicit user settings for all providers
    if (validatedOptions.maxTokens != null) {
      baseOptions.maxTokens = validatedOptions.maxTokens;
    } else if (currentModelConfig.provider !== 'openai') {
      baseOptions.maxTokens = 4000; // provider-specific default when not supplied
    }
    const resolvedTemp = validatedOptions.temperature ?? configManager.get('temperature');
    if (resolvedTemp != null) {
      baseOptions.temperature = resolvedTemp;
    }
    const { text } = await generateText(baseOptions);

    return text;
  }

  async *streamResponse(options: GenerateOptions): AsyncGenerator<string, void, unknown> {
    // 🔍 Validate input options with Zod schema
    const validatedOptions = GenerateOptionsSchema.parse(options);

    const currentModelName = configManager.getCurrentModel();
    const models = configManager.get('models');
    const currentModelConfig = models[currentModelName];

    if (!currentModelConfig) {
      throw new Error(`Model configuration not found for: ${currentModelName}`);
    }

    const model = this.getModel(currentModelConfig);

    const streamOptions: any = {
      model: model as any,
      messages: validatedOptions.messages.map(msg => ({ role: msg.role, content: msg.content })),
    };
    if (currentModelConfig.provider !== 'openai') {
      streamOptions.maxTokens = validatedOptions.maxTokens ?? 1000;
      streamOptions.temperature = validatedOptions.temperature ?? configManager.get('temperature');
    }
    const result = await streamText(streamOptions);

    for await (const delta of result.textStream) {
      yield delta;
    }
  }

  async generateStructured<T>(
    options: GenerateOptions & {
      schema: any;
      schemaName?: string;
      schemaDescription?: string;
    }
  ): Promise<T> {
    const currentModelName = configManager.getCurrentModel();
    const models = configManager.get('models');
    const currentModelConfig = models[currentModelName];

    if (!currentModelConfig) {
      throw new Error(`Model configuration not found for: ${currentModelName}`);
    }

    const model = this.getModel(currentModelConfig);

    const { object } = await generateObject({
      model: model as any,
      messages: options.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      schema: options.schema,
      schemaName: options.schemaName,
      schemaDescription: options.schemaDescription,
      temperature: options.temperature ?? configManager.get('temperature'),
    });

    return object as T;
  }

  validateApiKey(): boolean {
    return configManager.validateConfig();
  }

  getCurrentModelInfo(): { name: string; config: ModelConfig } {
    const name = configManager.get('currentModel');
    const models = configManager.get('models');
    const cfg = models[name];

    if (!cfg) {
      throw new Error(`Model configuration not found for: ${name}`);
    }

    return {
      name,
      config: cfg,
    };
  }
}

export const modelProvider = new ModelProvider();