export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timeout';

export interface JobLimits {
  timeMin: number;
  maxToolCalls: number;
  maxMemoryMB: number;
}

export interface JobLog {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source: string;
  step?: string;
}

export interface JobMetrics {
  tokenUsage: number;
  toolCalls: number;
  executionTime: number;
  memoryUsage: number;
}

export interface BackgroundJob {
  id: string;
  repo: string;
  baseBranch: string;
  workBranch: string;
  task: string;
  playbook?: string;
  envVars?: Record<string, string>;
  limits: JobLimits;
  status: JobStatus;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  logs: JobLog[];
  prUrl?: string;
  metrics: JobMetrics;
  containerId?: string;
}

export interface CreateBackgroundJobRequest {
  repo: string;
  baseBranch: string;
  task: string;
  playbook?: string;
  envVars?: Record<string, string>;
  limits?: Partial<JobLimits>;
  reviewers?: string[];
  labels?: string[];
  draft?: boolean;
}

export interface BackgroundJobStats {
  total: number;
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  cancelled: number;
}
