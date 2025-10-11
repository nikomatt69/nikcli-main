/**
 * Comprehensive Error Handling
 * 
 * This module provides enterprise-level error handling for streamtty,
 * including custom error classes, graceful degradation, and safe rendering.
 */

import { StreamEvent } from './types/stream-events';

/**
 * Base error class for all streamtty errors
 */
export class StreamttyError extends Error {
  public readonly code: string;
  public readonly timestamp: number;
  public readonly context?: Record<string, any>;

  constructor(
    message: string,
    code: string = 'STREAMTTY_ERROR',
    context?: Record<string, any>
  ) {
    super(message);
    this.name = 'StreamttyError';
    this.code = code;
    this.timestamp = Date.now();
    this.context = context;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, StreamttyError);
    }
  }
}

/**
 * Parser-related errors
 */
export class StreamttyParseError extends StreamttyError {
  public readonly chunk?: string;
  public readonly position?: number;

  constructor(
    message: string,
    chunk?: string,
    position?: number,
    context?: Record<string, any>
  ) {
    super(message, 'PARSE_ERROR', { chunk, position, ...context });
    this.name = 'StreamttyParseError';
    this.chunk = chunk;
    this.position = position;
  }
}

/**
 * Renderer-related errors
 */
export class StreamttyRenderError extends StreamttyError {
  public readonly tokens?: any[];
  public readonly renderContext?: Record<string, any>;

  constructor(
    message: string,
    tokens?: any[],
    renderContext?: Record<string, any>,
    context?: Record<string, any>
  ) {
    super(message, 'RENDER_ERROR', { tokens, renderContext, ...context });
    this.name = 'StreamttyRenderError';
    this.tokens = tokens;
    this.renderContext = renderContext;
  }
}

/**
 * AI SDK adapter errors
 */
export class StreamttyAISDKError extends StreamttyError {
  public readonly event?: StreamEvent;
  public readonly adapterContext?: Record<string, any>;

  constructor(
    message: string,
    event?: StreamEvent,
    adapterContext?: Record<string, any>,
    context?: Record<string, any>
  ) {
    super(message, 'AI_SDK_ERROR', { event, adapterContext, ...context });
    this.name = 'StreamttyAISDKError';
    this.event = event;
    this.adapterContext = adapterContext;
  }
}

/**
 * Configuration errors
 */
export class StreamttyConfigError extends StreamttyError {
  public readonly option?: string;
  public readonly value?: any;

  constructor(
    message: string,
    option?: string,
    value?: any,
    context?: Record<string, any>
  ) {
    super(message, 'CONFIG_ERROR', { option, value, ...context });
    this.name = 'StreamttyConfigError';
    this.option = option;
    this.value = value;
  }
}

/**
 * Blessed/TTY related errors
 */
export class StreamttyTTYError extends StreamttyError {
  public readonly ttyOperation?: string;
  public readonly blessedContext?: Record<string, any>;

  constructor(
    message: string,
    ttyOperation?: string,
    blessedContext?: Record<string, any>,
    context?: Record<string, any>
  ) {
    super(message, 'TTY_ERROR', { ttyOperation, blessedContext, ...context });
    this.name = 'StreamttyTTYError';
    this.ttyOperation = ttyOperation;
    this.blessedContext = blessedContext;
  }
}

/**
 * Performance-related errors
 */
export class StreamttyPerformanceError extends StreamttyError {
  public readonly operation?: string;
  public readonly duration?: number;
  public readonly threshold?: number;

  constructor(
    message: string,
    operation?: string,
    duration?: number,
    threshold?: number,
    context?: Record<string, any>
  ) {
    super(message, 'PERFORMANCE_ERROR', { operation, duration, threshold, ...context });
    this.name = 'StreamttyPerformanceError';
    this.operation = operation;
    this.duration = duration;
    this.threshold = threshold;
  }
}

/**
 * Error handler interface
 */
export interface ErrorHandler {
  handle(error: Error, context?: Record<string, any>): void | Promise<void>;
  shouldRetry(error: Error, attempt: number): boolean;
  shouldFallback(error: Error): boolean;
}

/**
 * Default error handler implementation
 */
export class DefaultErrorHandler implements ErrorHandler {
  private maxRetries: number = 3;
  private fallbackEnabled: boolean = true;

  constructor(options: { maxRetries?: number; fallbackEnabled?: boolean } = {}) {
    this.maxRetries = options.maxRetries ?? 3;
    this.fallbackEnabled = options.fallbackEnabled ?? true;
  }

  handle(error: Error, context?: Record<string, any>): void {
    const errorInfo = this.formatErrorInfo(error, context);

    // Log error based on severity
    if (this.isCriticalError(error)) {
      console.error('🚨 Streamtty Critical Error:', errorInfo);
    } else if (this.isWarning(error)) {
      console.warn('⚠️ Streamtty Warning:', errorInfo);
    } else {
      console.log('ℹ️ Streamtty Info:', errorInfo);
    }
  }

  shouldRetry(error: Error, attempt: number): boolean {
    if (attempt >= this.maxRetries) {
      return false;
    }

    // Don't retry critical errors
    if (this.isCriticalError(error)) {
      return false;
    }

    // Retry transient errors
    if (error instanceof StreamttyParseError ||
      error instanceof StreamttyRenderError) {
      return true;
    }

    return false;
  }

