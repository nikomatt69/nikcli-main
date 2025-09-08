// TODO: Consider refactoring for reduced complexity
import type { ProviderMessage, ProviderStream } from './OpenAIProvider';
import type { ProviderClient } from '@tui-kit-ai/ai';

/** Anthropic streaming provider using Messages SSE with retry and timeout */
export class AnthropicProvider implements ProviderClient {
  name = 'anthropic' as const;
  private timeout: number;
  private maxRetries: number;

  constructor(
    private apiKey?: string,
    private model: string = 'claude-3-sonnet-20240229',
    private baseUrl: string = 'https://api.anthropic.com',
  ) {
    this.timeout = parseInt(process.env.TUI_AI_TIMEOUT_MS || '30000');
    this.maxRetries = parseInt(process.env.TUI_AI_MAX_RETRIES || '2');
  }

  // Unified interface implementation
  async complete(opts: {
    model: string;
    messages: ProviderMessage[];
    stream?: boolean;
    abortSignal?: AbortSignal;
  }): Promise<AsyncIterable<string> | { text: string }> {
    if (opts.stream) {
      return this.stream(opts.messages, opts.abortSignal);
    } else {
      const stream = await this.stream(opts.messages, opts.abortSignal);
      let text = '';
      for await (const chunk of stream) {
        text += chunk;
      }
      return { text };
    }
  }

  async stream(
    messages: ProviderMessage[],
    abortSignal?: AbortSignal,
  ): Promise<ProviderStream> {
    if (!this.apiKey) throw new Error('Anthropic API key missing');

    // Anthropic expects messages: {role, content:[{type:'text', text}]}
    const mapped = messages.map((m) => ({
      role: m.role,
      content: [{ type: 'text', text: m.content }],
    }));

    const url = `${this.baseUrl.replace(/\/$/, '')}/v1/messages`;

    // Retry with exponential backoff and jitter
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      let controller: AbortController | null = null;
      let timeoutId: NodeJS.Timeout | null = null;
      let onAbort: (() => void) | null = null;

      try {
        controller = new AbortController();
        timeoutId = setTimeout(() => controller!.abort(), this.timeout);

        // Combine abort signals
        if (abortSignal) {
          onAbort = () => controller!.abort();
          abortSignal.addEventListener('abort', onAbort);
        }

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
            accept: 'text/event-stream',
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: 1024,
            stream: true,
            messages: mapped,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => '');
          const error = new Error(
            `Anthropic HTTP ${res.status}: ${res.statusText} ${text}`,
          );

          // Retry on transient errors (429, 5xx)
          if (
            (res.status === 429 || res.status >= 500) &&
            attempt < this.maxRetries
          ) {
            const delay = this.calculateRetryDelay(attempt);

            // Compact retry logging
            if (process.env.TUI_AI_DEBUG === '1') {
              console.log(
                `[Anthropic] Retry ${attempt + 1}/${this.maxRetries} in ${delay}ms (${res.status})`,
              );
            }

            await this.sleep(delay);
            continue;
          }

          throw error;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        async function* sse(
          controllerRef: AbortController,
        ): AsyncGenerator<string> {
          let buffer = '';
          try {
            while (true) {
              if (controllerRef.signal.aborted) break;

              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split(/\r?\n/);
              buffer = lines.pop() || '';
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                if (
                  !trimmed.startsWith('data:') &&
                  !trimmed.startsWith('event:')
                )
                  continue;
                if (trimmed.startsWith('data:')) {
                  const data = trimmed.slice(5).trim();
                  if (!data || data === '[DONE]') continue;
                  try {
                    const json = JSON.parse(data);
                    const delta =
                      json.delta?.text ||
                      json.content?.[0]?.text ||
                      (Array.isArray(json.delta)
                        ? json.delta.join('')
                        : undefined);
                    if (delta) yield delta as string;
                  } catch {
                    // ignore JSON parse errors for partial chunks
                  }
                }
              }
            }
          } finally {
            try {
              reader.releaseLock();
            } catch {}
          }
        }
        return sse(controller);
      } catch (error) {
        if ((error as any)?.name === 'AbortError') {
          throw error;
        }
        if (attempt === this.maxRetries) {
          throw error;
        }

        // Wait before retry with exponential backoff + jitter
        const delay = this.calculateRetryDelay(attempt);
        await this.sleep(delay);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        if (abortSignal && onAbort) {
          abortSignal.removeEventListener('abort', onAbort);
        }
      }
    }

    throw new Error('Max retries exceeded');
  }

  private calculateRetryDelay(attempt: number): number {
    // Exponential backoff: 1s, 2s, 4s, 8s (capped at 8s)
    const baseDelay = Math.min(1000 * Math.pow(2, attempt), 8000);
    // Add jitter: ±25% random variation
    const jitter = baseDelay * 0.25 * (Math.random() - 0.5);
    return Math.max(100, baseDelay + jitter);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
