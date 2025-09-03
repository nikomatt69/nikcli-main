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

export class AIService {
  private config: AIServiceConfig;

  constructor(config: AIServiceConfig) {
    this.config = config;
  }

  async streamCompletion(messages: Message[]): Promise<StreamResult> {
    async function* generator() {
      const full = `[${messages[messages.length - 1]?.content || ''}]`;
      for (const ch of full) {
        await new Promise((r) => setTimeout(r, 10));
        yield ch;
      }
    }
    return { textStream: generator() };
  }
}
