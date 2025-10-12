"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorRecovery = exports.SafeOperation = exports.DefaultErrorHandler = exports.StreamttyPerformanceError = exports.StreamttyTTYError = exports.StreamttyConfigError = exports.StreamttyAISDKError = exports.StreamttyRenderError = exports.StreamttyParseError = exports.StreamttyError = void 0;
exports.setupGlobalErrorHandling = setupGlobalErrorHandling;
class StreamttyError extends Error {
    constructor(message, code = 'STREAMTTY_ERROR', context) {
        super(message);
        this.name = 'StreamttyError';
        this.code = code;
        this.timestamp = Date.now();
        this.context = context;
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, StreamttyError);
        }
    }
}
exports.StreamttyError = StreamttyError;
class StreamttyParseError extends StreamttyError {
    constructor(message, chunk, position, context) {
        super(message, 'PARSE_ERROR', { chunk, position, ...context });
        this.name = 'StreamttyParseError';
        this.chunk = chunk;
        this.position = position;
    }
}
exports.StreamttyParseError = StreamttyParseError;
class StreamttyRenderError extends StreamttyError {
    constructor(message, tokens, renderContext, context) {
        super(message, 'RENDER_ERROR', { tokens, renderContext, ...context });
        this.name = 'StreamttyRenderError';
        this.tokens = tokens;
        this.renderContext = renderContext;
    }
}
exports.StreamttyRenderError = StreamttyRenderError;
class StreamttyAISDKError extends StreamttyError {
    constructor(message, event, adapterContext, context) {
        super(message, 'AI_SDK_ERROR', { event, adapterContext, ...context });
        this.name = 'StreamttyAISDKError';
        this.event = event;
        this.adapterContext = adapterContext;
    }
}
exports.StreamttyAISDKError = StreamttyAISDKError;
class StreamttyConfigError extends StreamttyError {
    constructor(message, option, value, context) {
        super(message, 'CONFIG_ERROR', { option, value, ...context });
        this.name = 'StreamttyConfigError';
        this.option = option;
        this.value = value;
    }
}
exports.StreamttyConfigError = StreamttyConfigError;
class StreamttyTTYError extends StreamttyError {
    constructor(message, ttyOperation, blessedContext, context) {
        super(message, 'TTY_ERROR', { ttyOperation, blessedContext, ...context });
        this.name = 'StreamttyTTYError';
        this.ttyOperation = ttyOperation;
        this.blessedContext = blessedContext;
    }
}
exports.StreamttyTTYError = StreamttyTTYError;
class StreamttyPerformanceError extends StreamttyError {
    constructor(message, operation, duration, threshold, context) {
        super(message, 'PERFORMANCE_ERROR', { operation, duration, threshold, ...context });
        this.name = 'StreamttyPerformanceError';
        this.operation = operation;
        this.duration = duration;
        this.threshold = threshold;
    }
}
exports.StreamttyPerformanceError = StreamttyPerformanceError;
class DefaultErrorHandler {
    constructor(options = {}) {
        this.maxRetries = 3;
        this.fallbackEnabled = true;
        this.maxRetries = options.maxRetries ?? 3;
        this.fallbackEnabled = options.fallbackEnabled ?? true;
    }
    handle(error, context) {
        const errorInfo = this.formatErrorInfo(error, context);
        if (this.isCriticalError(error)) {
            console.error('🚨 Streamtty Critical Error:', errorInfo);
        }
        else if (this.isWarning(error)) {
            console.warn('⚠️ Streamtty Warning:', errorInfo);
        }
        else {
            console.log('ℹ️ Streamtty Info:', errorInfo);
        }
    }
    shouldRetry(error, attempt) {
        if (attempt >= this.maxRetries) {
            return false;
        }
        if (this.isCriticalError(error)) {
            return false;
        }
        if (error instanceof StreamttyParseError ||
            error instanceof StreamttyRenderError) {
            return true;
        }
        return false;
    }
    shouldFallback(error) {
        if (!this.fallbackEnabled) {
            return false;
        }
        if (error instanceof StreamttyRenderError) {
            return true;
        }
        if (error instanceof StreamttyAISDKError) {
            return true;
        }
        return false;
    }
    formatErrorInfo(error, context) {
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
    isCriticalError(error) {
        if (error instanceof StreamttyTTYError) {
            return true;
        }
        if (error instanceof StreamttyConfigError) {
            return true;
        }
        return false;
    }
    isWarning(error) {
        if (error instanceof StreamttyPerformanceError) {
            return true;
        }
        return false;
    }
}
exports.DefaultErrorHandler = DefaultErrorHandler;
class SafeOperation {
    constructor(errorHandler = new DefaultErrorHandler()) {
        this.retryCount = 0;
        this.errorHandler = errorHandler;
    }
    async execute(operation, context) {
        const maxAttempts = 3;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const result = await operation();
                this.retryCount = 0;
                return result;
            }
            catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                this.errorHandler.handle(err, { attempt, ...context });
                if (this.errorHandler.shouldRetry(err, attempt) && attempt < maxAttempts - 1) {
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
    async executeFallback(operation, originalError, context) {
        try {
            if (originalError instanceof StreamttyRenderError) {
                return this.fallbackRender(originalError, context);
            }
            if (originalError instanceof StreamttyAISDKError) {
                return this.fallbackAISDK(originalError, context);
            }
            return null;
        }
        catch (fallbackError) {
            const err = fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError));
            this.errorHandler.handle(err, {
                type: 'fallback_failed',
                originalError: originalError.message,
                ...context
            });
            return null;
        }
    }
    async fallbackRender(error, context) {
        if (error.tokens && Array.isArray(error.tokens)) {
            return error.tokens
                .filter(token => token && token.raw)
                .map(token => token.raw)
                .join(' ');
        }
        return null;
    }
    async fallbackAISDK(error, context) {
        if (error.event && error.event.content) {
            return error.event.content;
        }
        return null;
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.SafeOperation = SafeOperation;
class ErrorRecovery {
    static recoverFromParseError(error, content) {
        if (!error.chunk) {
            return content;
        }
        const recovered = content.replace(error.chunk, '[PARSE_ERROR]');
        return recovered;
    }
    static recoverFromRenderError(error, content) {
        return content.replace(/[^\x20-\x7E\n\r\t]/g, '?');
    }
    static recoverFromAISDKError(error) {
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
exports.ErrorRecovery = ErrorRecovery;
function setupGlobalErrorHandling() {
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
