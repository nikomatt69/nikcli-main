import type * as Sentry from '@sentry/node'
import { getSentryProvider } from './sentry-provider'

export class BreadcrumbTracker {
  trackOperation(operation: string, data?: Record<string, unknown>): void {
    const sentry = getSentryProvider()
    if (!sentry) return

    sentry.addBreadcrumb({
      category: 'operation',
      message: operation,
      level: 'info',
      data,
      timestamp: Date.now() / 1000,
    })
  }

  trackHttpRequest(method: string, url: string, statusCode: number, duration: number): void {
    const sentry = getSentryProvider()
    if (!sentry) return

    sentry.addBreadcrumb({
      category: 'http',
      message: `${method} ${url}`,
      level: statusCode >= 400 ? 'error' : 'info',
      data: {
        method,
        url,
        status_code: statusCode,
        duration_ms: duration,
      },
      timestamp: Date.now() / 1000,
    })
  }

  trackAgentExecution(agentId: string, status: string, duration: number): void {
    const sentry = getSentryProvider()
    if (!sentry) return

    sentry.addBreadcrumb({
      category: 'agent',
      message: `Agent ${agentId} ${status}`,
      level: status === 'error' ? 'error' : 'info',
      data: {
        agent_id: agentId,
        status,
        duration_ms: duration,
      },
      timestamp: Date.now() / 1000,
    })
  }

  trackToolExecution(toolName: string, success: boolean, duration: number): void {
    const sentry = getSentryProvider()
    if (!sentry) return

    sentry.addBreadcrumb({
      category: 'tool',
      message: `Tool ${toolName} ${success ? 'succeeded' : 'failed'}`,
      level: success ? 'info' : 'error',
      data: {
        tool: toolName,
        success,
        duration_ms: duration,
      },
      timestamp: Date.now() / 1000,
    })
  }

  trackUserAction(action: string, data?: Record<string, unknown>): void {
    const sentry = getSentryProvider()
    if (!sentry) return

    sentry.addBreadcrumb({
      category: 'user',
      message: action,
      level: 'info',
      data,
      timestamp: Date.now() / 1000,
    })
  }
}

export const breadcrumbTracker = new BreadcrumbTracker()
