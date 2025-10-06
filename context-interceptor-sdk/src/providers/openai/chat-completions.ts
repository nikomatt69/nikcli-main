import { TokenManager } from './token-manager';
import { OpenAIErrorHandler } from './error-handler';
import { Logger } from '../../utils/logger';
import { ContextPattern } from '../../types';
import type { ChatCompletionRequest, ChatCompletionResponse } from './schemas';

export class ChatCompletionsHandler {
  private tokenManager: TokenManager;
  private errorHandler: OpenAIErrorHandler;
  private logger: Logger;

  constructor(tokenManager: TokenManager, errorHandler: OpenAIErrorHandler, logger: Logger) {
    this.tokenManager = tokenManager;
    this.errorHandler = errorHandler;
    this.logger = logger;
  }

  async injectContext(request: ChatCompletionRequest, context: ContextPattern): Promise<ChatCompletionRequest> {
    const contextText = context.relevantChunks.map((c) => c.text).join('\n\n');

    const systemMessage = {
      role: 'system' as const,
      content: context.systemPrompt
        ? `${context.systemPrompt}\n\n### Relevant Context:\n${contextText}`
        : `### Relevant Context:\n${contextText}`,
    };

    const enhancedMessages = [systemMessage, ...request.messages.filter((m) => m.role !== 'system')];

    return {
      ...request,
      messages: enhancedMessages,
    };
  }

  extractUsage(response: ChatCompletionResponse): {
    inputTokens: number;
    outputTokens: number;
  } {
    return {
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
    };
  }
}
