import { BaseProvider, UsageStats } from '../base-provider';
import {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionRequestSchema,
  ChatCompletionResponseSchema,
} from './schemas';
import { ContextPattern } from '../../types';
import { ChatCompletionsHandler } from './chat-completions';
import { TokenManager } from './token-manager';
import { OpenAIErrorHandler } from './error-handler';
import { Logger } from '../../utils/logger';
import { calculateTokenCost } from './model-config';

export class OpenAIProvider extends BaseProvider<ChatCompletionRequest, ChatCompletionResponse> {
  name = 'openai';
  requestSchema = ChatCompletionRequestSchema;
  responseSchema = ChatCompletionResponseSchema;
  supportsStreaming = true;
  supportsTools = true;
  supportsVision = true;

  private chatHandler: ChatCompletionsHandler;
  private tokenManager: TokenManager;
  private errorHandler: OpenAIErrorHandler;
  private logger: Logger;

  constructor(logger: Logger) {
    super();
    this.logger = logger;
    this.tokenManager = new TokenManager(logger);
    this.errorHandler = new OpenAIErrorHandler(logger);
    this.chatHandler = new ChatCompletionsHandler(this.tokenManager, this.errorHandler, logger);
  }

  async injectContext(request: ChatCompletionRequest, context: ContextPattern): Promise<ChatCompletionRequest> {
    this.logger.debug('OpenAI Provider: Injecting context', {
      model: request.model,
      originalMessages: request.messages.length,
    });

    return this.chatHandler.injectContext(request, context);
  }

  async executeRequest(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    this.logger.debug('OpenAI Provider: Executing request', {
      model: request.model,
      streaming: request.stream,
    });

    // This is a placeholder - actual execution happens via interceptor
    // The provider validates and prepares requests
    throw new Error('Direct execution not implemented. Use interceptor.');
  }

  extractUsage(response: ChatCompletionResponse): UsageStats {
    const usage = this.chatHandler.extractUsage(response);
    const cost = calculateTokenCost(response.model, usage.inputTokens, usage.outputTokens);

    return {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.inputTokens + usage.outputTokens,
      cost,
    };
  }
}

