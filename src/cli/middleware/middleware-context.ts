import { ModuleContext } from '../core/module-manager';
import { MiddlewareContext } from './types';
import { v4 as uuidv4 } from 'uuid';

export class MiddlewareContextBuilder {
  static fromModuleContext(
    moduleContext: ModuleContext,
    metadata: Record<string, any> = {}
  ): MiddlewareContext {
    return {
      ...moduleContext,
      requestId: uuidv4(),
      timestamp: new Date(),
      userId: process.env.USER || 'unknown',
      metadata: {
        nodeVersion: process.version,
        platform: process.platform,
        pid: process.pid,
        cwd: process.cwd(),
        ...metadata
      }
    };
  }

  static enhance(
    context: MiddlewareContext,
    additionalMetadata: Record<string, any>
  ): MiddlewareContext {
    return {
      ...context,
      metadata: {
        ...context.metadata,
        ...additionalMetadata
      }
    };
  }

  static forRequest(
    operation: string,
    args: any[],
    baseContext: ModuleContext
  ): MiddlewareContext {
    return this.fromModuleContext(baseContext, {
      operation,
      args: args.length,
      argsTypes: args.map(arg => typeof arg),
      requestSize: JSON.stringify(args).length
    });
  }
}

export class ContextSanitizer {
  private static readonly SENSITIVE_KEYS = [
    'password', 'token', 'key', 'secret', 'auth', 'credential',
    'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'
  ];

  static sanitizeForLogging(context: MiddlewareContext): MiddlewareContext {
    return {
      ...context,
      metadata: this.sanitizeObject(context.metadata)
    };
  }

  private static sanitizeObject(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }

    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (this.isSensitiveKey(key)) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object') {
        sanitized[key] = this.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private static isSensitiveKey(key: string): boolean {
    const lowerKey = key.toLowerCase();
    return this.SENSITIVE_KEYS.some(sensitive => 
      lowerKey.includes(sensitive.toLowerCase())
    );
  }
}