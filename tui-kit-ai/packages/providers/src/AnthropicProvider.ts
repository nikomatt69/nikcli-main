import type { ProviderMessage, ProviderStream } from './OpenAIProvider';

export class AnthropicProvider {
  constructor(private apiKey?: string, private model: string = 'claude-3-sonnet-20240229', private baseUrl?: string) {}
  async stream(messages: ProviderMessage[]): Promise<ProviderStream> {
    async function* gen() {
      const text = messages[messages.length - 1]?.content || '';
      for (const ch of `ANTHROPIC:${text}`) { await new Promise(r => setTimeout(r, 5)); yield ch; }
    }
    return gen();
  }
}
