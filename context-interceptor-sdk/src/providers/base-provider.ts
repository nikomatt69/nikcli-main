import { z } from 'zod';
import { ContextPattern } from '../types';

export interface UsageStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
}

export interface Provider<TRequest, TResponse> {
  name: string;
  validateRequest(request: TRequest): Promise<void>;
  injectContext(request: TRequest, context: ContextPattern): Promise<TRequest>;
  executeRequest(request: TRequest): Promise<TResponse>;
  extractUsage(response: TResponse): UsageStats;
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
}

export abstract class BaseProvider<TRequest, TResponse> implements Provider<TRequest, TResponse> {
  abstract name: string;
  abstract requestSchema: z.ZodSchema<TRequest>;
  abstract responseSchema: z.ZodSchema<TResponse>;
  abstract supportsStreaming: boolean;
  abstract supportsTools: boolean;
  abstract supportsVision: boolean;

  async validateRequest(request: TRequest): Promise<void> {
    await this.requestSchema.parseAsync(request);
  }

  async validateResponse(response: TResponse): Promise<void> {
    await this.responseSchema.parseAsync(response);
  }

  abstract injectContext(request: TRequest, context: ContextPattern): Promise<TRequest>;
  abstract executeRequest(request: TRequest): Promise<TResponse>;
  abstract extractUsage(response: TResponse): UsageStats;
}

