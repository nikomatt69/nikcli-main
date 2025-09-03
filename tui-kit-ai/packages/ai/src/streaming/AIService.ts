export type Message = { role: 'system' | 'user' | 'assistant'; content: string };

export type StreamResult = {
  textStream: AsyncIterable<string>;
};

export type AIServiceConfig = {
  provider: 'openai' | 'anthropic' | 'ollama' | 'custom';
  model: string;
  apiKey?: string;
  baseUrl?: string;
};

type Provider = { stream: (messages: Message[]) => Promise<AsyncIterable<string>> };

export class AIService {
  private config: AIServiceConfig;
  private provider: Provider;

  constructor(config: AIServiceConfig, customProvider?: Provider) {
    this.config = config;
    this.provider = customProvider || this.resolveProvider(config);
  }

  private resolveProvider(config: AIServiceConfig): Provider {
    if (config.provider === 'openai') {
      const { OpenAIProvider } = require('@tui-kit-ai/providers');
      return new OpenAIProvider(config.apiKey, config.model, config.baseUrl);
    }
    if (config.provider === 'anthropic') {
      const { AnthropicProvider } = require('@tui-kit-ai/providers');
      return new AnthropicProvider(config.apiKey, config.model, config.baseUrl);
    }
    if (config.provider === 'ollama') {
      const { OllamaProvider } = require('@tui-kit-ai/providers');
      return new OllamaProvider(config.baseUrl, config.model);
    }
    return { async stream() { async function* gen(){ yield ''; } return gen(); } };
  }

  async streamCompletion(messages: Message[]): Promise<StreamResult> {
    const textStream = await this.provider.stream(messages);
    return { textStream };
  }
}
