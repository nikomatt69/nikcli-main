/**
 * Settings and Configuration Types
 */

export type AIProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'ollama'
  | 'vercel'
  | 'gateway'
  | 'openrouter'
  | 'cerebras'

export type SecurityMode = 'safe' | 'default' | 'developer'

export type SubscriptionTier = 'free' | 'pro' | 'enterprise'

export interface ModelConfig {
  id: string
  name: string
  provider: AIProvider
  enableReasoning?: boolean
  maxTokens?: number
  temperature?: number
  apiKey?: string
}

export interface APIKeyStatus {
  provider: AIProvider
  isConfigured: boolean
  maskedKey?: string
  lastValidated?: Date | string
}

export interface UserProfile {
  id: string
  email: string
  username?: string
  subscriptionTier: SubscriptionTier
  createdAt: Date | string
  preferences: UserPreferences
  quotas?: UserQuotas
  usage?: UserUsage
}

export interface UserPreferences {
  theme?: 'dark' | 'light' | 'system'
  language?: string
  notifications?: NotificationPreferences
  defaultModel?: string
  autoApproveTools?: {
    file?: boolean
    git?: boolean
    package?: boolean
    system?: boolean
    network?: boolean
  }
}

export interface NotificationPreferences {
  email?: boolean
  slack?: boolean
  jobCompleted?: boolean
  jobFailed?: boolean
  toolApproval?: boolean
}

export interface UserQuotas {
  maxSessions?: number
  maxTokensPerMonth?: number
  maxAPICallsPerDay?: number
  maxConcurrentJobs?: number
}

export interface UserUsage {
  sessionsThisMonth: number
  tokensThisMonth: number
  apiCallsToday: number
  lastReset: Date | string
}

export interface SlackIntegration {
  isConnected: boolean
  teamId?: string
  teamName?: string
  channelId?: string
  channelName?: string
  accessToken?: string
  connectedAt?: Date | string
}

export interface SystemSettings {
  currentModel: string
  models: ModelConfig[]
  securityMode: SecurityMode
  apiKeys: Record<AIProvider, string>
  slack?: SlackIntegration
  embeddingProvider: AIProvider[]
}
