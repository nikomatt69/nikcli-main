// Background Agents API Client SDK
// Connects CLI to cloud-deployed API services

import axios, { type AxiosInstance } from 'axios'
import { WebSocket } from 'ws'
import type { BackgroundJob, CreateBackgroundJobRequest, JobStatus } from '../types'

export interface BackgroundAgentsClientConfig {
  baseUrl?: string
  timeout?: number
  apiKey?: string
  retries?: number
}

export interface JobFilters {
  status?: JobStatus
  limit?: number
  offset?: number
  repo?: string
}

export interface JobStats {
  total: number
  pending: number
  running: number
  completed: number
  failed: number
}

export interface CreateJobOptions {
  provider?: 'anthropic' | 'openai' | 'google' | 'mistral' | 'openrouter' | 'xai' | 'ollama' | string
  model?: string
  apiKey?: string
}

/**
 * Client SDK for interacting with cloud-deployed Background Agents API
 */
export class BackgroundAgentsClient {
  private client: AxiosInstance
  private baseUrl: string
  private wsUrl: string

  constructor(config: BackgroundAgentsClientConfig = {}) {
    // Priority: config > env variable > default cloud URL
    this.baseUrl =
      config.baseUrl ||
      process.env.NIKCLI_API_URL ||
      process.env.BACKGROUND_AGENTS_API_URL ||
      'https://nikcli-api.railway.app'

    this.wsUrl = this.baseUrl.replace(/^http/, 'ws')

    this.client = axios.create({
      baseURL: `${this.baseUrl}/v1`,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey && { Authorization: `Bearer ${config.apiKey}` }),
      },
    })

    // Setup retry logic
    this.setupRetryInterceptor(config.retries || 3)
  }

  /**
   * Setup axios retry interceptor
   */
  private setupRetryInterceptor(maxRetries: number): void {
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const config = error.config

        if (!config || !config.retry) {
          config.retry = 0
        }

        if (config.retry >= maxRetries) {
          return Promise.reject(error)
        }

        config.retry += 1

        // Exponential backoff
        const delay = Math.min(1000 * 2 ** config.retry, 10000)
        await new Promise((resolve) => setTimeout(resolve, delay))

        return this.client(config)
      }
    )
  }

  /**
   * Health check - verify API is accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/health`, {
        timeout: 5000,
      })
      return response.status === 200
    } catch {
      return false
    }
  }

  /**
   * Get API server info and version
   */
  async getServerInfo(): Promise<{
    status: string
    version: string
    timestamp: string
    uptime: number
  }> {
    const response = await axios.get(`${this.baseUrl}/health`)
    return response.data
  }

  /**
   * Create a new background job
   */
  async createJob(
    request: CreateBackgroundJobRequest,
    options: CreateJobOptions = {}
  ): Promise<{
    jobId: string
    job: BackgroundJob
  }> {
    const response = await this.client.post('/jobs', request, {
      headers: {
        ...(options.provider ? { 'x-ai-provider': options.provider } : {}),
        ...(options.model ? { 'x-ai-model': options.model } : {}),
        ...(options.apiKey ? { 'x-ai-key': options.apiKey } : {}),
      },
    })
    return response.data
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string): Promise<BackgroundJob> {
    const response = await this.client.get(`/jobs/${jobId}`)
    return response.data.job
  }

  /**
   * List jobs with optional filters
   */
  async listJobs(filters: JobFilters = {}): Promise<{
    jobs: BackgroundJob[]
    total: number
    offset: number
    limit: number
  }> {
    const params = new URLSearchParams()
    if (filters.status) params.append('status', filters.status)
    if (filters.limit) params.append('limit', filters.limit.toString())
    if (filters.offset) params.append('offset', filters.offset.toString())
    if (filters.repo) params.append('repo', filters.repo)

    const response = await this.client.get('/jobs', { params })
    return response.data
  }

  /**
   * Cancel a running job
   */
  async cancelJob(jobId: string): Promise<{ message: string }> {
    const response = await this.client.delete(`/jobs/${jobId}`)
    return response.data
  }

  /**
   * Send follow-up message to job
   */
  async sendFollowUpMessage(
    jobId: string,
    message: string,
    priority: 'low' | 'normal' | 'high' = 'normal'
  ): Promise<{ messageId: string }> {
    const response = await this.client.post(`/jobs/${jobId}/message`, {
      message,
      priority,
    })
    return response.data
  }

  /**
   * Get job statistics
   */
  async getStats(): Promise<{
    jobs: JobStats
    queue: {
      pending: number
      processing: number
      completed: number
      failed: number
    }
  }> {
    const response = await this.client.get('/stats')
    return response.data
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    queue: {
      pending: number
      processing: number
      completed: number
      failed: number
    }
  }> {
    const response = await this.client.get('/queue/stats')
    return response.data
  }

  /**
   * Clear job queue (admin only)
   */
  async clearQueue(): Promise<{ message: string }> {
    const response = await this.client.post('/queue/clear')
    return response.data
  }

  /**
   * Get security violations
   */
  async getSecurityViolations(): Promise<{
    violations: any[]
    total: number
  }> {
    const response = await this.client.get('/security/violations')
    return response.data
  }

  /**
   * Get security report for specific job
   */
  async getJobSecurityReport(jobId: string): Promise<{
    jobId: string
    report: any
  }> {
    const response = await this.client.get(`/security/violations/${jobId}`)
    return response.data
  }

  /**
   * Connect to WebSocket for real-time updates
   */
  connectWebSocket(handlers: {
    onJobCreated?: (job: BackgroundJob) => void
    onJobStarted?: (job: BackgroundJob) => void
    onJobCompleted?: (job: BackgroundJob) => void
    onJobFailed?: (job: BackgroundJob) => void
    onJobLog?: (data: { jobId: string; logEntry: any }) => void
    onHeartbeat?: (data: any) => void
    onError?: (error: Error) => void
    onClose?: () => void
  }): WebSocket {
    const ws = new WebSocket(`${this.wsUrl}/ws`)

    ws.on('open', () => {
      console.log('📡 Connected to Background Agents WebSocket')
    })

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString())

        switch (message.type) {
          case 'job:created':
            handlers.onJobCreated?.(message.data)
            break
          case 'job:started':
            handlers.onJobStarted?.(message.data)
            break
          case 'job:completed':
            handlers.onJobCompleted?.(message.data)
            break
          case 'job:failed':
            handlers.onJobFailed?.(message.data)
            break
          case 'job:log':
            handlers.onJobLog?.(message.data)
            break
          case 'heartbeat':
            handlers.onHeartbeat?.(message.data)
            break
        }
      } catch (error) {
        handlers.onError?.(error as Error)
      }
    })

    ws.on('error', (error) => {
      console.error('📡 WebSocket error:', error)
      handlers.onError?.(error)
    })

    ws.on('close', () => {
      console.log('📡 Disconnected from Background Agents WebSocket')
      handlers.onClose?.()
    })

    return ws
  }

  /**
   * Stream job logs using Server-Sent Events
   */
  async *streamJobLogs(jobId: string): AsyncGenerator<{ type: string; data: any }, void, unknown> {
    const response = await axios.get(`${this.baseUrl}/v1/jobs/${jobId}/stream`, {
      responseType: 'stream',
      timeout: 0, // No timeout for streaming
    })

    const stream = response.data

    let buffer = ''

    for await (const chunk of stream) {
      buffer += chunk.toString()

      const lines = buffer.split('\n\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          try {
            const parsed = JSON.parse(data)
            yield parsed
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  }

  /**
   * Test connection to cloud service
   */
  async testConnection(): Promise<{
    connected: boolean
    latency?: number
    version?: string
    error?: string
  }> {
    const start = Date.now()

    try {
      const isHealthy = await this.healthCheck()

      if (!isHealthy) {
        return {
          connected: false,
          error: 'Health check failed',
        }
      }

      const info = await this.getServerInfo()
      const latency = Date.now() - start

      return {
        connected: true,
        latency,
        version: info.version,
      }
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }
}

/**
 * Create a default client instance
 */
export function createBackgroundAgentsClient(config?: BackgroundAgentsClientConfig): BackgroundAgentsClient {
  return new BackgroundAgentsClient(config)
}
