// src/cli/background-agents/types.ts

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
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
  error?: string
  logs: JobLog[]
  artifacts: JobArtifact[]
  prUrl?: string
  metrics: JobMetrics
  followUpMessages: FollowUpMessage[]
}

export interface JobLimits {
  timeMin: number
  maxToolCalls: number
  maxMemoryMB: number
}

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timeout'

export interface JobLog {
  timestamp: Date
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  source: string
  step?: string
}

export interface JobArtifact {
  name: string
  type: 'report' | 'diff' | 'coverage' | 'log'
  path: string
  size: number
  createdAt: Date
}

export interface JobMetrics {
  tokenUsage: number
  toolCalls: number
  executionTime: number
  memoryUsage: number
}

export interface FollowUpMessage {
  id: string
  message: string
  priority: 'low' | 'normal' | 'high'
  createdAt: Date
  processedAt?: Date
}

export interface NikEnvironment {
  snapshot: 'auto' | 'manual' | 'disabled'
  install: string
  start?: string
  terminals: TerminalConfig[]
  secrets: string[]
  node?: string
  cache: string[]
  policies?: EnvironmentPolicies
}

export interface TerminalConfig {
  name: string
  command: string
  autoStart?: boolean
  persistent?: boolean
}

export interface EnvironmentPolicies {
  maxMemoryMB?: number
  maxCpuPercent?: number
  networkPolicy?: 'restricted' | 'allow' | 'deny'
  allowedDomains?: string[]
  timeoutMinutes?: number
  allowedCommands?: string[]
  blockedCommands?: string[]
  maxFileSize?: number
}

export interface NikPlaybook {
  name: string
  agent: string
  goals: string[]
  limits: PlaybookLimits
  policy: PlaybookPolicy
  steps: PlaybookStep[]
  commit: CommitConfig
}

export interface PlaybookLimits {
  max_tool_calls: number
  max_time_minutes: number
  max_memory_mb?: number
}

export interface PlaybookPolicy {
  approve_commands: boolean
  network_allow: string[]
  file_restrictions?: string[]
  safe_mode?: boolean
}

export interface PlaybookStep {
  run: string
  condition?: string
  retry_on_failure?: boolean
  timeout_minutes?: number
}

export interface CommitConfig {
  message: string
  open_pr: boolean
  reviewers?: string[]
  labels?: string[]
  draft?: boolean
}

export interface BackgroundAgentConfig {
  workspaceRoot: string
  maxConcurrentJobs: number
  github: GitHubConfig
  storage: StorageConfig
  security: SecurityConfig
}

export interface GitHubConfig {
  appId: string
  privateKey: string
  installationId: string
  webhookSecret: string
}

export interface StorageConfig {
  artifacts: string
  snapshots: string
  type: 'local' | 's3'
  s3?: {
    endpoint: string
    accessKey: string
    secretKey: string
    bucket: string
  }
}

export interface SecurityConfig {
  enableSandbox: boolean
  resourceLimits: ResourceLimits
  allowedDomains: string[]
  deniedCommands: string[]
}

export interface ResourceLimits {
  maxMemoryMB: number
  maxCpuPercent: number
  maxExecutionTime: number
  maxTokens: number
  maxToolCalls: number
  maxFileSize: number
  maxNetworkRequests: number
}

export interface HeadlessOptions {
  yes: boolean
  noTty: boolean
  jsonlLogs: boolean
  cwd: string
  outputFile?: string
  maxTokens?: number
  timeout?: number
  allowCommands?: string[]
  denyCommands?: string[]
  allowNetwork?: string[]
  safeMode?: boolean
}

export interface CreateBackgroundJobRequest {
  repo: string
  baseBranch: string
  workBranch?: string
  task: string
  playbook?: string
  envVars?: Record<string, string>
  limits?: Partial<JobLimits>
  priority?: number
  reviewers?: string[]
  labels?: string[]
  draft?: boolean
}

export interface QueueStats {
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
}
