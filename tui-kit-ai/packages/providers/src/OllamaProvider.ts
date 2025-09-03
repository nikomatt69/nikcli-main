import type { ProviderMessage, ProviderStream } from './OpenAIProvider';

export class OllamaProvider {
  constructor(private baseUrl: string = 'http://localhost:11434', private model: string = 'llama3') {}
  async stream(messages: ProviderMessage[]): Promise<ProviderStream> {
    async function* gen() {
      const text = messages[messages.length - 1]?.content || '';
      for (const ch of `OLLAMA:${text}`) { await new Promise(r => setTimeout(r, 5)); yield ch; }
    }
    return gen();
  }
}
