/**
 * Slack Integration Types
 */

export interface SlackConfig {
  enabled: boolean
  webhookUrl?: string
  channel?: string
  username?: string
  taskNotifications?: boolean
}

export interface SlackNotificationSettings {
  jobCompleted: boolean
  jobFailed: boolean
  jobStarted: boolean
  toolApproval: boolean
  dailyDigest: boolean
}

export interface SlackConnection {
  isConnected: boolean
  channel?: string
  username?: string
  lastMessageSent?: Date | string
  messageCount?: number
}

export interface SlackTestMessageRequest {
  message: string
  channel?: string
}

export interface SlackTestMessageResponse {
  success: boolean
  timestamp?: string
  error?: string
}
