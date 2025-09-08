// TODO: Consider refactoring for reduced complexity
export type Message = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};
// Configurable stop sequences
export const STOP_SEQUENCES = [
  '</tool>',
  '</function>',
  '<|end|>',
  '<|stop|>',
  '<|im_end|>',
];
// Unified provider interface (shadcn-style)
export type ProviderClient = {
  name: 'openai' | 'anthropic' | 'ollama';
  complete(opts: {
    model: string;
    messages: Message[];
    stream?: boolean;
    abortSignal?: AbortSignal;
  }): Promise<AsyncIterable<string> | { text: string }>;
};
export type StreamResult = {
  textStream: AsyncIterable<string>;
  abort: () => void;
};
export type AIServiceConfig = {
  provider: 'openai' | 'anthropic' | 'ollama' | 'custom';
  model: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
};
// Legacy provider interface for backward compatibility
type Provider = {
  stream: (
    messages: Message[],
    abortSignal?: AbortSignal,
  ) => Promise<AsyncIterable<string>>;
};
export class AIService {
  private config: AIServiceConfig;
  private provider: Provider;
  private client?: ProviderClient;
  constructor(
    config: AIServiceConfig,
    customProvider?: Provider,
    client?: ProviderClient,
  ) {
    this.config = config;
    this.provider = customProvider || this.resolveProvider(config);
    this.client = client;
  }
  private resolveProvider(config: AIServiceConfig): Provider {
    // Create provider client that implements the unified interface
    const client = this.createProviderClient(config);
    if (client) {
      this.client = client;
      // Return legacy wrapper for backward compatibility
      return {
        async stream(
          messages: Message[],
          abortSignal?: AbortSignal,
        ): Promise<AsyncIterable<string>> {
          const result = await client.complete({
            model: config.model,
            messages,
            stream: true,
            abortSignal,
          });
          if (typeof result === 'object' && 'text' in result) {
            // Non-streaming result, convert to async generator
            return (async function* () {
              yield result.text;
            })();
          }
          return result as AsyncIterable<string>;
        },
      };
    }
    // Fallback for unknown providers
    return {
      async stream(_messages: Message[]): Promise<AsyncIterable<string>> {
        async function* gen() {
          yield '';
        }
        return gen();
      },
    };
  }
  private createProviderClient(config: AIServiceConfig): ProviderClient | null {
    try {
      if (config.provider === 'openai') {
        const { OpenAIProvider } = require('@tui-kit-ai/providers');
        return new OpenAIProvider(config.apiKey, config.model, config.baseUrl);
      }
      if (config.provider === 'anthropic') {
        const { AnthropicProvider } = require('@tui-kit-ai/providers');
        return new AnthropicProvider(
          config.apiKey,
          config.model,
          config.baseUrl,
        );
      }
      if (config.provider === 'ollama') {
        const { OllamaProvider } = require('@tui-kit-ai/providers');
        return new OllamaProvider(config.baseUrl, config.model);
      }
    } catch (error) {
      if (process.env.TUI_AI_DEBUG === '1') {
        console.log(
          `[AIService] Failed to create provider client for ${config.provider}:`,
          error,
        );
      }
    }
    return null;
  }
  // Robust streaming with backpressure and abort support
  async streamCompletion(messages: Message[]): Promise<StreamResult> {
    const ac = new AbortController();
    // Token budget guardrail
    const maxTokens = this.config.maxTokens || 4000;
    const truncatedMessages = this.truncateMessages(messages, maxTokens);
    if (process.env.TUI_AI_DEBUG === '1') {
      console.log(
        `[TUI-AI] Streaming with ${truncatedMessages.length} messages, max tokens: ${maxTokens}`,
      );
    }
    let baseStream: AsyncIterable<string>;
    if (this.client) {
      // Use unified client interface
      const result = await this.client.complete({
        model: this.config.model,
        messages: truncatedMessages,
        stream: true,
        abortSignal: ac.signal,
      });
      if (typeof result === 'object' && 'text' in result) {
        baseStream = (async function* () {
          yield result.text;
        })();
      } else {
        baseStream = result as AsyncIterable<string>;
      }
    } else {
      // Use legacy provider
      baseStream = await this.provider.stream(truncatedMessages, ac.signal);
    }
    // Backpressure implementation
    const q: string[] = [];
    let waiting = false;
    const MAX_QUEUE = 64;
    const iterator = (async function* () {
      try {
        for await (const chunk of baseStream) {
          if (ac.signal.aborted) break;
          if (!chunk) continue;
          if (q.length < MAX_QUEUE) {
            q.push(typeof chunk === 'string' ? chunk : String(chunk));
          }
          if (!waiting) {
            waiting = true;
            await Promise.resolve(); // Yield to event loop
            while (q.length) {
              yield q.shift()!;
            }
            waiting = false;
          }
        }
      } catch (error) {
        if (!ac.signal.aborted) {
          console.error('[TUI-AI] Streaming error:', error);
        }
      }
    })();
    return {
      textStream: iterator,
      abort: () => ac.abort(),
    };
  }
  // Token budget management with sliding window
  private truncateMessages(messages: Message[], maxTokens: number): Message[] {
    // Simple character-based truncation (in real implementation, use proper tokenizer)
    const charPerToken = 4; // Rough estimate
    const maxChars = maxTokens * charPerToken;
    // Always preserve system messages
    const systemMsgs = messages.filter((m) => m.role === 'system');
    const others = messages.filter((m) => m.role !== 'system');
    let usedChars = systemMsgs.reduce(
      (s, m) => s + (m.content?.length || 0),
      0,
    );
    const kept: Message[] = [...systemMsgs];
    // Take from the tail of non-system messages until budget reached
    for (let i = others.length - 1; i >= 0; i--) {
      const m = others[i];
      const len = m.content?.length || 0;
      if (usedChars + len > maxChars) break;
      kept.unshift(m);
      usedChars += len;
    }
    return kept;
  }
}
