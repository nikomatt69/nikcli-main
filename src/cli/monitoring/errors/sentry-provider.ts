import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import type { MiddlewareContext } from '../../middleware/types';

export interface SentryConfig {
  readonly dsn?: string;
  readonly environment: string;
  readonly release: string;
  readonly enabled: boolean;
  readonly sampleRate: number;
  readonly tracesSampleRate: number;
  readonly profilesSampleRate: number;
  readonly debug?: boolean;
}

export class SentryProvider {
  private readonly config: SentryConfig;
  private initialized = false;

  constructor(config: SentryConfig) {
    this.config = config;
  }

  initialize(): void {
    if (!this.config.enabled) {
      console.log('[Sentry] Disabled by configuration');
      return;
    }

    if (!this.config.dsn) {
      console.warn('[Sentry] No DSN provided, skipping initialization');
      return;
    }

    if (this.initialized) {
      console.warn('[Sentry] Already initialized');
      return;
    }

    try {
      Sentry.init({
        dsn: this.config.dsn,
        environment: this.config.environment,
        release: this.config.release,
        debug: this.config.debug || false,
        integrations: [
          nodeProfilingIntegration(),
          Sentry.httpIntegration({}),
          Sentry.expressIntegration(),
        ],
        tracesSampleRate: this.config.tracesSampleRate,
        profilesSampleRate: this.config.profilesSampleRate,
        beforeSend(event, hint) {
          if (event.request?.headers) {
            delete event.request.headers['authorization'];
            delete event.request.headers['cookie'];
            delete event.request.headers['x-api-key'];
          }

          if (event.extra) {
            const sensitiveKeys = ['password', 'token', 'apiKey', 'secret', 'privateKey'];
            for (const key of sensitiveKeys) {
              if (key in event.extra) {
                event.extra[key] = '[REDACTED]';
              }
            }
          }

          return event;
        },
      });

      this.initialized = true;
      console.log('[Sentry] Initialized successfully', {
        environment: this.config.environment,
        release: this.config.release,
      });
    } catch (error) {
      console.error('[Sentry] Failed to initialize:', error);
    }
  }

  captureError(error: Error, context?: MiddlewareContext): string {
    if (!this.initialized) {
      return '';
    }

    return Sentry.captureException(error, {
      tags: {
        requestId: context?.requestId,
        userId: context?.userId,
      },
      contexts: {
        middleware: {
          ...(context?.metadata || {}),
        },
      },
      level: 'error',
    });
  }

  captureMessage(message: string, level: Sentry.SeverityLevel = 'info', context?: Record<string, unknown>): string {
    if (!this.initialized) {
      return '';
    }

    return Sentry.captureMessage(message, {
      level,
      extra: context,
    });
  }

  addBreadcrumb(breadcrumb: Sentry.Breadcrumb): void {
    if (!this.initialized) {
      return;
    }

    Sentry.addBreadcrumb(breadcrumb);
  }

  setUser(user: { id?: string; email?: string; username?: string }): void {
    if (!this.initialized) {
      return;
    }

    Sentry.setUser(user);
  }

  setTag(key: string, value: string): void {
    if (!this.initialized) {
      return;
    }

    Sentry.setTag(key, value);
  }

  setContext(name: string, context: Record<string, unknown>): void {
    if (!this.initialized) {
      return;
    }

    Sentry.setContext(name, context);
  }

  startTransaction(name: string, op: string): any {
    if (!this.initialized) {
      return undefined;
    }

    // Use startSpan for newer Sentry versions, fallback to startTransaction
    if (typeof Sentry.startSpan === 'function') {
      return Sentry.startSpan({ name, op }, () => { });
    } else {
      return (Sentry as any).startTransaction({ name, op });
    }
  }

  async flush(timeout = 2000): Promise<boolean> {
    if (!this.initialized) {
      return false;
    }

    return Sentry.flush(timeout);
  }

  async close(timeout = 2000): Promise<boolean> {
    if (!this.initialized) {
      return false;
    }

    try {
      const result = await Sentry.close(timeout);
      this.initialized = false;
      console.log('[Sentry] Closed successfully');
      return result;
    } catch (error) {
      console.error('[Sentry] Error during close:', error);
      return false;
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

let sentryProvider: SentryProvider | undefined;

export function initializeSentry(config: SentryConfig): SentryProvider {
  if (!sentryProvider) {
    sentryProvider = new SentryProvider(config);
    sentryProvider.initialize();
  }
  return sentryProvider;
}

export function getSentryProvider(): SentryProvider | undefined {
  return sentryProvider;
}
