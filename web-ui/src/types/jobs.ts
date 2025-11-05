/**
 * Background Job Types
 * Aligned with NikCLI backend agent system
 */

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timeout'

export type JobLogLevel = 'info' | 'warn' | 'error' | 'debug'

export type ArtifactType = 'report' | 'diff' | 'coverage' | 'log' | 'other'

export interface JobLimits {
  timeMin: number
  maxToolCalls: number
  maxMemoryMB: number
}

export interface JobMetrics {
  tokenUsage: number
  toolCalls: number
  executionTime: number
  memoryUsage: number
}

export interface JobLog {
  timestamp: Date | string
  level: JobLogLevel
  message: string
  source: string
  step?: string
}

export interface JobArtifact {
  type: ArtifactType
  path: string
  size: number
  createdAt: Date | string
}

export interface GitHubContext {
  issueNumber?: number
  repository: string
  author: string
  event?: string
}

export interface FollowUpMessage {
  id: string
  timestamp: Date | string
  message: string
  role: 'user' | 'assistant'
}

export interface BackgroundJob {
  id: string
  repo: string
  baseBranch: string
  workBranch: string
  task: string
  playbook?: string
  envVars?: Record<string, string>
  limits: JobLimits
  status: JobStatus
  createdAt: Date | string
  startedAt?: Date | string
  completedAt?: Date | string
  error?: string
  logs: JobLog[]
  artifacts: JobArtifact[]
  prUrl?: string
  metrics: JobMetrics
  followUpMessages: FollowUpMessage[]
  githubContext?: GitHubContext
  containerId?: string
}

export interface CreateJobRequest {
  repo: string
  baseBranch?: string
  task: string
  playbook?: string
  envVars?: Record<string, string>
  limits?: Partial<JobLimits>
  githubContext?: GitHubContext
}

export interface JobListFilters {
  status?: JobStatus | JobStatus[]
  repo?: string
  dateFrom?: Date | string
  dateTo?: Date | string
  limit?: number
  offset?: number
}

export interface JobStats {
  total: number
  queued: number
  running: number
  succeeded: number
  failed: number
  cancelled: number
  avgExecutionTime: number
  totalTokenUsage: number
}

export interface QueueStats {
  waiting: number
  processing: number
  completed: number
  failed: number
  maxConcurrentJobs: number
}
