/**
 * Native macOS Notification Provider
 *
 * This provider sends notifications to the NikCLI Tauri menubar app,
 * which displays native macOS notifications via the notification plugin.
 */

import type {
  NotificationPayload,
  NotificationResult,
  NativeProviderConfig,
  NotificationType,
  NotificationSeverity,
} from '../../types/notifications'
import { NotificationProvider, NotificationErrorCode } from '../../types/notifications'

const DEFAULT_PORT = 3001

interface TauriNotificationPayload {
  title: string
  body: string
  icon?: string
  sound?: boolean
}

/**
 * Sends notifications to the Tauri menubar app via local HTTP
 */
export class NativeNotificationProvider {
  private config: NativeProviderConfig
  private baseUrl: string

  constructor(config: NativeProviderConfig) {
    this.config = config
    const port = config.port || DEFAULT_PORT
    this.baseUrl = `http://localhost:${port}`
  }

  /**
   * Check if the Tauri app is running
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(1000),
      })
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Send notification to Tauri app
   */
  async send(payload: NotificationPayload): Promise<NotificationResult> {
    const startTime = Date.now()

    if (!this.config.enabled) {
      return {
        provider: NotificationProvider.NATIVE,
        success: false,
        error: {
          code: NotificationErrorCode.INVALID_CONFIG,
          message: 'Native notification provider is disabled',
          retryable: false,
        },
        timestamp: new Date(),
        duration: Date.now() - startTime,
        attemptNumber: 1,
      }
    }

    try {
      const tauriPayload = this.formatPayload(payload)

      const response = await fetch(`${this.baseUrl}/notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(tauriPayload),
        signal: AbortSignal.timeout(5000),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return {
        provider: NotificationProvider.NATIVE,
        success: true,
        timestamp: new Date(),
        duration: Date.now() - startTime,
        attemptNumber: 1,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      const isTimeout = message.includes('timeout') || message.includes('abort')
      const isNetwork = message.includes('fetch') || message.includes('ECONNREFUSED')

      return {
        provider: NotificationProvider.NATIVE,
        success: false,
        error: {
          code: isTimeout
            ? NotificationErrorCode.TIMEOUT
            : isNetwork
              ? NotificationErrorCode.NETWORK_ERROR
              : NotificationErrorCode.PROVIDER_ERROR,
          message,
          retryable: isNetwork || isTimeout,
        },
        timestamp: new Date(),
        duration: Date.now() - startTime,
        attemptNumber: 1,
      }
    }
  }

  /**
   * Format notification payload for Tauri
   */
  private formatPayload(payload: NotificationPayload): TauriNotificationPayload {
    const title = this.getTitle(payload)
    const body = this.getBody(payload)

    return {
      title,
      body,
      sound: payload.severity === 'error' || payload.severity === 'success',
    }
  }

  private getTitle(payload: NotificationPayload): string {
    switch (payload.type) {
      case 'task_started':
        return `Task Started: ${(payload as any).taskTitle}`
      case 'task_completed':
        return `Task Completed: ${(payload as any).taskTitle}`
      case 'task_failed':
        return `Task Failed: ${(payload as any).taskTitle}`
      case 'plan_started':
        return `Plan Started: ${(payload as any).planTitle}`
      case 'plan_completed':
        return `Plan Completed: ${(payload as any).planTitle}`
      case 'plan_failed':
        return `Plan Failed: ${(payload as any).planTitle}`
      default:
        return 'NikCLI Notification'
    }
  }

  private getBody(payload: NotificationPayload): string {
    const parts: string[] = []

    if ('taskDescription' in payload && payload.taskDescription) {
      parts.push(payload.taskDescription)
    }

    if ('planDescription' in payload && payload.planDescription) {
      parts.push(payload.planDescription)
    }

    if ('duration' in payload && payload.duration) {
      const seconds = Math.round(payload.duration / 1000)
      parts.push(`Duration: ${seconds}s`)
    }

    if ('error' in payload && payload.error) {
      parts.push(`Error: ${payload.error}`)
    }

    if ('completedTasks' in payload && 'totalTasks' in payload) {
      parts.push(`${payload.completedTasks}/${payload.totalTasks} tasks completed`)
    }

    return parts.join('\n') || 'No additional details'
  }
}

/**
 * Create a native notification provider instance
 */
export function createNativeProvider(config: NativeProviderConfig): NativeNotificationProvider {
  return new NativeNotificationProvider(config)
}
