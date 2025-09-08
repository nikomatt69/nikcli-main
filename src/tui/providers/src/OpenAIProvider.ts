// TODO: Consider refactoring for reduced complexity
import type { ProviderClient } from '@tui-kit-ai/ai';

export type ProviderMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};
export type ProviderStream = AsyncIterable<string>;

/** OpenAI streaming provider using Chat Completions SSE with retry and timeout */
export class OpenAIProvider implements ProviderClient {
  name = 'openai' as const;
  private timeout: number;
  private maxRetries: number;

  constructor(
    private apiKey?: string,
    private model: string = 'gpt-4',
    private baseUrl: string = 'https://api.openai.com',
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
        text += chunk ?? '';
      }
      return { text };
    }
  }

  async stream(
    messages: ProviderMessage[],
    abortSignal?: AbortSignal,
  ): Promise<ProviderStream> {
    if (!this.apiKey) throw new Error('OpenAI API key missing');

    const body = {
      model: this.model,
      stream: true,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    } as any;

    const url = `${this.baseUrl.replace(/\/$/, '')}/v1/chat/completions`;

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
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => '');
          const error = new Error(
            `OpenAI HTTP ${res.status}: ${res.statusText} ${text}`,
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
                `[OpenAI] Retry ${attempt + 1}/${this.maxRetries} in ${delay}ms (${res.status})`,
              );
            }

            await this.sleep(delay);
            continue;
          }

          throw error;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        async function* sse(controllerRef: AbortController) {
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
                // Accept lines that start with data: or are plain json (more tolerant)
                const payload = trimmed.startsWith('data:')
                  ? trimmed.slice(5).trim()
                  : trimmed;
                if (!payload || payload === '[DONE]') continue;
                try {
                  const json = JSON.parse(payload);
                  const choice = json.choices?.[0];
                  let delta: any = undefined;
                  if (choice?.delta) {
                    delta = choice.delta.content || choice.delta;
                  }
                  if (Array.isArray(delta)) {
                    for (const d of delta) {
                      if (d) yield String(d);
                    }
                  } else if (delta) {
                    yield String(delta);
                  } else if (choice?.text) {
                    yield String(choice.text);
                  } else if (json?.text) {
                    yield String(json.text);
                  }
                } catch (e) {
                  // ignore JSON parse errors for partial chunks
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
        // If it's an abort, bubble up immediately after cleanup
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
        // Ensure timeout cleared and abort listener removed
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
