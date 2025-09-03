export type ProviderMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type ProviderStream = AsyncIterable<string>;

export class OpenAIProvider {
  constructor(private apiKey?: string, private model: string = 'gpt-4', private baseUrl?: string) {}
  async stream(messages: ProviderMessage[]): Promise<ProviderStream> {
    async function* gen() {
      const text = messages[messages.length - 1]?.content || '';
      for (const ch of `OPENAI:${text}`) { await new Promise(r => setTimeout(r, 5)); yield ch; }
    }
    return gen();
  }
}
