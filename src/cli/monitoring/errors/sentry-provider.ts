/**
 * Sentry Error Tracking Provider
 *
 * Provides error tracking and monitoring via Sentry.
 * Uses lazy loading to avoid NAPI crashes in Bun standalone mode.
 */

import type { MiddlewareContext } from '../../middleware/types'
import { isNapiSafe, createLazyNapiLoader } from '../../utils/runtime-detect'

// Lazy load Sentry to avoid NAPI crash in Bun standalone
const getSentry = createLazyNapiLoader('@sentry/node', async () => {
  const Sentry = await import('@sentry/node')
  return Sentry
})

const getSentryProfiling = createLazyNapiLoader('@sentry/profiling-node', async () => {
  const profiling = await import('@sentry/profiling-node')
  return profiling
})

// Type for Sentry severity level
type SeverityLevel = 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug'

// Type for Sentry breadcrumb
interface Breadcrumb {
  type?: string
  level?: SeverityLevel
  event_id?: string
  category?: string
  message?: string
  data?: Record<string, any>
  timestamp?: number
}

export interface SentryConfig {
  readonly dsn?: string
  readonly environment: string
  readonly release: string
  readonly enabled: boolean
  readonly sampleRate: number
  readonly tracesSampleRate: number
  readonly profilesSampleRate: number
  readonly debug?: boolean
}

export class SentryProvider {
  private readonly config: SentryConfig
  private initialized = false
  private sentryModule: any = null
  private unavailable = false

  constructor(config: SentryConfig) {
    this.config = config
  }

  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      console.log('[Sentry] Disabled by configuration')
      return
    }

    if (!this.config.dsn) {
      console.warn('[Sentry] No DSN provided, skipping initialization')
      return
    }

    if (this.initialized) {
      console.warn('[Sentry] Already initialized')
      return
    }

    // Check if NAPI modules are safe
    if (!isNapiSafe()) {
      console.warn('[Sentry] Skipping initialization in Bun standalone mode (uses NAPI/libuv)')
      this.unavailable = true
      return
    }

    try {
      // Lazy load Sentry modules
      const Sentry = await getSentry()
      const profiling = await getSentryProfiling()

      if (!Sentry) {
        console.warn('[Sentry] Failed to load @sentry/node module')
        this.unavailable = true
        return
      }

      this.sentryModule = Sentry

      // Build integrations array
      const integrations: any[] = [Sentry.httpIntegration({}), Sentry.expressIntegration()]

      // Add profiling if available
      if (profiling?.nodeProfilingIntegration) {
        integrations.unshift(profiling.nodeProfilingIntegration())
      }

      Sentry.init({
        dsn: this.config.dsn,
        environment: this.config.environment,
        release: this.config.release,
        debug: this.config.debug || false,
        integrations,
        tracesSampleRate: this.config.tracesSampleRate,
        profilesSampleRate: this.config.profilesSampleRate,
        beforeSend(event, _hint) {
          if (event.request?.headers) {
            delete event.request.headers['authorization']
            delete event.request.headers['cookie']
            delete event.request.headers['x-api-key']
          }

          if (event.extra) {
            const sensitiveKeys = ['password', 'token', 'apiKey', 'secret', 'privateKey']
            for (const key of sensitiveKeys) {
              if (key in event.extra) {
                event.extra[key] = '[REDACTED]'
              }
            }
          }

          return event
        },
      })

      this.initialized = true
      console.log('[Sentry] Initialized successfully', {
        environment: this.config.environment,
        release: this.config.release,
      })
    } catch (error) {
      console.error('[Sentry] Failed to initialize:', error)
      this.unavailable = true
    }
  }

  captureError(error: Error, context?: MiddlewareContext): string {
    if (!this.initialized || !this.sentryModule) {
      return ''
    }

    return this.sentryModule.captureException(error, {
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
    })
  }

  captureMessage(message: string, level: SeverityLevel = 'info', context?: Record<string, unknown>): string {
    if (!this.initialized || !this.sentryModule) {
      return ''
    }

    return this.sentryModule.captureMessage(message, {
      level,
      extra: context,
    })
  }

  addBreadcrumb(breadcrumb: Breadcrumb): void {
    if (!this.initialized || !this.sentryModule) {
      return
    }

    this.sentryModule.addBreadcrumb(breadcrumb)
  }

  setUser(user: { id?: string; email?: string; username?: string }): void {
    if (!this.initialized || !this.sentryModule) {
      return
    }

    this.sentryModule.setUser(user)
  }

  setTag(key: string, value: string): void {
    if (!this.initialized || !this.sentryModule) {
      return
    }

    this.sentryModule.setTag(key, value)
  }

  setContext(name: string, context: Record<string, unknown>): void {
    if (!this.initialized || !this.sentryModule) {
      return
    }

    this.sentryModule.setContext(name, context)
  }

  startTransaction(name: string, op: string): any {
    if (!this.initialized || !this.sentryModule) {
      return undefined
    }

    // Use startSpan for newer Sentry versions, fallback to startTransaction
    if (typeof this.sentryModule.startSpan === 'function') {
      return this.sentryModule.startSpan({ name, op }, () => {})
    } else {
      return this.sentryModule.startTransaction({ name, op })
    }
  }

  async flush(timeout = 2000): Promise<boolean> {
    if (!this.initialized || !this.sentryModule) {
      return false
    }

    return this.sentryModule.flush(timeout)
  }

  async close(timeout = 2000): Promise<boolean> {
    if (!this.initialized || !this.sentryModule) {
      return false
    }

    try {
      const result = await this.sentryModule.close(timeout)
      this.initialized = false
      console.log('[Sentry] Closed successfully')
      return result
    } catch (error) {
      console.error('[Sentry] Error during close:', error)
      return false
    }
  }

  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Check if Sentry is available in current runtime
   */
  isAvailable(): boolean {
    return !this.unavailable && isNapiSafe()
  }
}

let sentryProvider: SentryProvider | undefined

export async function initializeSentry(config: SentryConfig): Promise<SentryProvider> {
  if (!sentryProvider) {
    sentryProvider = new SentryProvider(config)
    await sentryProvider.initialize()
  }
  return sentryProvider
}

export function getSentryProvider(): SentryProvider | undefined {
  return sentryProvider
}

/**
 * Check if Sentry is available in current runtime
 */
export function isSentryAvailable(): boolean {
  return isNapiSafe()
}
