// TODO: Consider refactoring for reduced complexity
import type { ProviderMessage, ProviderStream } from './OpenAIProvider';
import type { ProviderClient } from '@tui-kit-ai/ai';

/** Ollama streaming provider using local HTTP API */
export class OllamaProvider implements ProviderClient {
  name = 'ollama' as const;
  private timeout: number;
  private maxRetries: number;

  constructor(
    private baseUrl: string = 'http://localhost:11434',
    private model: string = 'llama3',
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
    const url = `${this.baseUrl.replace(/\/$/, '')}/api/chat`;

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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.model,
            stream: true,
            messages: messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => '');
          const error = new Error(
            `Ollama HTTP ${res.status}: ${res.statusText} ${text}`,
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
                `[Ollama] Retry ${attempt + 1}/${this.maxRetries} in ${delay}ms (${res.status})`,
              );
            }

            await this.sleep(delay);
            continue;
          }

          throw error;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        async function* ndjson(
          controllerRef: AbortController,
        ): AsyncGenerator<string> {
          let buffer = '';
          try {
            while (true) {
              if (controllerRef.signal.aborted) break;

              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const parts = buffer.split(/\r?\n/);
              buffer = parts.pop() || '';
              for (const part of parts) {
                const trimmed = part.trim();
                if (!trimmed) continue;
                // Allow either raw ndjson lines or SSE-style data: lines
                const candidate = trimmed.startsWith('data:')
                  ? trimmed.slice(5).trim()
                  : trimmed;
                if (!candidate) continue;
                try {
                  const json = JSON.parse(candidate);
                  const chunk =
                    json.message?.content || json.content || json.text || '';
                  if (chunk) yield chunk as string;
                } catch {
                  // ignore parse errors for partial chunks
                }
              }
            }
          } finally {
            try {
              reader.releaseLock();
            } catch {}
          }
        }
        return ndjson(controller);
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
