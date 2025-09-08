import type { ProviderClient, AIServiceConfig, Message } from '../streaming/AIService';

export type ValidationResult = {
  isValid: boolean;
  provider: string;
  error?: string;
  latency?: number;
  model?: string;
};

export type ValidationOptions = {
  timeout?: number;
  testMessage?: string;
  skipConnectivityTest?: boolean;
};

export class ProviderValidator {
  private defaultTestMessage = "Hello, respond with 'OK' to confirm functionality.";

  async validateProvider(
    config: AIServiceConfig,
    options: ValidationOptions = {}
  ): Promise<ValidationResult> {
    const startTime = Date.now();
    const timeout = options.timeout || 10000;
    const testMessage = options.testMessage || this.defaultTestMessage;

    try {
      // Create provider client
      const client = this.createProviderClient(config);
      if (!client) {
        return {
          isValid: false,
          provider: config.provider,
          error: `Failed to create ${config.provider} provider client`
        };
      }

      // Skip connectivity test if requested
      if (options.skipConnectivityTest) {
        return {
          isValid: true,
          provider: config.provider,
          model: config.model,
          latency: Date.now() - startTime
        };
      }

      // Test basic connectivity with a simple completion
      const testMessages: Message[] = [
        { role: 'user', content: testMessage }
      ];

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const result = await client.complete({
          model: config.model,
          messages: testMessages,
          stream: false,
          abortSignal: controller.signal
        });

        clearTimeout(timeoutId);

        // Validate response
        if (typeof result === 'object' && 'text' in result) {
          const hasValidResponse = Boolean(result.text && result.text.trim().length > 0);
          return {
            isValid: hasValidResponse,
            provider: config.provider,
            model: config.model,
            latency: Date.now() - startTime,
            error: hasValidResponse ? undefined : 'Empty response from provider'
          };
        } else {
          return {
            isValid: false,
            provider: config.provider,
            error: 'Invalid response format from provider'
          };
        }

      } catch (streamError) {
        clearTimeout(timeoutId);
        return {
          isValid: false,
          provider: config.provider,
          error: `Provider communication failed: ${streamError instanceof Error ? streamError.message : String(streamError)}`,
          latency: Date.now() - startTime
        };
      }

    } catch (error) {
      return {
        isValid: false,
        provider: config.provider,
        error: error instanceof Error ? error.message : String(error),
        latency: Date.now() - startTime
      };
    }
  }

  async validateAllProviders(
    configs: AIServiceConfig[],
    options: ValidationOptions = {}
  ): Promise<ValidationResult[]> {
    const results = await Promise.all(
      configs.map(config => this.validateProvider(config, options))
    );
    return results;
  }

  async validateStreamingProvider(
    config: AIServiceConfig,
    options: ValidationOptions = {}
  ): Promise<ValidationResult & { streamChunks?: number }> {
    const startTime = Date.now();
    const timeout = options.timeout || 15000;
    const testMessage = options.testMessage || "Count from 1 to 3, one number per line.";

    try {
      const client = this.createProviderClient(config);
      if (!client) {
        return {
          isValid: false,
          provider: config.provider,
          error: `Failed to create ${config.provider} provider client`
        };
      }

      const testMessages: Message[] = [
        { role: 'user', content: testMessage }
      ];

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const result = await client.complete({
          model: config.model,
          messages: testMessages,
          stream: true,
          abortSignal: controller.signal
        });

        if (typeof result === 'object' && 'text' in result) {
          clearTimeout(timeoutId);
          return {
            isValid: false,
            provider: config.provider,
            error: 'Expected streaming response but received non-streaming result'
          };
        }

        // Consume streaming response
        let chunkCount = 0;
        let fullText = '';

        for await (const chunk of result as AsyncIterable<string>) {
          chunkCount++;
          fullText += chunk;
          
          // Reasonable limit to avoid infinite streams in validation
          if (chunkCount > 100) break;
        }

        clearTimeout(timeoutId);

        const isValid = chunkCount > 0 && fullText.trim().length > 0;
        return {
          isValid,
          provider: config.provider,
          model: config.model,
          latency: Date.now() - startTime,
          streamChunks: chunkCount,
          error: isValid ? undefined : 'No valid streaming data received'
        };

      } catch (streamError) {
        clearTimeout(timeoutId);
        return {
          isValid: false,
          provider: config.provider,
          error: `Streaming test failed: ${streamError instanceof Error ? streamError.message : String(streamError)}`,
          latency: Date.now() - startTime
        };
      }

    } catch (error) {
      return {
        isValid: false,
        provider: config.provider,
        error: error instanceof Error ? error.message : String(error),
        latency: Date.now() - startTime
      };
    }
  }

  private createProviderClient(config: AIServiceConfig): ProviderClient | null {
    try {
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
    } catch (error) {
      if (process.env.TUI_AI_DEBUG === '1') {
        console.log(`[ProviderValidator] Failed to create ${config.provider} client:`, error);
      }
    }
    return null;
  }

  // Health check utilities
  async isProviderHealthy(config: AIServiceConfig): Promise<boolean> {
    const result = await this.validateProvider(config, { 
      skipConnectivityTest: false, 
      timeout: 5000 
    });
    return result.isValid;
  }

  async getProviderLatency(config: AIServiceConfig): Promise<number | null> {
    const result = await this.validateProvider(config, { 
      timeout: 5000,
      testMessage: "Hi"
    });
    return result.latency || null;
  }
}