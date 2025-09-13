// src/web/lib/api-client.ts

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
  timestamp: string
}

export interface PaginatedApiResponse<T = any> extends ApiResponse<T[]> {
  pagination?: {
    total: number
    offset: number
    limit: number
    hasMore: boolean
  }
}

export interface BackgroundJob {
  id: string
  repo: string
  baseBranch?: string
  workBranch: string
  task: string
  playbook?: string
  envVars?: Record<string, string>
  limits: {
    timeMin: number
    maxToolCalls: number
    maxMemoryMB: number
  }
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timeout'
  createdAt: string
  startedAt?: string
  completedAt?: string
  error?: string
  prUrl?: string
  logs: Array<{
    timestamp: string
    level: 'info' | 'warn' | 'error' | 'debug'
    message: string
    source: string
  }>
  artifacts: Array<{
    id: string
    name: string
    type: 'file' | 'image' | 'log' | 'report'
    path: string
    size: number
    createdAt: string
  }>
  metrics: {
    tokenUsage: number
    toolCalls: number
    executionTime: number
    memoryUsage: number
  }
  followUpMessages: Array<{
    id: string
    message: string
    priority: 'low' | 'normal' | 'high'
    createdAt: string
  }>
}

export interface CreateJobRequest {
  repo: string
  baseBranch?: string
  task: string
  playbook?: string
  envVars?: Record<string, string>
  limits?: {
    timeMin?: number
    maxToolCalls?: number
    maxMemoryMB?: number
  }
  priority?: number
}

export interface JobStats {
  total: number
  queued: number
  running: number
  succeeded: number
  failed: number
  cancelled: number
  computed: {
    totalCompleted: number
    successRate: number
    activeJobs: number
    completionRate: number
  }
  timestamp: string
  uptime: number
}

class ApiClient {
  private baseUrl: string

  constructor() {
    this.baseUrl = process.env.NODE_ENV === 'production' ? `${window.location.origin}/v1` : 'http://localhost:3000/v1'
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`

    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        message: 'Network error occurred',
        timestamp: new Date().toISOString(),
      }))

      throw new Error(errorData.message || errorData.error || 'API request failed')
    }

    return response.json()
  }

  // Jobs API
  async createJob(jobRequest: CreateJobRequest): Promise<ApiResponse<{ jobId: string; job: BackgroundJob }>> {
    return this.request('/jobs', {
      method: 'POST',
      body: JSON.stringify(jobRequest),
    })
  }

  async getJobs(params?: {
    status?: string
    repo?: string
    limit?: number
    offset?: number
  }): Promise<PaginatedApiResponse<BackgroundJob>> {
    const searchParams = new URLSearchParams()
    if (params?.status) searchParams.set('status', params.status)
    if (params?.repo) searchParams.set('repo', params.repo)
    if (params?.limit) searchParams.set('limit', params.limit.toString())
    if (params?.offset) searchParams.set('offset', params.offset.toString())

    const endpoint = `/jobs${searchParams.toString() ? `?${searchParams}` : ''}`
    return this.request(endpoint)
  }

  async getJob(jobId: string): Promise<ApiResponse<{ job: BackgroundJob }>> {
    return this.request(`/jobs/${jobId}`)
  }

  async cancelJob(jobId: string): Promise<ApiResponse<{ jobId: string; cancelled: boolean }>> {
    return this.request(`/jobs/${jobId}`, {
      method: 'DELETE',
    })
  }

  async sendFollowUpMessage(
    jobId: string,
    message: string,
    priority: 'low' | 'normal' | 'high' = 'normal'
  ): Promise<ApiResponse<{ messageId: string }>> {
    return this.request(`/jobs/${jobId}/message`, {
      method: 'POST',
      body: JSON.stringify({ message, priority }),
    })
  }

  // Stats API
  async getStats(): Promise<ApiResponse<JobStats>> {
    return this.request('/stats')
  }

  async getQueueStats(): Promise<ApiResponse<any>> {
    return this.request('/queue/stats')
  }

  async clearOldJobs(): Promise<ApiResponse<{ clearedJobs: number }>> {
    return this.request('/queue/clear', {
      method: 'POST',
    })
  }

  // Job streaming (Server-Sent Events)
  createJobStream(jobId: string): EventSource {
    const url = `${this.baseUrl}/jobs/${jobId}/stream`
    return new EventSource(url)
  }

  // Utility methods
  async healthCheck(): Promise<{ healthy: boolean; timestamp: string }> {
    try {
      const healthUrl =
        process.env.NODE_ENV === 'production' ? `${window.location.origin}/health` : 'http://localhost:3000/health'

      const response = await fetch(healthUrl)
      const data = await response.json()
      return { healthy: response.ok, timestamp: data.timestamp }
    } catch (_error) {
      return { healthy: false, timestamp: new Date().toISOString() }
    }
  }
}

// Export singleton instance
export const apiClient = new ApiClient()

// Export hook for React components
export function useApiClient() {
  return apiClient
}
