/**
 * NikCLI Enterprise SDK - AI Module
 * Programmatic access to AI providers and completions
 */

import type {
  SDKResponse,
  AIModelConfig,
  AICompletionOptions,
  AICompletionResult,
  StreamChunk,
  ToolDefinition,
} from './types';

export class AISDK {
  private aiProvider: any;
  private config: any;

  constructor(aiProvider: any, config: any) {
    this.aiProvider = aiProvider;
    this.config = config;
  }

  // ============================================================================
  // Model Management
  // ============================================================================

  /**
   * List available models
   */
  async listModels(provider?: string): Promise<SDKResponse<string[]>> {
    try {
      const models = await this.aiProvider.listModels(provider);
      return { success: true, data: models };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get current model
   */
  async getCurrentModel(): Promise<SDKResponse<AIModelConfig>> {
    try {
      const model = await this.aiProvider.getCurrentModel();
      return { success: true, data: model };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Switch model
   */
  async switchModel(modelName: string): Promise<SDKResponse<void>> {
    try {
      await this.aiProvider.switchModel(modelName);
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Set model configuration
   */
  async setModelConfig(config: AIModelConfig): Promise<SDKResponse<void>> {
    try {
      await this.aiProvider.setModelConfig(config);
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Completions
  // ============================================================================

  /**
   * Get AI completion
   */
  async complete(
    prompt: string,
    options?: AICompletionOptions
  ): Promise<SDKResponse<AICompletionResult>> {
    try {
      const result = await this.aiProvider.complete(prompt, options);
      return { success: true, data: result };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Stream AI completion
   */
  async *streamComplete(
    prompt: string,
    options?: AICompletionOptions
  ): AsyncGenerator<StreamChunk, void, unknown> {
    try {
      const stream = await this.aiProvider.streamComplete(prompt, options);
      for await (const chunk of stream) {
        yield chunk;
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Chat completion
   */
  async chat(
    messages: Array<{ role: string; content: string }>,
    options?: AICompletionOptions
  ): Promise<SDKResponse<AICompletionResult>> {
    try {
      const result = await this.aiProvider.chat(messages, options);
      return { success: true, data: result };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Stream chat completion
   */
  async *streamChat(
    messages: Array<{ role: string; content: string }>,
    options?: AICompletionOptions
  ): AsyncGenerator<StreamChunk, void, unknown> {
    try {
      const stream = await this.aiProvider.streamChat(messages, options);
      for await (const chunk of stream) {
        yield chunk;
      }
    } catch (error) {
      throw error;
    }
  }

  // ============================================================================
  // Tool Calling
  // ============================================================================

  /**
   * Complete with tools
   */
  async completeWithTools(
    prompt: string,
    tools: ToolDefinition[],
    options?: AICompletionOptions
  ): Promise<SDKResponse<AICompletionResult>> {
    try {
      const result = await this.aiProvider.completeWithTools(prompt, tools, options);
      return { success: true, data: result };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Execute tool calls
   */
  async executeToolCalls(
    toolCalls: any[],
    toolHandlers: Record<string, Function>
  ): Promise<SDKResponse<any[]>> {
    try {
      const results = await this.aiProvider.executeToolCalls(toolCalls, toolHandlers);
      return { success: true, data: results };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Adaptive Routing
  // ============================================================================

  /**
   * Enable adaptive routing
   */
  async enableAdaptiveRouting(): Promise<SDKResponse<void>> {
    try {
      await this.aiProvider.enableAdaptiveRouting();
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Disable adaptive routing
   */
  async disableAdaptiveRouting(): Promise<SDKResponse<void>> {
    try {
      await this.aiProvider.disableAdaptiveRouting();
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get router status
   */
  async getRouterStatus(): Promise<SDKResponse<any>> {
    try {
      const status = await this.aiProvider.getRouterStatus();
      return { success: true, data: status };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Set routing strategy
   */
  async setRoutingStrategy(strategy: string): Promise<SDKResponse<void>> {
    try {
      await this.aiProvider.setRoutingStrategy(strategy);
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Embeddings
  // ============================================================================

  /**
   * Generate embeddings
   */
  async embed(text: string | string[], model?: string): Promise<SDKResponse<number[][]>> {
    try {
      const embeddings = await this.aiProvider.embed(text, model);
      return { success: true, data: embeddings };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Generate single embedding
   */
  async embedSingle(text: string, model?: string): Promise<SDKResponse<number[]>> {
    try {
      const embedding = await this.aiProvider.embedSingle(text, model);
      return { success: true, data: embedding };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Token Management
  // ============================================================================

  /**
   * Count tokens
   */
  async countTokens(text: string, model?: string): Promise<SDKResponse<number>> {
    try {
      const count = await this.aiProvider.countTokens(text, model);
      return { success: true, data: count };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get token usage
   */
  async getTokenUsage(): Promise<SDKResponse<any>> {
    try {
      const usage = await this.aiProvider.getTokenUsage();
      return { success: true, data: usage };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Reset token usage
   */
  async resetTokenUsage(): Promise<SDKResponse<void>> {
    try {
      await this.aiProvider.resetTokenUsage();
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Provider-Specific Operations
  // ============================================================================

  /**
   * Claude-specific completion
   */
  async claude(
    prompt: string,
    options?: AICompletionOptions
  ): Promise<SDKResponse<AICompletionResult>> {
    try {
      const result = await this.aiProvider.claude(prompt, options);
      return { success: true, data: result };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * GPT-specific completion
   */
  async gpt(
    prompt: string,
    options?: AICompletionOptions
  ): Promise<SDKResponse<AICompletionResult>> {
    try {
      const result = await this.aiProvider.gpt(prompt, options);
      return { success: true, data: result };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Gemini-specific completion
   */
  async gemini(
    prompt: string,
    options?: AICompletionOptions
  ): Promise<SDKResponse<AICompletionResult>> {
    try {
      const result = await this.aiProvider.gemini(prompt, options);
      return { success: true, data: result };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Ollama local completion
   */
  async ollama(
    prompt: string,
    model: string,
    options?: AICompletionOptions
  ): Promise<SDKResponse<AICompletionResult>> {
    try {
      const result = await this.aiProvider.ollama(prompt, model, options);
      return { success: true, data: result };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private handleError(error: any): SDKResponse<any> {
    return {
      success: false,
      error: {
        code: error.code || 'AI_ERROR',
        message: error.message || 'AI operation failed',
        details: error,
        stack: error.stack,
      },
    };
  }
}
