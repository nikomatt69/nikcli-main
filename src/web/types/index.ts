// Web interface types for Background Agents
import type { BackgroundJob, CreateBackgroundJobRequest } from '../../cli/background-agents/types'

export interface WebConfig {
  github: {
    token: string | null
    username: string | null
    repositories: GitHubRepository[]
  }
  defaultModel: string
  defaultRepository: string | null
  notifications: {
    slack: boolean
    email: boolean
  }
}

export interface GitHubRepository {
  id: number
  name: string
  full_name: string
  description: string | null
  private: boolean
  default_branch: string
  updated_at: string
  language: string | null
}

export interface WebBackgroundJob extends BackgroundJob {
  // Additional web-specific properties
  webCreatedAt: Date
  userInitiated: boolean
  webLogs: WebJobLog[]
}

export interface WebJobLog {
  id: string
  jobId: string
  timestamp: Date
  level: 'info' | 'warn' | 'error' | 'debug' | 'success'
  message: string
  source: string
  step?: string
  data?: any
}

export interface CreateWebJobRequest extends CreateBackgroundJobRequest {
  repositoryId: number
  repositoryName: string
  createSnapshot: boolean
  notifyOnCompletion: boolean
  autoCreatePR: boolean
}

export interface ProjectSnapshot {
  id: string
  name: string
  repository: string
  branch: string
  commit: string
  createdAt: Date
  size: number
  description?: string
  metadata: {
    totalFiles: number
    languages: string[]
    lastModified: Date
  }
}

export interface WebJobStats {
  total: number
  active: number
  completed: number
  failed: number
  todayActive: number
  weeklyActive: number
  averageCompletionTime: number
}

export interface NotificationSettings {
  slack: {
    enabled: boolean
    webhook: string | null
    channel: string | null
  }
  email: {
    enabled: boolean
    recipients: string[]
  }
  desktop: {
    enabled: boolean
  }
}

export interface WebSocketMessage {
  type: 'job:created' | 'job:started' | 'job:completed' | 'job:failed' | 'job:log' | 'heartbeat'
  data: any
  timestamp: Date
}

export interface APIResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}
