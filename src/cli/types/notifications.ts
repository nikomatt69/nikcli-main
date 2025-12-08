// src/cli/types/notifications.ts

/**
 * Notification system types for multi-provider task completion alerts
 */

export enum NotificationProvider {
  SLACK = 'slack',
  DISCORD = 'discord',
  LINEAR = 'linear',
  NATIVE = 'native',
}

export enum NotificationType {
  TASK_STARTED = 'task_started',
  TASK_COMPLETED = 'task_completed',
  TASK_FAILED = 'task_failed',
  PLAN_STARTED = 'plan_started',
  PLAN_COMPLETED = 'plan_completed',
  PLAN_FAILED = 'plan_failed',
}

export enum NotificationSeverity {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
}

/**
 * Base notification payload
 */
export interface BaseNotificationPayload {
  type: NotificationType
  severity: NotificationSeverity
  timestamp: Date
  sessionId: string
  workingDirectory: string
  userEmail?: string
  userId?: string
}

/**
 * Task completion notification payload
 */
export interface TaskCompletionPayload extends BaseNotificationPayload {
  type: NotificationType.TASK_COMPLETED | NotificationType.TASK_FAILED
  taskId: string
  taskTitle: string
  taskDescription?: string
  agentName: string
  blueprintId: string
  duration?: number // milliseconds
  success: boolean
  error?: string
  output?: string
}

/**
 * Task started notification payload
 */
export interface TaskStartedPayload extends BaseNotificationPayload {
  type: NotificationType.TASK_STARTED
  taskId: string
  taskTitle: string
  taskDescription?: string
  agentName: string
  blueprintId: string
  planId?: string
  planTitle?: string
}

/**
 * Plan completion notification payload
 */
export interface PlanCompletionPayload extends BaseNotificationPayload {
  type: NotificationType.PLAN_COMPLETED | NotificationType.PLAN_FAILED
  planId: string
  planTitle: string
  planDescription?: string
  totalTasks: number
  completedTasks: number
  failedTasks: number
  agents: string[]
  totalDuration?: number // milliseconds
  success: boolean
}

/**
 * Plan started notification payload
 */
export interface PlanStartedPayload extends BaseNotificationPayload {
  type: NotificationType.PLAN_STARTED
  planId: string
  planTitle: string
  planDescription?: string
  totalTasks: number
  agents?: string[]
}

/**
 * Union type for all notification payloads
 */
export type NotificationPayload =
  | TaskCompletionPayload
  | TaskStartedPayload
  | PlanCompletionPayload
  | PlanStartedPayload

/**
 * Slack provider configuration
 */
export interface SlackProviderConfig {
  enabled: boolean
  webhookUrl?: string
  channel?: string
  username?: string
  iconEmoji?: string
}

/**
 * Discord provider configuration
 */
export interface DiscordProviderConfig {
  enabled: boolean
  webhookUrl?: string
  username?: string
  avatarUrl?: string
}

/**
 * Linear provider configuration
 */
export interface LinearProviderConfig {
  enabled: boolean
  apiKey?: string
  teamId?: string
  createIssues?: boolean // Auto-create issues for failed tasks
}

/**
 * Native macOS notification provider configuration
 */
export interface NativeProviderConfig {
  enabled: boolean
  port?: number // Port for Tauri app communication (default: 3001)
}

/**
 * Provider-specific configurations
 */
export interface ProviderConfigs {
  slack?: SlackProviderConfig
  discord?: DiscordProviderConfig
  linear?: LinearProviderConfig
  native?: NativeProviderConfig
}

/**
 * Notification service configuration
 */
export interface NotificationConfig {
  enabled: boolean
  providers: ProviderConfigs
  deduplication?: {
    enabled: boolean
    windowMs: number // Deduplication window in milliseconds
  }
  rateLimit?: {
    enabled: boolean
    maxPerMinute: number
  }
  retry?: {
    enabled: boolean
    maxAttempts: number
    backoffMs: number // Initial backoff delay
  }
  timeout?: {
    requestTimeoutMs: number
  }
}

/**
 * Notification delivery result
 */
export interface NotificationResult {
  provider: NotificationProvider
  success: boolean
  error?: NotificationError
  timestamp: Date
  duration: number // milliseconds
  attemptNumber: number
}

/**
 * Notification error details
 */
export interface NotificationError {
  code: NotificationErrorCode
  message: string
  details?: any
  retryable: boolean
}

/**
 * Notification error codes
 */
export enum NotificationErrorCode {
  INVALID_CONFIG = 'invalid_config',
  MISSING_CREDENTIALS = 'missing_credentials',
  NETWORK_ERROR = 'network_error',
  TIMEOUT = 'timeout',
  RATE_LIMITED = 'rate_limited',
  INVALID_PAYLOAD = 'invalid_payload',
  PROVIDER_ERROR = 'provider_error',
  UNKNOWN = 'unknown',
}

/**
 * Notification queue item
 */
export interface NotificationQueueItem {
  id: string
  payload: NotificationPayload
  providers: NotificationProvider[]
  timestamp: Date
  attempts: number
  lastAttempt?: Date
  nextRetry?: Date
}

/**
 * Notification delivery status
 */
export interface NotificationDeliveryStatus {
  queueId: string
  payload: NotificationPayload
  results: NotificationResult[]
  allSucceeded: boolean
  allFailed: boolean
  partialSuccess: boolean
  timestamp: Date
}

/**
 * Notification cache entry (for deduplication)
 */
export interface NotificationCacheEntry {
  key: string
  payload: NotificationPayload
  timestamp: Date
  expiresAt: Date
}