  shouldFallback(error: Error): boolean {
    if (!this.fallbackEnabled) {
      return false;
    }

    // Fallback for rendering errors
    if (error instanceof StreamttyRenderError) {
      return true;
    }

    // Fallback for AI SDK errors
    if (error instanceof StreamttyAISDKError) {
      return true;
    }

    return false;
  }

  private formatErrorInfo(error: Error, context?: Record<string, any>): string {
    const baseInfo = {
      name: error.name,
      message: error.message,
      timestamp: new Date().toISOString()
    };

    if (error instanceof StreamttyError) {
      return JSON.stringify({
        ...baseInfo,
        code: error.code,
        context: error.context,
        additionalContext: context
      }, null, 2);
    }

    return JSON.stringify({
      ...baseInfo,
      additionalContext: context
    }, null, 2);
  }

  private isCriticalError(error: Error): boolean {
    if (error instanceof StreamttyTTYError) {
      return true;
    }

    if (error instanceof StreamttyConfigError) {
      return true;
    }

    return false;
  }

  private isWarning(error: Error): boolean {
    if (error instanceof StreamttyPerformanceError) {
      return true;
    }

    return false;
  }
}

/**
 * Safe operation wrapper
 */
export class SafeOperation {
  private errorHandler: ErrorHandler;
  private retryCount: number = 0;

  constructor(errorHandler: ErrorHandler = new DefaultErrorHandler()) {
    this.errorHandler = errorHandler;
  }

  /**
   * Execute an operation with error handling and retry logic
   */
  async execute<T>(
    operation: () => Promise<T>,
    context?: Record<string, any>
  ): Promise<T | null> {
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const result = await operation();
        this.retryCount = 0; // Reset on success
        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        this.errorHandler.handle(err, { attempt, ...context });

        if (this.errorHandler.shouldRetry(err, attempt) && attempt < maxAttempts - 1) {
          // Exponential backoff
          await this.delay(Math.pow(2, attempt) * 100);
          continue;
        }

        if (this.errorHandler.shouldFallback(err)) {
          return this.executeFallback(operation, err, context);
        }

        return null;
      }
    }

    return null;
  }

  /**
   * Execute with fallback
   */
  private async executeFallback<T>(
    operation: () => Promise<T>,
    originalError: Error,
    context?: Record<string, any>
  ): Promise<T | null> {
    try {
      // Implement fallback logic based on error type
      if (originalError instanceof StreamttyRenderError) {
        return this.fallbackRender(originalError, context);
      }

      if (originalError instanceof StreamttyAISDKError) {
        return this.fallbackAISDK(originalError, context);
      }

      return null;
    } catch (fallbackError) {
      const err = fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError));
      this.errorHandler.handle(err, {
        type: 'fallback_failed',
        originalError: originalError.message,
        ...context
      });
      return null;
    }
  }

  private async fallbackRender(
    error: StreamttyRenderError,
    context?: Record<string, any>
  ): Promise<any> {
    // Simple text fallback for render errors
    if (error.tokens && Array.isArray(error.tokens)) {
      return error.tokens
        .filter(token => token && token.raw)
        .map(token => token.raw)
        .join(' ');
    }

    return null;
  }

  private async fallbackAISDK(
    error: StreamttyAISDKError,
    context?: Record<string, any>
  ): Promise<any> {
    // Simple text fallback for AI SDK errors
    if (error.event && error.event.content) {
      return error.event.content;
    }

    return null;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Error recovery utilities
 */
export class ErrorRecovery {
  /**
   * Attempt to recover from a parsing error
   */
  static recoverFromParseError(
    error: StreamttyParseError,
    content: string
  ): string {
    if (!error.chunk) {
      return content;
    }

    // Try to remove the problematic chunk
    const recovered = content.replace(error.chunk, '[PARSE_ERROR]');
    return recovered;
  }

  /**
   * Attempt to recover from a render error
   */
  static recoverFromRenderError(
    error: StreamttyRenderError,
    content: string
  ): string {
    // Simple text recovery
    return content.replace(/[^\x20-\x7E\n\r\t]/g, '?');
  }

  /**
   * Attempt to recover from an AI SDK error
   */
  static recoverFromAISDKError(
    error: StreamttyAISDKError
  ): string {
    if (error.event) {
      switch (error.event.type) {
        case 'text_delta':
          return error.event.content || '';
        case 'tool_call':
          return `Tool: ${error.event.toolName}`;
        case 'tool_result':
          return 'Tool result received';
        case 'thinking':
        case 'reasoning':
          return `Thinking: ${error.event.content || ''}`;
        default:
          return `Event: ${error.event.type}`;
      }
    }

    return 'AI SDK error occurred';
  }
}

/**
 * Global error handler setup
 */
export function setupGlobalErrorHandling(): void {
  process.on('uncaughtException', (error) => {
    const handler = new DefaultErrorHandler();
    handler.handle(error, { type: 'uncaughtException' });
  });

  process.on('unhandledRejection', (reason) => {
    const handler = new DefaultErrorHandler();
    const error = reason instanceof Error ? reason : new Error(String(reason));
    handler.handle(error, { type: 'unhandledRejection' });
  });
}
